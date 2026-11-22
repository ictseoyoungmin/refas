"""Compare saved revision inventories and exported GLBs for the local panel edit."""
import hashlib
import json
import struct
from pathlib import Path

root = Path("/workspace/scratch/c52cb753f160/v2-import-proof/forward-use")
statuses = {name: json.loads((root/"logs"/f"{name}-result.json").read_text()) for name in ("import", "baseline", "raised")}
scenes = {name: json.loads(Path(status["outputs"]["scene"]).read_text()) for name, status in statuses.items()}
before = {obj["name"]: obj for obj in scenes["baseline"]["objects"]}
after = {obj["name"]: obj for obj in scenes["raised"]["objects"]}
target = "panel:cell-00"
changed = [name for name in before if before[name] != after.get(name)]
fields = [key for key in before[target] if before[target][key] != after[target].get(key)]
offset = [after[target]["matrixWorld"][axis][3]-before[target]["matrixWorld"][axis][3] for axis in range(3)]
same_capture = all(
    old["view"] == new["view"] and all(old[key] == new[key] for key in ("camera", "lighting", "renderer"))
    for old, new in zip(statuses["baseline"]["observations"], statuses["raised"]["observations"])
)

def glb(path):
    data = Path(path).read_bytes()
    chunks = {}
    cursor = 12
    while cursor < len(data):
        length, kind = struct.unpack_from("<II", data, cursor)
        chunks[kind] = data[cursor+8:cursor+8+length]
        cursor += 8+length
    return json.loads(chunks[0x4E4F534A]), chunks.get(0x004E4942, b"")

old_glb, old_binary = glb(statuses["baseline"]["outputs"]["glb"])
new_glb, new_binary = glb(statuses["raised"]["outputs"]["glb"])
old_nodes = {node["name"]: node for node in old_glb["nodes"]}
new_nodes = {node["name"]: node for node in new_glb["nodes"]}
changed_nodes = [name for name in old_nodes if old_nodes[name] != new_nodes.get(name)]
preserved_glb_sections = {key: old_glb.get(key) == new_glb.get(key) for key in ("meshes", "materials", "accessors", "bufferViews", "skins", "animations", "textures", "images")}
checks = {
    "baselineMatchesImportedSceneFingerprint": scenes["baseline"]["fingerprint"] == scenes["import"]["fingerprint"],
    "sameObjectNames": set(before) == set(after),
    "onlyTargetObjectChanged": changed == [target],
    "targetOnlyTransformAndFingerprintChanged": set(fields) <= {"matrixLocal", "matrixWorld", "fingerprint"},
    "expectedWorldTranslation": all(abs(a-b) < 1e-7 for a, b in zip(offset, (0, -0.025, 0))),
    "sameSceneStatistics": scenes["baseline"]["statistics"] == scenes["raised"]["statistics"],
    "fixedCamerasLightingRenderSettings": same_capture,
    "sameExportedNodeNames": set(old_nodes) == set(new_nodes),
    "onlyTargetExportedNodeChanged": changed_nodes == [target],
    "exportedBinaryGeometryEqual": old_binary == new_binary,
    "preservedExportedSections": all(preserved_glb_sections.values()),
}
report = {
    "checks": checks,
    "passed": all(checks.values()),
    "revisionIds": {name: status["head"] for name, status in statuses.items()},
    "changedObjectNames": changed,
    "unchangedObjectCount": len(before)-len(changed),
    "targetChangedFields": fields,
    "targetWorldTranslationDelta": offset,
    "sceneStatistics": scenes["raised"]["statistics"],
    "changedExportedNodes": changed_nodes,
    "targetExportedNodeBefore": old_nodes[target],
    "targetExportedNodeAfter": new_nodes[target],
    "exportedBinarySha256": hashlib.sha256(old_binary).hexdigest(),
    "preservedExportedSections": preserved_glb_sections,
    "scope": "Recorded current-frame scene data and the saved GLB; this does not establish source likeness or engine readiness.",
}
out = root/"logs"/"preservation-check.json"
out.write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(report, indent=2))
assert report["passed"], "The local edit did not preserve the expected scope."

