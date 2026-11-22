"""Confirm restoration, retained history, provenance, and unchanged source files."""
import hashlib
import json
from pathlib import Path

root = Path("/workspace/scratch/c52cb753f160/v2-import-proof/forward-use")
initial = json.loads((root/"logs/import-result.json").read_text())
restored = json.loads((root/"logs/restore-result.json").read_text())
original_rev = root/"project/.refas2/revisions"/initial["head"]
restored_rev = root/"project/.refas2/revisions"/restored["head"]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

identical_artifacts = {}
for path in sorted((original_rev/"artifacts").rglob("*")):
    if path.is_file():
        rel = path.relative_to(original_rev)
        identical_artifacts[str(rel)] = digest(path) == digest(restored_rev/rel)
identical_inputs = {}
for path in sorted((original_rev/"inputs").rglob("*")):
    if path.is_file():
        rel = path.relative_to(original_rev)
        identical_inputs[str(rel)] = digest(path) == digest(restored_rev/rel)
source = Path("/workspace/scratch/c52cb753f160/v2-import-proof/legacy-wing-cover")
prior = json.loads((root/"logs/source-before.json").read_text())
current = {str(p.relative_to(source)):digest(p) for p in sorted(source.rglob("*")) if p.is_file()}
(root/"logs/source-after.json").write_text(json.dumps(current, indent=2)+"\n")
history = [item["id"] for item in restored["revisions"]]
report = {
    "restoredHead": restored["head"],
    "sequence": restored["sequence"],
    "restoredFrom": initial["head"],
    "retainedRevisionIds": history,
    "exactRestoredArtifacts": identical_artifacts,
    "exactRestoredInputs": identical_inputs,
    "sourceProjectUnchanged": prior == current,
    "sourceFileCount": len(current),
    "importedArchiveSha256": digest(restored_rev/"inputs/import/asset.glb"),
    "sourceReferenceSha256": digest(root/"project/.refas2"/restored["sources"][0]["path"]),
    "expectedCheckpointArtifactSha256": "3fcf70e36a0b42723c3abed6ebc60cdfea0143e19c047ba802258753ee41fdec",
    "scope": "Byte comparisons, history retention, and source provenance; no visual likeness or target-engine claim.",
}
report["passed"] = (
    all(identical_artifacts.values()) and all(identical_inputs.values())
    and prior == current and len(history) == 4
    and report["importedArchiveSha256"] == report["expectedCheckpointArtifactSha256"]
    and report["sourceReferenceSha256"] == restored["sources"][0]["sha256"]
)
(root/"logs/restoration-check.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(report, indent=2))
assert report["passed"], "Restoration or preservation failed."

