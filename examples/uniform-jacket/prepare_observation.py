"""Realize native curve details in a disposable, auditable observation copy."""
import bpy
import hashlib
import json
from pathlib import Path
import sys

source, output = [Path(value).resolve() for value in sys.argv[sys.argv.index("--") + 1:]]
if source == output or output.exists():
    raise ValueError("Observation copy must be a new file distinct from its source")
before = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
objects = list(bpy.context.scene.objects)
unsupported = [obj.name + ":" + obj.type for obj in objects
               if obj.type not in {"MESH", "CURVE", "ARMATURE", "EMPTY", "LIGHT", "CAMERA"}]
if unsupported:
    raise ValueError("Unreviewed observation types: " + ", ".join(unsupported))
curves = [obj for obj in objects if obj.type == "CURVE"]
record = {"sourceSha256": before, "convertedCurves": [obj.name for obj in curves],
          "sourceObjectCount": len(objects),
          "method": "Blender object.convert MESH on a separate copy, no source resave"}
if curves:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in curves:
        if obj.hide_render or not obj.visible_get():
            raise ValueError("Hidden curve needs explicit observation scope: " + obj.name)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = curves[0]
    result = bpy.ops.object.convert(target="MESH")
    if "FINISHED" not in result:
        raise RuntimeError("Curve realization did not finish")
record["observationObjectCount"] = len(bpy.context.scene.objects)
if record["sourceObjectCount"] != record["observationObjectCount"]:
    raise ValueError("Curve realization changed the object scope")
bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False, compress=False)
record["sourceUnchanged"] = hashlib.sha256(source.read_bytes()).hexdigest() == before
if not record["sourceUnchanged"]:
    raise ValueError("Source bytes changed during observation")
(output.parent / "normalization.json").write_text(json.dumps(record, indent=2) + "\n")
