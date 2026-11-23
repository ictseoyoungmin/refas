"""Asset format checks and explicit saved-project adoption into production."""
from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import tempfile

from .project import (ProductionError, MAX_MANIFEST_BYTES, _meta, atomic_json,
                      digest, initialize, inventory, read_json, relative_file, run_edit)


SCHEMA = "refas.production.legacy-import/v2"
CHECKPOINT = re.compile(r"cp_[0-9a-f]{20}")
SHA256 = re.compile(r"[0-9a-f]{64}")


def _reference(record, label):
    if not isinstance(record, dict):
        raise ProductionError("invalid legacy " + label)
    sha = record.get("sha256")
    size = record.get("sizeBytes")
    if not isinstance(sha, str) or not SHA256.fullmatch(sha) or type(size) is not int or size < 1:
        raise ProductionError("invalid legacy " + label + " size or SHA-256")
    return sha, size


def _freeze(source, target, sha, size):
    if not source.is_file() or source.stat().st_size != size or digest(source) != sha:
        raise ProductionError("legacy file changed or missing: " + str(source))
    shutil.copy2(source, target)
    if target.stat().st_size != size or digest(target) != sha or digest(source) != sha:
        raise ProductionError("legacy file changed during capture: " + str(source))


def _asset_format(path, suffix):
    with path.open("rb") as stream:
        header = stream.read(20)
        if suffix == ".blend":
            if header[:7] != b"BLENDER":
                raise ProductionError("native input must be an uncompressed .blend file")
            return "native", None
        if (len(header) != 20 or header[:4] != b"glTF" or
                int.from_bytes(header[4:8], "little") != 2 or
                int.from_bytes(header[8:12], "little") != path.stat().st_size or header[16:20] != b"JSON"):
            raise ProductionError("asset is not a valid GLB 2 container")
        length = int.from_bytes(header[12:16], "little")
        if not 1 <= length <= MAX_MANIFEST_BYTES or 20 + length > path.stat().st_size:
            raise ProductionError("GLB JSON chunk is missing or oversized")
        payload = stream.read(length)
    try:
        document = json.loads(payload)
    except (UnicodeError, ValueError) as exc:
        raise ProductionError("invalid GLB JSON") from exc
    if (not isinstance(document, dict) or not isinstance(document.get("asset"), dict) or
            document["asset"].get("version") != "2.0"):
        raise ProductionError("GLB must declare glTF 2.0")
    buffers, images = document.get("buffers", []), document.get("images", [])
    if not isinstance(buffers, list) or not isinstance(images, list):
        raise ProductionError("invalid GLB resource records")
    for record in buffers + images:
        if not isinstance(record, dict):
            raise ProductionError("invalid GLB resource record")
        uri = record.get("uri")
        if uri is not None and (not isinstance(uri, str) or not uri.startswith("data:")):
            raise ProductionError("GLB must embed its buffers and images; external resources are not captured")
    extensions = {key: document.get(key, []) for key in ("extensionsUsed", "extensionsRequired")}
    for names in extensions.values():
        if (not isinstance(names, list) or any(not isinstance(name, str) or not name for name in names) or
                len(names) != len(set(names))):
            raise ProductionError("invalid GLB extension declarations")
    if not set(extensions["extensionsRequired"]).issubset(extensions["extensionsUsed"]):
        raise ProductionError("required GLB extensions must also be declared as used")
    return "glb", extensions


