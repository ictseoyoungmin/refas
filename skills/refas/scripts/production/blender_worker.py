#!/usr/bin/env python3
"""Execute one trusted production script inside Blender and observe its output.

Run with Blender, not the host Python interpreter::

    blender -b --factory-startup --threads 2 --python-exit-code 1 \
        --python blender_worker.py -- --job job.json

This worker does not judge reference likeness or game readiness. The native
scene is the editable source; the GLB and review renders are derived products.
Diagnostic lights and cameras are created only after saving/exporting it.
"""
from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import runpy
import sys
import traceback

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from review import validate_review

import bpy
from mathutils import Vector


SCHEMA = "refas.production.result/v2"
VIEWS = {"hero": (1.45, -2.2, 1.15), "front": (0, -1, 0),
         "side": (1, 0, 0), "back": (0, 1, 0), "top": (0, 0, 1)}
ASSET_TYPES = {"MESH", "ARMATURE", "EMPTY"}
LIMITATIONS = [
    "Diagnostic views are unregistered; they do not establish reference likeness.",
    "GLB reimport checks geometry counts, bounds and basic feature presence, not visual equivalence.",
    "Fingerprints cover the recorded state at the current frame, not all animation or simulation states.",
    "Node-group internals and drivers are not exhaustively represented by the state fingerprints.",
    "Static mesh modifiers are evaluated for GLB export; unapplied non-armature modifiers on skinned or shape-key meshes are unsupported.",
    "Hidden or excluded meshes are rejected by this alpha so GLB export and diagnostic renders cannot silently use different asset scopes.",
    "Object instances must be realized into explicit scene objects; curves and other non-mesh geometry must be converted before production inspection or export.",
    "Procedural Blender materials may need baking for faithful GLB appearance.",
]


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                    allow_nan=False).encode()).hexdigest()


