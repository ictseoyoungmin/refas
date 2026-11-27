"""Inspect the imported native scene without saving or changing it."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

objects = []
for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
    if obj.type != "MESH":
        continue
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lower = [min(p[i] for p in corners) for i in range(3)]
    upper = [max(p[i] for p in corners) for i in range(3)]
    record = {
        "name": obj.name,
        "min": lower,
        "max": upper,
        "center": [(lower[i]+upper[i])/2 for i in range(3)],
        "dimensions": [upper[i]-lower[i] for i in range(3)],
        "parent": obj.parent.name if obj.parent else None,
        "children": [child.name for child in obj.children],
        "materials": [m.name if m else None for m in obj.data.materials],
    }
    if obj.name == "panel:cell-00":
        faces = sorted(obj.data.polygons, key=lambda face: face.area, reverse=True)[:8]
        record["largestFaces"] = [
            {"area": face.area, "normal": list(face.normal), "center": list(face.center)}
            for face in faces
        ]
    objects.append(record)
report = {"openedBlend": bpy.data.filepath, "meshCount": len(objects), "objects": objects}
out = Path("/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/logs/native-inspection.json")
out.write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps({"output": str(out), "target": next(o for o in objects if o["name"] == "panel:cell-00")}, indent=2))

