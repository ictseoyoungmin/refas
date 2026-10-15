#!/usr/bin/env python3
"""Blender/Cycles adapter WORKER, only executable within Blender's Python.

Independent Blender glTF importer + Cycles shading, with source-bound
camera and observed material/color attribute audit. NEVER self-certifies.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Matrix, Vector


def digest_file(path):
    h=hashlib.sha256()
    with open(path,"rb") as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()


def gltf_to_blender(value):
    x,y,z=value
    return Vector((float(x), -float(z), float(y)))


def checked_camera(setting):
    eye=gltf_to_blender(setting["position"])
    aim=gltf_to_blender(setting["target"])
    up=gltf_to_blender(setting["up"])
    forward=(aim-eye).normalized()
    if forward.length<1e-8:
        raise ValueError("R14E_CAMERA_INVALID: coincident position/target")
    right=forward.cross(up).normalized()
    if right.length<1e-8:
        raise ValueError("R14E_CAMERA_INVALID: parallel camera up")
    true_up=right.cross(forward).normalized()
    return eye,Matrix((right,true_up,-forward)).transposed().to_4x4()


def render(config):
    source=Path(config["glb"])
    if digest_file(source)!=config["sourceGlbSha256"]:
        raise ValueError("R14E_SOURCE_MUTATED: GLB changed before Blender import")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    start=time.perf_counter()
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported_ms=round((time.perf_counter()-start)*1000,3)
    objects=[obj for obj in bpy.context.scene.objects if obj.type=="MESH"]
    if not objects:
        raise ValueError("R14E_IMPORT_INVALID: no imported mesh")
    polygons=sum(len(obj.data.polygons) for obj in objects)
    if polygons!=config["expectedTriangles"]:
        raise ValueError("R14E_IMPORT_INVALID: source triangle count mismatch "+
                         str(polygons)+" != "+str(config["expectedTriangles"]))
    colors=[]
    for obj in objects:
        for attribute in obj.data.color_attributes:
            if attribute.domain in ("POINT","CORNER"):
                colors.append({"object":obj.name,"name":attribute.name,
                               "domain":attribute.domain,"length":len(attribute.data)})
    if config["sourceUsesColor0"] and not colors:
        raise ValueError("R14E_MATERIAL_UNSUPPORTED: Blender lost COLOR_0")
    if config["sourceUsesColor0"]:
        found=False
        for mat in bpy.data.materials:
            if mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type in ("ATTRIBUTE","VERTEX_COLOR"):
                        found=True
        if not found:
            raise ValueError("R14E_MATERIAL_UNSUPPORTED: no vertex color material binding")
    scene=bpy.context.scene
    camera_data=bpy.data.cameras.new("RefAs external PBR camera")
    camera=bpy.data.objects.new("RefAs external PBR camera",camera_data)
    scene.collection.objects.link(camera)
    pos,rotation=checked_camera(config["camera"])
    camera.location=pos
    camera.matrix_world=rotation
    camera.matrix_world.translation=pos
    camera_data.type="PERSP"
    camera_data.sensor_fit="VERTICAL"
    camera_data.lens=camera_data.sensor_height/(2*math.tan(math.radians(
        config["camera"]["fovY"])/2))
    camera_data.clip_start=0.01
    camera_data.clip_end=max(2000.0,config["camera"].get("far",2000.0))
    scene.camera=camera
    scene.render.engine="CYCLES"
    scene.cycles.device="CPU"
    scene.cycles.samples=int(config["samples"])
    if hasattr(scene.cycles,"use_denoising"):
        scene.cycles.use_denoising=False
    scene.render.resolution_x=int(config["resolution"])
    scene.render.resolution_y=int(config["resolution"])
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.render.image_settings.color_mode="RGBA"
    scene.render.film_transparent=False
    scene.view_settings.view_transform="Standard"
    scene.render.threads_mode="FIXED"
    scene.render.threads=int(config["threads"])
    world=bpy.data.worlds.new("RefAs external world")
    scene.world=world
    world.use_nodes=True
    bg=world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value=(.10,.12,.14,1.)
    bg.inputs["Strength"].default_value=0.7
    for i,light in enumerate(config["lights"]):
        sun=bpy.data.lights.new("RefAs light "+str(i),"SUN")
        sun.energy=float(light["intensity"])
        sun.color=tuple(float(v) for v in light["rgb"])
        obj=bpy.data.objects.new("RefAs light "+str(i),sun)
        scene.collection.objects.link(obj)
        direction=gltf_to_blender(light["direction"])
        # Blender sun points along its local -Z axis toward geometry.
        obj.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()
        sun.angle=0.03
    out=Path(config["png"])
    out.parent.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(out)
    start=time.perf_counter()
    bpy.ops.render.render(write_still=True)
    render_ms=round((time.perf_counter()-start)*1000,3)
    if digest_file(source)!=config["sourceGlbSha256"]:
        raise ValueError("R14E_SOURCE_MUTATED: GLB changed after render")
    if not out.is_file() or not out.stat().st_size:
        raise ValueError("R14E_RENDER_INVALID: missing output PNG")
    details={
        "blenderVersion":bpy.app.version_string,
        "blenderVersionCode":list(bpy.app.version),
        "engine":"CYCLES","device":"CPU","samples":int(config["samples"]),
        "sourceGlbSha256":config["sourceGlbSha256"],
        "meshObjects":len(objects),"triangleCount":polygons,
        "colorAttributes":colors,
        "worldProfile":"sun-direct3-worldAmbient-0.7-standard-sRGB",
        "importMs":imported_ms,"renderMs":render_ms,
        "imageSha256":digest_file(out),
        "claimScope":"external-pbr-preview-only",
        "certificationEligible":False
    }
    Path(config["result"]).write_text(json.dumps(details,sort_keys=True,indent=2)+"\n")
    print("REFAS_EXTERNAL_BLENDER_RESULT="+json.dumps(details,sort_keys=True))


if __name__=="__main__":
    a=sys.argv.index("--")+1 if "--" in sys.argv else len(sys.argv)
    p=argparse.ArgumentParser()
    p.add_argument("--config",required=True)
    args=p.parse_args(sys.argv[a:])
    render(json.loads(Path(args.config).read_text()))
