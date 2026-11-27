"""Realize native curve/text details in a disposable observation copy."""
import bpy
import hashlib
import json
from pathlib import Path
import sys

arguments = sys.argv[sys.argv.index("--") + 1:]
if len(arguments) not in {2, 3}:
    raise ValueError("Expected source, new output, and optional explicit asset root")
source, output = [Path(value).resolve() for value in arguments[:2]]
asset_root = arguments[2] if len(arguments) == 3 else None
if source == output or output.exists():
    raise ValueError("Observation copy must be a new file distinct from its source")
before = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
original_objects = list(bpy.context.scene.objects)
excluded = []
if asset_root:
    root = bpy.context.scene.objects.get(asset_root)
    if root is None or root.parent is not None:
        raise ValueError("Asset root must be an existing top-level object")
    selected = {root, *root.children_recursive}
    if not any(obj.type in {"MESH", "CURVE"} for obj in selected):
        raise ValueError("Selected hierarchy has no supported visible geometry")
    excluded = [{"name": obj.name, "type": obj.type}
                for obj in original_objects if obj not in selected]
    for obj in original_objects:
        if obj not in selected:
            bpy.data.objects.remove(obj, do_unlink=True)
objects = list(bpy.context.scene.objects)
unsupported = [obj.name + ":" + obj.type for obj in objects
               if obj.type not in {"MESH", "CURVE", "FONT", "ARMATURE", "EMPTY", "LIGHT", "CAMERA"}]
if unsupported:
    raise ValueError("Unreviewed observation types: " + ", ".join(unsupported))
curves = [obj for obj in objects if obj.type == "CURVE"]
text_objects = [obj for obj in objects if obj.type == "FONT"]
convertible = curves + text_objects
record = {"sourceSha256": before, "convertedCurves": [obj.name for obj in curves],
          "convertedText": [obj.name for obj in text_objects],
          "sourceObjectCount": len(original_objects),
          "selectedObjectCount": len(objects), "assetRoot": asset_root,
          "excludedObjects": excluded,
          "method": "Blender object.convert MESH on a separate copy, no source resave"}
if convertible:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in convertible:
        if obj.hide_render or not obj.visible_get():
            raise ValueError("Hidden curve/text needs explicit observation scope: " + obj.name)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = convertible[0]
    result = bpy.ops.object.convert(target="MESH")
    if "FINISHED" not in result:
        raise RuntimeError("Curve/text realization did not finish")
record["observationObjectCount"] = len(bpy.context.scene.objects)
if record["selectedObjectCount"] != record["observationObjectCount"]:
    raise ValueError("Curve/text realization changed the object scope")
bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False, compress=False)
record["sourceUnchanged"] = hashlib.sha256(source.read_bytes()).hexdigest() == before
if not record["sourceUnchanged"]:
    raise ValueError("Source bytes changed during observation")
(output.parent / "normalization.json").write_text(json.dumps(record, indent=2) + "\n")