def file_hash(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def number(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("Scene contains a non-finite numeric value")
    return round(value, 8)


def vector(value):
    return [number(x) for x in value]


def values_hash(collection, name, width=1, code="f"):
    values = array(code, [0]) * (len(collection) * width)
    collection.foreach_get(name, values)
    return hashlib.sha256(values.tobytes()).hexdigest()


def properties(owner, excluded=()):
    """Record scalar RNA properties without traversing Blender's object graph."""
    result = {}
    for prop in owner.bl_rna.properties:
        key = prop.identifier
        if key in excluded or key == "rna_type" or prop.is_readonly:
            continue
        if prop.type not in {"BOOLEAN", "INT", "FLOAT", "STRING", "ENUM"}:
            continue
        value = getattr(owner, key)
        if getattr(prop, "is_array", False):
            value = [number(x) if isinstance(x, float) else x for x in value]
        elif isinstance(value, float):
            value = number(value)
        elif isinstance(value, set):
            value = sorted(value)
        result[key] = value
    return result


def image_record(image):
    packed = list(image.packed_files) if image.packed_files else []
    if packed:
        contents = [hashlib.sha256(x.packed_file.data).hexdigest() for x in packed]
    elif image.packed_file:
        contents = [hashlib.sha256(image.packed_file.data).hexdigest()]
    else:
        contents = []
    return {"name": image.name, "source": image.source, "size": list(image.size),
            "colorSpace": image.colorspace_settings.name, "packedSha256": contents}


def material_record(material):
    if material is None:
        return None
    state = {"name": material.name, "diffuseColor": vector(material.diffuse_color),
             "metallic": number(material.metallic), "roughness": number(material.roughness),
             "useNodes": material.use_nodes}
    if material.use_nodes and material.node_tree:
        nodes = []
        for node in sorted(material.node_tree.nodes, key=lambda x: x.name):
            entry = {"name": node.name, "type": node.bl_idname,
                     "properties": properties(node, {"location", "width", "height", "select", "label"}),
                     "inputs": []}
            for socket in node.inputs:
                value = getattr(socket, "default_value", None)
                if isinstance(value, (str, bool, int)) or value is None:
                    pass
                elif isinstance(value, float):
                    value = number(value)
                elif hasattr(value, "__len__"):
                    value = vector(value)
                else:
                    value = getattr(value, "name", None)
                entry["inputs"].append({"identifier": socket.identifier, "value": value})
            if getattr(node, "image", None):
                entry["image"] = image_record(node.image)
            if getattr(node, "color_ramp", None):
                entry["ramp"] = {"interpolation": node.color_ramp.interpolation,
                                 "elements": [[number(e.position), vector(e.color)] for e in node.color_ramp.elements]}
            if getattr(node, "node_tree", None):
                entry["nodeGroup"] = node.node_tree.name
            nodes.append(entry)
        state["nodes"] = nodes
        state["links"] = sorted([link.from_node.name, link.from_socket.identifier,
                                 link.to_node.name, link.to_socket.identifier]
                                for link in material.node_tree.links)
    state["fingerprint"] = digest(state)
    return state


def mesh_record(mesh):
    mesh.calc_loop_triangles()
    return {"vertices": len(mesh.vertices), "edges": len(mesh.edges),
            "polygons": len(mesh.polygons), "triangles": len(mesh.loop_triangles),
            "positions": values_hash(mesh.vertices, "co", 3),
            "edgeVertices": values_hash(mesh.edges, "vertices", 2, "i"),
            "loopVertices": values_hash(mesh.loops, "vertex_index", code="i"),
            "polygonSizes": values_hash(mesh.polygons, "loop_total", code="i"),
            "materialIndices": values_hash(mesh.polygons, "material_index", code="i"),
            "smoothPolygons": values_hash(mesh.polygons, "use_smooth", code="b"),
            "uvLayers": [{"name": layer.name, "coordinates": values_hash(layer.data, "uv", 2),
                          "activeRender": layer.active_render} for layer in mesh.uv_layers],
            "colorAttributes": [{"name": attr.name, "domain": attr.domain, "type": attr.data_type,
                                 "colors": values_hash(attr.data, "color", 4)} for attr in mesh.color_attributes]}


def action_record(action):
    if action is None:
        return None
    curves = []
    for curve in getattr(action, "fcurves", []):
        curves.append({"path": curve.data_path, "index": curve.array_index,
                       "points": [[vector(p.co), vector(p.handle_left), vector(p.handle_right),
                                   p.interpolation] for p in curve.keyframe_points]})
    return {"name": action.name, "curves": curves}


def object_record(obj, depsgraph):
    state = {"name": obj.name, "type": obj.type, "parent": obj.parent.name if obj.parent else None,
             "parentType": obj.parent_type, "parentBone": obj.parent_bone,
             "matrixWorld": [vector(row) for row in obj.matrix_world],
             "matrixLocal": [vector(row) for row in obj.matrix_local],
             "hideRender": obj.hide_render, "hideViewport": obj.hide_viewport,
             "modifiers": [{"type": m.type, "properties": properties(m),
                            "object": getattr(getattr(m, "object", None), "name", None)} for m in obj.modifiers],
             "constraints": [{"type": c.type, "properties": properties(c),
                              "target": getattr(getattr(c, "target", None), "name", None)} for c in obj.constraints]}
    if obj.type == "MESH":
        state["mesh"] = mesh_record(obj.data)
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        try:
            state["evaluatedMesh"] = mesh_record(mesh)
        finally:
            evaluated.to_mesh_clear()
        state["materialSlots"] = [{"link": slot.link, "material": material_record(slot.material)}
                                  for slot in obj.material_slots]
        groups = {group.index: group.name for group in obj.vertex_groups}
        weights = [[vertex.index, [[groups.get(g.group), number(g.weight)] for g in vertex.groups]]
                   for vertex in obj.data.vertices if vertex.groups]
        state["vertexGroups"] = [group.name for group in obj.vertex_groups]
        state["weights"] = digest(weights)
        state["shapeKeys"] = []
        if obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:
                state["shapeKeys"].append({"name": key.name, "value": number(key.value),
                                          "relativeKey": key.relative_key.name,
                                          "positions": values_hash(key.data, "co", 3)})
    if obj.type == "ARMATURE":
        state["bones"] = [{"name": bone.name, "parent": bone.parent.name if bone.parent else None,
                           "head": vector(bone.head_local), "tail": vector(bone.tail_local),
                           "matrix": [vector(row) for row in bone.matrix_local], "deform": bone.use_deform}
                          for bone in sorted(obj.data.bones, key=lambda x: x.name)]
        state["pose"] = [{"name": bone.name, "matrix": [vector(row) for row in bone.matrix]}
                         for bone in sorted(obj.pose.bones, key=lambda x: x.name)]
    animation = obj.animation_data
    if animation:
        state["animation"] = {"action": action_record(animation.action),
                              "tracks": [{"name": track.name, "strips": [
                                  {"name": strip.name, "start": number(strip.frame_start),
                                   "end": number(strip.frame_end), "action": action_record(strip.action)}
                                  for strip in track.strips]} for track in animation.nla_tracks]}
    state["fingerprint"] = digest(state)
    return state


def bounds(objects, depsgraph):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        raise ValueError("No mesh objects to observe or export")
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    return {"min": vector(low), "max": vector(high), "dimensions": vector(high - low)}


def inventory():
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    objects = list(bpy.context.scene.objects)
    rows = [object_record(obj, depsgraph) for obj in sorted(objects, key=lambda x: x.name)]
    meshes = [row for row in rows if row["type"] == "MESH"]
    result = {"schema": "refas.production.scene/v2", "blenderVersion": bpy.app.version_string,
              "frame": bpy.context.scene.frame_current, "objects": rows,
              "units": {"system": bpy.context.scene.unit_settings.system,
                        "scaleLength": number(bpy.context.scene.unit_settings.scale_length)},
              "statistics": {"objects": len(rows), "meshes": len(meshes),
                             "vertices": sum(row["evaluatedMesh"]["vertices"] for row in meshes),
                             "triangles": sum(row["evaluatedMesh"]["triangles"] for row in meshes),
                             "armatures": sum(row["type"] == "ARMATURE" for row in rows),
                             "shapeKeyObjects": sum(bool(row["shapeKeys"]) for row in meshes),
                             "uvObjects": sum(bool(row["mesh"]["uvLayers"]) for row in meshes),
                             "materialSlots": sum(len(row["materialSlots"]) for row in meshes)},
              "bounds": bounds(objects, depsgraph), "limitations": LIMITATIONS}
    result["fingerprint"] = digest({"frame": result["frame"], "units": result["units"], "objects": rows})
    return result


def require_visible_meshes():
    """Keep one honest asset scope until hidden authoring helpers are supported."""
    render_visible = set()

    def visit(collection, hidden=False):
        hidden = hidden or collection.hide_render
        if not hidden:
            render_visible.update(obj.name for obj in collection.objects)
        for child in collection.children:
            visit(child, hidden)

    visit(bpy.context.scene.collection)
    hidden = [obj.name for obj in bpy.context.scene.objects if obj.type == "MESH"
              and (obj.hide_render or obj.name not in render_visible
                   or not obj.visible_get(view_layer=bpy.context.view_layer))]
    if hidden:
        raise ValueError("Hidden or excluded meshes are unsupported by the production alpha; "
                         "unhide them or remove helper geometry from the asset scene: "
                         + ", ".join(sorted(hidden)))


def require_supported_objects():
    """Do not silently omit native renderable types from export or observation."""
    instanced = [obj.name for obj in bpy.context.scene.objects if obj.instance_type != "NONE"]
    if instanced:
        raise ValueError("Object instancing is unsupported by the production alpha; realize instances "
                         "into explicit scene objects first: " + ", ".join(sorted(instanced)))
    unsupported = [obj.name + ":" + obj.type for obj in bpy.context.scene.objects
                   if obj.type not in ASSET_TYPES | {"CAMERA", "LIGHT"}]
    if unsupported:
        raise ValueError("Convert unsupported geometry to meshes before production export or inspection: "
                         + ", ".join(unsupported))


def require_portable_scene():
    """Support self-contained native geometry and packed still textures explicitly."""
    require_visible_meshes()
    require_supported_objects()
    if bpy.data.libraries:
        raise ValueError("Linked Blender libraries are unsupported; make required data local first")
    for kind in ("movieclips", "cache_files", "sounds"):
        if any(item.users for item in getattr(bpy.data, kind, [])):
            raise ValueError("External " + kind + " are outside the current portable-scene contract")
    for image in bpy.data.images:
        if not image.users or image.type in {"RENDER_RESULT", "COMPOSITING"}:
            continue
        if image.source not in {"FILE", "GENERATED"}:
            raise ValueError("Only still image textures can be packed: " + image.name)
        packed = bool(image.packed_file or image.packed_files)
        if image.is_dirty or not packed:
            if not packed and image.source == "FILE" and not Path(bpy.path.abspath(image.filepath)).is_file():
                raise FileNotFoundError("Missing texture: " + image.name)
            # A packed file can still contain the old pixels after an in-memory
            # paint/edit. Refresh it before both fingerprinting and native save.
            image.pack()
        if not image.packed_file and not image.packed_files:
            raise ValueError("Texture could not be packed: " + image.name)
    bpy.ops.file.pack_all()


def glb_counts(path):
    data = Path(path).read_bytes()
    if data[:4] != b"glTF" or int.from_bytes(data[4:8], "little") != 2:
        raise ValueError("Exporter did not write a GLB 2 file")
    length = int.from_bytes(data[12:16], "little")
    if data[16:20] != b"JSON":
        raise ValueError("GLB JSON chunk missing")
    document = json.loads(data[20:20 + length])
    triangles = 0
    for node in document.get("nodes", []):
        if "mesh" not in node:
            continue
        for primitive in document["meshes"][node["mesh"]]["primitives"]:
            if primitive.get("mode", 4) != 4:
                raise ValueError("Only triangle GLB primitives are supported by the current verification")
            accessor = primitive.get("indices", primitive["attributes"]["POSITION"])
            triangles += document["accessors"][accessor]["count"] // 3
    return {"nodes": len(document.get("nodes", [])), "meshes": len(document.get("meshes", [])),
            "triangles": triangles, "materials": len(document.get("materials", [])),
            "skins": len(document.get("skins", [])), "animations": len(document.get("animations", [])),
            "cameras": len(document.get("cameras", [])),
            "lights": len(document.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])),
            "morphMeshes": sum(any(p.get("targets") for p in mesh["primitives"])
                               for mesh in document.get("meshes", []))}