def import_v1(root, source_project, checkpoint, artifact, name, *, blender="blender",
              views=None, size=384, samples=8, timeout=180, review_spec=None, executor=None):
    """Import one explicitly selected stored artifact, without legacy authority."""
    destination = Path(root).expanduser()
    source = Path(source_project).expanduser()
    if destination.exists() or destination.is_symlink():
        raise ProductionError("legacy import requires a new destination directory")
    if source.is_symlink() or not source.is_dir():
        raise ProductionError("legacy source project must be a real directory")
    destination, _ = _meta(destination)
    source = source.resolve()
    if destination.is_relative_to(source) or source.is_relative_to(destination):
        raise ProductionError("legacy source and destination must be disjoint")
    if not isinstance(checkpoint, str) or not CHECKPOINT.fullmatch(checkpoint):
        raise ProductionError("invalid legacy checkpoint ID")
    # Validate the selected project-relative name even though archived bytes,
    # rather than an uncommitted live file, are the actual input.
    selected_path = relative_file(source, artifact)
    if artifact.startswith(".refas/") or selected_path.suffix.lower() not in {".blend", ".glb"}:
        raise ProductionError("select a project-relative .blend or .glb artifact outside .refas")
    manifest_path = relative_file(source, ".refas/project.json")
    checkpoint_path = relative_file(source, ".refas/checkpoints/" + checkpoint + ".json")
    state = read_json(manifest_path)
    if (not isinstance(state, dict) or state.get("schema") != "refas.project-state/v1" or
            not isinstance(state.get("version"), str) or not re.fullmatch(r"1\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?", state["version"])):
        raise ProductionError("source is not a supported RefAs 1.x project")
    if not isinstance(state.get("checkpointIds"), list) or checkpoint not in state["checkpointIds"]:
        raise ProductionError("legacy checkpoint is not recorded in the captured project")
    selected = read_json(checkpoint_path)
    if (not isinstance(selected, dict) or selected.get("schema") != "refas.checkpoint/v1" or
            selected.get("id") != checkpoint or not isinstance(selected.get("artifactRefs"), list)):
        raise ProductionError("invalid legacy checkpoint manifest")
    matches = [item for item in selected["artifactRefs"] if isinstance(item, dict) and item.get("path") == artifact]
    if len(matches) != 1:
        raise ProductionError("legacy checkpoint must contain exactly one matching artifact reference")
    asset = matches[0]
    asset_sha, asset_size = _reference(asset, "artifact")
    original_source = state.get("source")
    source_sha, source_size = _reference(original_source, "source")
    if original_source.get("schema") != "refas.source-manifest/v1":
        raise ProductionError("invalid legacy source manifest schema")
    reference_path = relative_file(source, original_source.get("path"))
    archived = relative_file(source, ".refas/objects/" + asset_sha[:2] + "/" + asset_sha[2:])
    originals = [(manifest_path, digest(manifest_path), manifest_path.stat().st_size),
                 (checkpoint_path, digest(checkpoint_path), checkpoint_path.stat().st_size),
                 (archived, asset_sha, asset_size), (reference_path, source_sha, source_size)]
    # Capture the exact manifests that were interpreted, rather than accepting
    # a replacement between parsing and the first recorded digest.
    if read_json(manifest_path) != state or read_json(checkpoint_path) != selected:
        raise ProductionError("legacy metadata changed before capture")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".refas-v1-capture-", dir=destination.parent) as temporary:
        staging = Path(temporary)
        bundle = staging / "import"
        bundle.mkdir()
        reference_dir = staging / "reference"
        reference_dir.mkdir()
        frozen_reference = reference_dir / reference_path.name
        asset_name = "asset" + selected_path.suffix.lower()
        for original, target in zip(originals, [bundle / "legacy-project.json", bundle / "legacy-checkpoint.json",
                                                bundle / asset_name, frozen_reference]):
            _freeze(original[0], target, original[1], original[2])
        for path, sha, count in originals:
            if path.stat().st_size != count or digest(path) != sha:
                raise ProductionError("legacy source snapshot changed during capture")
        route, extensions = _asset_format(bundle / asset_name, selected_path.suffix.lower())
        report = {
            "schema": SCHEMA, "route": route, "scope": "selected-archived-artifact-import",
            "sourceProject": {"schema": state["schema"], "version": state["version"],
                              "projectId": state.get("projectId"), "head": state.get("head"),
                              "manifestSha256": originals[0][1]},
            "checkpoint": {"id": checkpoint, "manifestSha256": originals[1][1],
                           "legacyAuthorityValidation": "not-performed"},
            "artifact": {"path": artifact, "kind": asset.get("kind"), "sha256": asset_sha,
                         "bytes": asset_size, "capturedPath": "import/" + asset_name, **(extensions or {})},
            "reference": {"path": original_source["path"], "sha256": source_sha, "bytes": source_size,
                          "legacyAuthority": original_source.get("authority"),
                          "legacyAcquisition": original_source.get("acquisition")},
            "preserved": ["Exact selected archived asset bytes", "Exact captured project and checkpoint manifests",
                          "Exact original reference bytes", "Old project files remain untouched"],
            "conversion": ("Open the selected native scene and use production save/reopen checks" if route == "native" else
                           "Reconstruct a Blender scene from supported GLB data and use production save/reopen checks"),
            "notImported": ["Legacy checkpoint/transaction history as active production history",
                            "Legacy certificates, approvals, gates, findings and render evidence as current acceptance"],
            "limitations": (["Native input must be uncompressed with packed textures and no linked libraries",
                               "Current-frame production checks do not certify all animation, drivers or simulations"] if route == "native" else
                              ["GLB does not recover original modifiers, procedural graphs, construction scripts or sculpt history",
                               "External buffers/images are unsupported; importer feature handling and current-frame checks are bounded",
                               "Declared extensions are recorded; Blender importer support is not per-extension round-trip certification"]),
            "certification": {"inherited": False, "status": "not-evaluated"},
            "referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"}
        atomic_json(bundle / "migration.json", report)
        frozen_bundle = inventory(bundle)
        script = staging / "adopt.py"
        script.write_text("# Adopt the explicitly captured legacy artifact without executing legacy scripts.\n", encoding="utf-8")
        initialized = initialize(destination, name, [frozen_reference])
        if initialized["sources"][0]["sha256"] != source_sha:
            raise ProductionError("frozen legacy reference changed before initialization")
        result = run_edit(destination, script, "Import RefAs 1.x " + checkpoint + ": " + artifact,
                          blender=blender, views=views, size=size, samples=samples, timeout=timeout,
                          expected_revision="none", expected_sequence=0, executor=executor,
                          review_spec=review_spec, _import_bundle=(bundle, frozen_bundle))
        return {**result, "migration": report}
