"""Repository-only observation helper; run inside Blender, not an installed skill."""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


def gltf(vector):
    return [float(vector[0]), float(vector[2]), -float(vector[1])]


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def observe(config):
    scene = bpy.context.scene
    camera = scene.camera
    objects = []
    for obj in sorted(scene.objects, key=lambda x: x.name):
        if obj.type != "MESH":
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        world = [obj.matrix_world @ v.co for v in mesh.vertices]
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        triangles, normals = [], []
        for triangle in mesh.loop_triangles:
            triangles.append(list(triangle.vertices))
            normals.append([gltf((normal_matrix @ mesh.corner_normals[i].vector).normalized())
                            for i in triangle.loops])
        materials = []
        for index in sorted({p.material_index for p in mesh.polygons}):
            material = obj.material_slots[index].material
            node = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            materials.append({"slot": index, "name": material.name,
                "baseColorFactor": list(node.inputs["Base Color"].default_value),
                "metallicFactor": float(node.inputs["Metallic"].default_value),
                "roughnessFactor": float(node.inputs["Roughness"].default_value)})
        objects.append({"name": obj.name, "positions": [gltf(v) for v in world],
            "projectedNdc": [list(world_to_camera_view(scene, camera, v))[:2] for v in world],
            "triangles": triangles, "cornerNormals": normals, "materials": materials})
    matrix = camera.matrix_world.to_3x3()
    light_rows = []
    for obj in sorted(scene.objects, key=lambda x: x.name):
        if obj.type == "LIGHT":
            light_rows.append({"name": obj.name, "type": obj.data.type,
                "propagationGltf": gltf((obj.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()),
                "energy": float(obj.data.energy), "rgb": list(obj.data.color),
                "angle": float(obj.data.angle)})
    background = scene.world.node_tree.nodes.get("Background")
    return {"objects": objects,
        "camera": {"type": camera.data.type, "position": gltf(camera.matrix_world.translation),
            "right": gltf(matrix @ Vector((1, 0, 0))), "up": gltf(matrix @ Vector((0, 1, 0))),
            "forward": gltf(matrix @ Vector((0, 0, -1))),
            "fovY": math.degrees(camera.data.angle_y),
            "resolution": [scene.render.resolution_x, scene.render.resolution_y],
            "pixelAspect": [scene.render.pixel_aspect_x, scene.render.pixel_aspect_y],
            "clip": [camera.data.clip_start, camera.data.clip_end]},
        "profile": {"engine": scene.render.engine, "device": scene.cycles.device,
            "samples": scene.cycles.samples, "denoising": scene.cycles.use_denoising,
            "viewTransform": scene.view_settings.view_transform, "look": scene.view_settings.look,
            "exposure": scene.view_settings.exposure, "gamma": scene.view_settings.gamma,
            "filterType": scene.cycles.pixel_filter_type, "filterWidth": scene.cycles.filter_width,
            "worldColor": list(background.inputs["Color"].default_value),
            "worldStrength": float(background.inputs["Strength"].default_value),
            "lights": light_rows},
        "sourceGlbSha256": config["matched"]["sourceGlbSha256"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    config = json.loads(args.config.read_text())
    spec = importlib.util.spec_from_file_location("refas_retained_external_worker", config["worker"])
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    # Both use the unchanged external worker and the exact same GLB/camera.
    # Only SUN propagation direction changes between these two recorded configs.
    worker.render(config["asShippedDirection"])
    worker.render(config["matched"])
    observed = observe(config)
    write(config["observed"], observed)

    # Independent albedo control uses imported base-color factors as emission.
    # This is an explicitly recorded diagnostic override, not a changed asset.
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if principled is None:
            continue
        output = next(n for n in material.node_tree.nodes if n.type == "OUTPUT_MATERIAL")
        emission = material.node_tree.nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = principled.inputs["Base Color"].default_value
        emission.inputs["Strength"].default_value = 1.0
        for link in list(output.inputs["Surface"].links):
            material.node_tree.links.remove(link)
        material.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    scene = bpy.context.scene
    scene.render.film_transparent = True
    scene.cycles.max_bounces = 0
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0
    scene.render.filepath = config["albedo"]
    bpy.ops.render.render(write_still=True)
    write(config["albedoProfile"], {"mode": "imported-base-factor-emission",
        "geometryCameraUnchanged": True, "transparentBackground": True,
        "maxBounces": 0, "worldStrength": 0,
        "viewTransform": scene.view_settings.view_transform, "look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure, "gamma": scene.view_settings.gamma})


if __name__ == "__main__":
    main()