def verify_glb(path, source):
    encoded = glb_counts(path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError("GLB reimport did not finish")
    observed = inventory()
    checks = {"trianglesMatchEncoded": observed["statistics"]["triangles"] == encoded["triangles"],
              "trianglesMatchNative": observed["statistics"]["triangles"] == source["statistics"]["triangles"],
              "nonEmpty": observed["statistics"]["meshes"] > 0,
              "noDiagnosticCamerasOrLights": encoded["cameras"] == 0 and encoded["lights"] == 0}
    extent = max(source["bounds"]["dimensions"])
    tolerance = max(extent * 1e-4, 1e-6)
    checks["boundsMatchNative"] = all(abs(a - b) <= tolerance
                                     for side in ("min", "max")
                                     for a, b in zip(source["bounds"][side], observed["bounds"][side]))
    if source["statistics"]["armatures"]:
        checks["skinPresent"] = encoded["skins"] > 0
    if source["statistics"]["shapeKeyObjects"]:
        checks["morphsPresent"] = encoded["morphMeshes"] > 0
    if not all(checks.values()):
        raise ValueError("GLB round-trip verification failed: " + json.dumps(checks, sort_keys=True))
    return {"status": "passed", "checks": checks, "encoded": encoded,
            "reimportedStatistics": observed["statistics"], "reimportedBounds": observed["bounds"],
            "boundsTolerance": tolerance, "scope": "geometry counts, bounds and basic feature presence only"}


def export_scene(out):
    scene = bpy.context.scene
    objects = list(scene.objects)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    realized = []
    for obj in objects:
        if obj.type != "MESH" or not obj.modifiers:
            continue
        deformable = bool(obj.data.shape_keys) or any(m.type == "ARMATURE" for m in obj.modifiers)
        if deformable:
            unsupported = [m.name for m in obj.modifiers if m.type != "ARMATURE"
                           and (m.show_viewport or m.show_render)]
            if unsupported:
                raise ValueError("Unapplied modifiers on skinned or shape-key meshes are unsupported: "
                                 + obj.name + " (" + ", ".join(unsupported) + ")")
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                              depsgraph=depsgraph)
        realized.append((obj, mesh))
    # Only this disposable in-memory export state is changed. The native scene
    # was saved first and is reopened after export. Gather meshes before changing
    # any objects so dependent modifiers see the same original dependency graph.
    for obj, mesh in realized:
        obj.data = mesh
        obj.modifiers.clear()
    for obj in objects:
        obj.select_set(obj.type in ASSET_TYPES)
    selected = [obj for obj in objects if obj.type in ASSET_TYPES]
    bpy.context.view_layer.objects.active = next((obj for obj in selected if obj.type == "MESH"), None)
    result = bpy.ops.export_scene.gltf(filepath=str(out / "asset.glb"), export_format="GLB",
                                      use_selection=True, export_cameras=False, export_lights=False,
                                      export_animations=True, export_apply=False, export_extras=False,
                                      export_texcoords=True, export_normals=True, export_materials="EXPORT")
    if "FINISHED" not in result:
        raise RuntimeError("GLB export did not finish")


def render_views(out, views, config, source, specification=None):
    if not views:
        return []
    original = bpy.context.scene
    review = bpy.data.scenes.new("__RefAsDiagnosticScene")
    for obj in original.objects:
        if obj.type in ASSET_TYPES:
            review.collection.objects.link(obj)
    bpy.context.window.scene = review
    review.frame_set(original.frame_current)
    review.render.engine = "CYCLES"
    review.cycles.device = "CPU"
    review.cycles.samples = config["samples"]
    # Some Blender builds ship Cycles without OpenImageDenoise. Keep the
    # diagnostic backend explicit and portable instead of failing after export.
    review.cycles.use_denoising = False
    review.cycles.use_adaptive_sampling = False
    review.cycles.seed = 0
    review.render.threads_mode = "FIXED"
    review.render.threads = 2
    review.render.resolution_x = review.render.resolution_y = config["size"]
    review.render.resolution_percentage = 100
    review.render.image_settings.file_format = "PNG"
    review.render.image_settings.color_mode = "RGBA"
    review.render.film_transparent = specification["transparent"] if specification else False
    review.view_settings.view_transform = "AgX"
    review.world = bpy.data.worlds.new("__RefAsDiagnosticWorld")
    review.world.use_nodes = True
    background = next(node for node in review.world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (*specification["background"], 1) if specification else (0.065, 0.08, 0.115, 1)
    background.inputs["Strength"].default_value = 0.45
    low, high = Vector(source["bounds"]["min"]), Vector(source["bounds"]["max"])
    center = (low + high) / 2
    radius = max((high - low).length / 2, 0.001)
    if specification:
        center = Vector(specification["lighting"]["center"])
        radius = specification["lighting"]["radius"]
    fixed_views = {view["name"]: view for view in specification["views"]} if specification else {}
    for name, direction, energy, color, scale in [
            ("Key", (-1.4, -1.8, 2.4), 650, (1, 0.94, 0.86), 2.0),
            ("Fill", (1.8, -0.6, 0.8), 300, (0.72, 0.82, 1), 1.8),
            ("Rim", (0.6, 1.5, 2), 900, (0.75, 0.86, 1), 1.3)]:
        data = bpy.data.lights.new("__RefAs" + name, "AREA")
        data.energy, data.color, data.shape, data.size = energy * radius * radius, color, "DISK", radius * scale
        light = bpy.data.objects.new(data.name, data)
        review.collection.objects.link(light)
        light.location = center + Vector(direction) * radius
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    data = bpy.data.cameras.new("__RefAsCamera")
    data.type = "ORTHO"
    data.ortho_scale = radius * 2.35
    data.clip_start, data.clip_end = radius * 0.01, radius * 20
    camera = bpy.data.objects.new("__RefAsCamera", data)
    review.collection.objects.link(camera)
    review.camera = camera
    observed = []
    for name in views:
        selected = fixed_views.get(name)
        target = Vector(selected["target"]) if selected else center
        if selected:
            camera.location = Vector(selected["position"])
            data.ortho_scale = selected["orthoScale"]
            distance = (camera.location - target).length
            data.clip_start = min(distance, data.ortho_scale) * 0.001
            data.clip_end = max(distance, data.ortho_scale) * 100
        else:
            camera.location = center + Vector(VIEWS[name]).normalized() * radius * 4
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        filename = "view-" + name + ".png"
        review.render.filepath = str(out / filename)
        bpy.ops.render.render(write_still=True, scene=review.name)
        if not (out / filename).is_file() or (out / filename).stat().st_size == 0:
            raise RuntimeError("Render produced no PNG: " + name)
        observed.append({"view": name, "path": filename, "sha256": file_hash(out / filename),
                         "registration": "unregistered", "sourceSceneFingerprint": source["fingerprint"],
                         "framing": "fixed-review-spec" if selected else "automatic-bounds",
                         "referenceRegion": selected.get("reference") if selected else None,
                         "lighting": {"center": vector(center), "radius": number(radius),
                                      "rig": "three-area-lights/v1"},
                         "renderer": {"engine": "CYCLES", "device": "CPU", "samples": config["samples"],
                                      "size": [config["size"], config["size"]], "viewTransform": "AgX",
                                      "denoising": False, "transparent": review.render.film_transparent,
                                      "worldColor": vector(background.inputs["Color"].default_value[:3]),
                                      "worldStrength": 0.45},
                         "camera": {"projection": "orthographic", "position": vector(camera.location),
                                    "target": vector(target), "orthoScale": number(data.ortho_scale),
                                    "matrixWorld": [vector(row) for row in camera.matrix_world]}})
    bpy.context.window.scene = original
    return observed


def validate_job(job):
    if job.get("operation") not in {"edit", "inspect"}:
        raise ValueError("operation must be edit or inspect")
    out = Path(job["outputDir"])
    if not out.is_absolute():
        raise ValueError("outputDir must be absolute")
    views = job.get("views", [])
    specification = None
    if job.get("reviewSpec"):
        path = Path(job["reviewSpec"])
        if not path.is_absolute() or not path.is_file() or path.stat().st_size > 65536:
            raise ValueError("reviewSpec must be an existing absolute JSON file under 64 KiB")
        specification = validate_review(json.loads(path.read_text(encoding="utf-8")))
    supported = {view["name"] for view in specification["views"]} if specification else set(VIEWS)
    if not isinstance(views, list) or len(views) != len(set(views)) or any(view not in supported for view in views):
        raise ValueError("views must be unique names from: " + ", ".join(sorted(supported)))
    config = job.get("render", {})
    if config.get("engine", "CYCLES") != "CYCLES":
        raise ValueError("Only the explicitly tested CYCLES CPU backend is supported")
    for key, default, low, high in (("size", 384, 64, 2048), ("samples", 8, 1, 256)):
        value = config.get(key, default)
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValueError(f"render.{key} must be an integer between {low} and {high}")
        config[key] = value
    for key in ("baseBlend", "script", "assetGlb"):
        if job.get(key) and (not Path(job[key]).is_absolute() or not Path(job[key]).is_file()):
            raise ValueError(key + " must name an existing absolute file")
    if job["operation"] == "inspect" and not job.get("baseBlend"):
        raise ValueError("inspect requires baseBlend")
    if job["operation"] == "edit" and not job.get("script"):
        raise ValueError("edit requires script")
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise ValueError("outputDir must be empty; do not overwrite earlier evidence")
    return out, views, config, specification


def execute(job):
    out, views, config, specification = validate_job(job)
    if job.get("baseBlend"):
        bpy.ops.wm.open_mainfile(filepath=job["baseBlend"], load_ui=False, use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    result = {"schema": SCHEMA, "ok": False, "operation": job["operation"],
              "blenderVersion": bpy.app.version_string, "outputs": {}, "observations": [],
              "verification": {}, "warnings": list(LIMITATIONS)}
    if job["operation"] == "edit":
        script = Path(job["script"])
        runpy.run_path(str(script), init_globals={"bpy": bpy, "REFAS_OUTPUT_DIR": str(out),
                                                 "REFAS_INPUT_DIR": str(script.parent)}, run_name="__main__")
        if bpy.context.object and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        require_portable_scene()
        before = inventory()
        bpy.ops.wm.save_as_mainfile(filepath=str(out / "scene.blend"), check_existing=False, compress=False)
        export_scene(out)
        bpy.ops.wm.open_mainfile(filepath=str(out / "scene.blend"), load_ui=False, use_scripts=False)
        source = inventory()
        if before["fingerprint"] != source["fingerprint"]:
            raise ValueError("Native scene changed across save/reopen; inspect recorded-state preservation")
        result["verification"]["native"] = {"status": "passed", "reopened": True,
                                               "fingerprintMatches": True, "statistics": source["statistics"]}
        result["verification"]["glb"] = verify_glb(out / "asset.glb", source)
        bpy.ops.wm.open_mainfile(filepath=str(out / "scene.blend"), load_ui=False, use_scripts=False)
        result["outputs"].update(blend="scene.blend", glb="asset.glb")
    else:
        require_visible_meshes()
        require_supported_objects()
        source = inventory()
        result["verification"]["native"] = {"status": "passed", "reopened": True,
                                               "statistics": source["statistics"], "scope": "current-frame inventory"}
        if job.get("assetGlb"):
            result["verification"]["glb"] = verify_glb(Path(job["assetGlb"]), source)
            bpy.ops.wm.open_mainfile(filepath=job["baseBlend"], load_ui=False, use_scripts=False)
    write_json(out / "scene.json", source)
    result["outputs"]["scene"] = "scene.json"
    result["observations"] = render_views(out, views, config, source, specification)
    result["ok"] = True
    write_json(out / "result.json", result)
    print("REFAS_RESULT " + json.dumps({"ok": True, "operation": result["operation"],
                                      "statistics": source["statistics"]}), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    out = Path(job.get("outputDir", "."))
    previous_evidence = out.is_dir() and any(out.iterdir())
    try:
        execute(job)
    except Exception as error:
        # Keep failure evidence without replacing a successful result or hiding the Blender exit code.
        if not previous_evidence and out.is_absolute() and out.is_dir() and not (out / "result.json").exists():
            write_json(out / "result.json", {"schema": SCHEMA, "ok": False,
                                             "operation": job.get("operation"),
                                             "error": {"type": type(error).__name__, "message": str(error)}})
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
