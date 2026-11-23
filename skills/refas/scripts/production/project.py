"""Small, recoverable production revisions. No visual certification decisions."""
from __future__ import annotations

import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import uuid

from .review import validate_review


SCHEMA = "refas.production.project/v2"
REVISION_SCHEMA = "refas.production.revision/v2"
STATE_DIR = ".refas2"
MAX_MANIFEST_BYTES = 8 * 1024 * 1024


class ProductionError(RuntimeError):
    pass


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_MANIFEST_BYTES:
        raise ProductionError("missing, unsafe or oversized JSON: " + str(path))
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, ValueError) as exc:
        raise ProductionError("invalid JSON: " + str(path)) from exc


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def relative_file(base, relative):
    """Resolve manifest paths without accepting traversal or symlink components."""
    base = Path(base).resolve()
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise ProductionError("artifact path must be a nonempty portable relative path")
    path = Path(relative)
    if path.is_absolute() or any(part in ("..", ".") for part in relative.split("/")):
        raise ProductionError("artifact path escapes its bundle: " + relative)
    target = base
    for part in path.parts:
        target = target / part
        if target.is_symlink():
            raise ProductionError("artifact symlink is not supported: " + relative)
    if not target.resolve().is_relative_to(base):
        raise ProductionError("artifact path escapes its bundle: " + relative)
    return target


def inventory(base):
    base = Path(base)
    if base.is_symlink() or not base.is_dir():
        raise ProductionError("artifact bundle is missing or is a symlink")
    files = []
    for path in sorted(base.rglob("*")):
        if path.is_symlink():
            raise ProductionError("symlink in artifact bundle: " + str(path))
        if path.is_file():
            files.append({"path": path.relative_to(base).as_posix(),
                          "sha256": digest(path), "bytes": path.stat().st_size})
    return files


def check_inventory(base, files, exact=True):
    if not isinstance(files, list) or not files:
        raise ProductionError("empty artifact inventory")
    seen = set()
    for item in files:
        if not isinstance(item, dict):
            raise ProductionError("invalid artifact inventory item")
        relative = item.get("path")
        if relative in seen:
            raise ProductionError("duplicate artifact path")
        seen.add(relative)
        file = relative_file(base, relative)
        if not file.is_file() or file.stat().st_size != item.get("bytes") or digest(file) != item.get("sha256"):
            raise ProductionError("artifact changed or missing: " + str(relative))
    if exact:
        actual = {item["path"] for item in inventory(base)}
        if actual != seen:
            raise ProductionError("artifact bundle contains unrecorded files")


def _meta(root):
    root = Path(root).expanduser().resolve()
    # Output must never be written into the installed skill itself.
    skill_root = Path(__file__).resolve().parents[2]
    if root.is_relative_to(skill_root):
        raise ProductionError("use a project directory outside the installed skill")
    meta = root / STATE_DIR
    if meta.is_symlink():
        raise ProductionError("project metadata cannot be a symlink")
    return root, meta


def load_project(root):
    root, meta = _meta(root)
    state = read_json(meta / "project.json")
    if not isinstance(state, dict) or state.get("schema") != SCHEMA:
        raise ProductionError("not a RefAs production v2 project")
    if not isinstance(state.get("sequence"), int) or state["sequence"] < 0:
        raise ProductionError("invalid project revision sequence")
    known = state.get("revisionDigests")
    if not isinstance(known, dict) or (state.get("head") is not None and state["head"] not in known):
        raise ProductionError("invalid committed revision index")
    return state


@contextlib.contextmanager
def project_lock(meta):
    """Brief publication lock; DCC work runs outside this lock."""
    lock = Path(meta) / "write.lock"
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise ProductionError("project publication is locked; inspect write.lock before recovery") from exc
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump({"pid": os.getpid(), "createdAt": utc_now()}, stream)
        yield
    finally:
        lock.unlink(missing_ok=True)


def initialize(root, name, references=()):
    root, meta = _meta(root)
    if not isinstance(name, str) or not name.strip():
        raise ProductionError("project name is required")
    if meta.exists():
        raise ProductionError("production project already exists")
    root.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=".refas-init-", dir=root))
    try:
        sources = []
        (temp / "sources").mkdir()
        for index, reference in enumerate(references):
            source = Path(reference).expanduser().resolve()
            if not source.is_file() or source.stat().st_size == 0:
                raise ProductionError("reference file is missing or empty: " + str(source))
            relative = "sources/" + str(index + 1).zfill(3) + "-" + source.name
            target = temp / relative
            before = digest(source)
            shutil.copy2(source, target)
            if digest(target) != before or digest(source) != before:
                raise ProductionError("reference changed while it was copied")
            sources.append({"path": relative, "name": source.name, "role": "user-reference",
                            "sha256": before, "bytes": target.stat().st_size})
        (temp / "revisions").mkdir()
        (temp / "runs").mkdir()
        state = {"schema": SCHEMA, "projectId": uuid.uuid4().hex, "name": name.strip(),
                 "createdAt": utc_now(), "sequence": 0, "head": None, "sources": sources,
                 "revisionDigests": {}}
        atomic_json(temp / "project.json", state)
        # The directory rename is the initialization commit point.
        os.rename(temp, meta)
        return status(root)
    finally:
        if temp.exists():
            shutil.rmtree(temp)


def _revision_dir(meta, revision_id):
    if not isinstance(revision_id, str) or len(revision_id) != 32 or any(c not in "0123456789abcdef" for c in revision_id):
        raise ProductionError("invalid revision ID")
    folder = relative_file(meta, "revisions/" + revision_id)
    if folder.is_symlink():
        raise ProductionError("revision directory cannot be a symlink")
    return folder


def load_revision(root, revision_id=None, verify=True):
    state = load_project(root)
    _, meta = _meta(root)
    revision_id = revision_id or state["head"]
    return _load_revision(meta, state, revision_id, verify)


def _check_sources(meta, sources):
    if not isinstance(sources, list):
        raise ProductionError("invalid captured source inventory")
    for source in sources:
        check_inventory(meta, [source], exact=False)


def _load_revision(meta, state, revision_id, verify=True):
    """Read only the declared snapshot; an explicit None never follows a newer HEAD."""
    if revision_id is None:
        return None
    if revision_id not in state["revisionDigests"]:
        raise ProductionError("revision is not in the committed project history")
    folder = _revision_dir(meta, revision_id)
    if digest(folder / "revision.json") != state["revisionDigests"][revision_id]:
        raise ProductionError("revision manifest changed")
    revision = read_json(folder / "revision.json")
    if revision.get("schema") != REVISION_SCHEMA or revision.get("id") != revision_id:
        raise ProductionError("invalid revision manifest")
    if verify:
        check_inventory(folder / "artifacts", revision.get("artifacts"))
        check_inventory(folder / "inputs", revision.get("inputs"))
        _check_sources(meta, revision.get("sources"))
    return revision


def _source_hashes(sources):
    # References represent a content set, independent of names, order or aliases.
    return sorted({source["sha256"] for source in sources})


def _evidence_freshness(state, current):
    active = _source_hashes(state["sources"])
    captured = _source_hashes(current["sources"]) if current else []
    return {"status": ("current" if active == captured else "stale") if current else "no-revision",
            "scope": "active-reference-content-set", "revision": state["head"],
            "activeSourceSha256": active, "revisionSourceSha256": captured,
            "visualAcceptance": "not-evaluated"}


def _verify_state(meta, state):
    _check_sources(meta, state["sources"])
    return _load_revision(meta, state, state["head"])


def verify_project(root):
    state = load_project(root)
    _, meta = _meta(root)
    current = _verify_state(meta, state)
    return {"ok": True, "scope": "recorded-file-integrity", "head": state["head"],
            "artifactCount": len(current["artifacts"]) if current else 0,
            "evidenceFreshness": _evidence_freshness(state, current),
            "referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"}


def _runs_dir(meta):
    folder = relative_file(meta, "runs")
    if not folder.is_dir():
        raise ProductionError("project run directory is missing")
    return folder


def status(root):
    state = load_project(root)
    _, meta = _meta(root)
    return _status(meta, state)


def _status(meta, state):
    current = _verify_state(meta, state)
    revisions = []
    committed_run_ids = set()
    for revision_id in state["revisionDigests"]:
        rev = _load_revision(meta, state, revision_id, verify=False)
        if rev.get("runId"):
            committed_run_ids.add(rev["runId"])
        revisions.append({"id": rev.get("id"), "intent": rev.get("intent"),
                          "createdAt": rev.get("createdAt"), "parent": rev.get("parent")})
    runs = []
    for folder in sorted(_runs_dir(meta).iterdir()):
        if folder.is_dir() and not folder.is_symlink() and (folder / "run.json").is_file():
            run = read_json(folder / "run.json")
            # A pointer publication is authoritative even if its run log could
            # not be updated afterwards (for example, on a full disk).
            committed = run.get("id") in committed_run_ids
            if run.get("status") != "committed" and not committed:
                incomplete = {"id": run.get("id"), "status": run.get("status"), "error": run.get("error")}
                if run.get("candidateRevision"):
                    candidate = _revision_dir(meta, run["candidateRevision"])
                    if candidate.exists():
                        incomplete.update(candidateRevision=run["candidateRevision"],
                                          preservedCandidatePath=str(candidate))
                runs.append(incomplete)
    artifact_paths = {}
    observations = []
    input_paths = {}
    if current:
        base = _revision_dir(meta, state["head"]) / "artifacts"
        artifact_paths = {key: str(relative_file(base, value)) for key, value in current["outputs"].items()}
        observations = [{**item, "path": str(relative_file(base, item["path"]))}
                        for item in current.get("observations", [])]
        captured = _revision_dir(meta, state["head"]) / "inputs"
        input_paths = {item["path"]: str(relative_file(captured, item["path"])) for item in current["inputs"]}
    return {"ok": True, "schema": SCHEMA, "name": state["name"], "projectId": state["projectId"],
            "head": state["head"], "sequence": state["sequence"], "sources": state["sources"],
            "outputs": artifact_paths, "observations": observations, "inputs": input_paths,
            "revisions": revisions, "incompleteRuns": runs,
            "outputProfile": current.get("execution", {}).get("outputProfile", "delivery") if current else None,
            "evidenceFreshness": _evidence_freshness(state, current),
            "referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"}


def _check_expected(base, expected_revision, expected_sequence, require_sequence=False):
    if expected_revision is not None and expected_revision != (base["head"] or "none"):
        raise ProductionError("expected revision is not current")
    if require_sequence or expected_sequence is not None:
        if type(expected_sequence) is not int or expected_sequence < 0:
            raise ProductionError("expected sequence must be a nonnegative integer")
        if expected_sequence != base["sequence"]:
            raise ProductionError("expected sequence is not current")


def _assert_base(root, base, verify_head=True):
    latest = load_project(root)
    if latest != base:
        raise ProductionError("project changed during execution; publication cancelled")
    _, meta = _meta(root)
    if verify_head:
        _verify_state(meta, latest)
    else:
        # Recovery may replace a damaged HEAD with an intact older bundle.
        # Keep source identity and the state lease strict without requiring
        # the damaged payload to pass the very check recovery will repair.
        _check_sources(meta, latest["sources"])


def replace_references(root, references=None, clear=False, expected_revision=None, expected_sequence=None):
    """Adopt an explicit content set without changing any committed model bundle."""
    root, meta = _meta(root)
    base = load_project(root)
    _check_expected(base, expected_revision, expected_sequence, require_sequence=True)
    references = list(references) if references is not None else []
    if (clear and references) or (not clear and not references):
        raise ProductionError("supply reference files or explicitly clear the reference set")
    _verify_state(meta, base)
    batch_id = uuid.uuid4().hex
    temp = Path(tempfile.mkdtemp(prefix=".refas-sources-", dir=meta))
    try:
        sources = []
        seen = set()
        for reference in references:
            source = Path(reference).expanduser().resolve()
            if not source.is_file() or source.stat().st_size == 0:
                raise ProductionError("reference file is missing or empty: " + str(source))
            before = digest(source)
            if before in seen:
                continue
            name = str(len(sources) + 1).zfill(3) + "-" + source.name
            target = relative_file(temp, name)
            shutil.copy2(source, target)
            if digest(target) != before or digest(source) != before:
                raise ProductionError("reference changed while it was copied")
            sources.append({"path": "sources/" + batch_id + "/" + name,
                            "name": source.name, "role": "user-reference",
                            "sha256": before, "bytes": target.stat().st_size})
            seen.add(before)
        changed = _source_hashes(sources) != _source_hashes(base["sources"])
        with project_lock(meta):
            _assert_base(root, base)
            if changed:
                destination = relative_file(meta, "sources/" + batch_id) if sources else None
                if destination:
                    os.rename(temp, destination)
                state = {**base, "sources": sources, "sequence": base["sequence"] + 1,
                         "updatedAt": utc_now()}
                try:
                    # Validate the response before the commit point, including
                    # history manifests that the current bundle does not use.
                    result = _status(meta, state)
                    atomic_json(meta / "project.json", state)
                except BaseException:
                    # Only discard unpublished copies; a committed pointer owns them.
                    if destination and load_project(root) == base:
                        shutil.rmtree(destination)
                    raise
            else:
                result = _status(meta, base)
        return {**result, "referencesChanged": changed}
    finally:
        if temp.exists():
            shutil.rmtree(temp)


def _execute(command, cwd, log_file, timeout):
    started = time.monotonic()
    with Path(log_file).open("wb") as log:
        process = subprocess.Popen(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT,
                                   env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                   start_new_session=(os.name != "nt"))
        try:
            returncode = process.wait(timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            if os.name != "nt":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.wait()
            raise ProductionError("Blender execution exceeded its timeout or was interrupted; inspect run log")
    if returncode:
        raise ProductionError("Blender failed with exit " + str(returncode) + "; inspect " + str(log_file))
    return round(time.monotonic() - started, 3)


def _validate_worker_result(artifact_dir, output_profile="delivery", protected_objects=()):
    result = read_json(artifact_dir / "result.json")
    if result.get("schema") != "refas.production.result/v2" or result.get("ok") is not True:
        raise ProductionError("worker did not report a successful production result")
    outputs = result.get("outputs", {})
    required = {"blend": ".blend", "scene": ".json"}
    if output_profile == "delivery":
        required["glb"] = ".glb"
    if set(outputs) != set(required) or result.get("outputProfile", "delivery") != output_profile:
        raise ProductionError("worker outputs do not match the requested output profile")
    if protected_objects:
        protection = result.get("verification", {}).get("protectedObjects", {})
        if (protection.get("status") != "passed"
                or protection.get("scope") != "recorded-object-state-and-materials"
                or sorted(protection.get("objects", [])) != sorted(protected_objects)):
            raise ProductionError("worker did not verify all protected objects")
    for key, suffix in required.items():
        path = relative_file(artifact_dir, outputs[key])
        if path.suffix != suffix or not path.is_file() or not path.stat().st_size:
            raise ProductionError("worker output missing or wrong type: " + key)
    with relative_file(artifact_dir, outputs["blend"]).open("rb") as stream:
        if stream.read(7) != b"BLENDER":
            raise ProductionError("native output is not an uncompressed Blender project")
    if "glb" in outputs:
        with relative_file(artifact_dir, outputs["glb"]).open("rb") as stream:
            header = stream.read(12)
        if len(header) != 12 or header[:4] != b"glTF" or int.from_bytes(header[4:8], "little") != 2:
            raise ProductionError("output is not GLB 2")
        if int.from_bytes(header[8:12], "little") != relative_file(artifact_dir, outputs["glb"]).stat().st_size:
            raise ProductionError("GLB length does not match header")
    read_json(relative_file(artifact_dir, outputs["scene"]))
    for observation in result.get("observations", []):
        path = relative_file(artifact_dir, observation["path"])
        with path.open("rb") as stream:
            if stream.read(8) != b"\x89PNG\r\n\x1a\n":
                raise ProductionError("observation is not an actual PNG")
    return result


def run_edit(root, script, intent, blender="blender", input_blend=None, views=None,
             size=384, samples=8, timeout=180, expected_revision=None, executor=None, review_spec=None,
             expected_sequence=None, _import_bundle=None, output_profile="delivery", protected_objects=(),
             keep_diagnostics=False):
    root, meta = _meta(root)
    base = load_project(root)
    _check_expected(base, expected_revision, expected_sequence)
    current = _verify_state(meta, base)
    if output_profile not in {"native", "delivery"}:
        raise ProductionError("output profile must be native or delivery")
    protected_objects = list(protected_objects)
    if (any(not isinstance(name, str) or not name.strip() for name in protected_objects)
            or len(set(protected_objects)) != len(protected_objects)):
        raise ProductionError("protected objects must be unique, exact nonempty object names")
    if _import_bundle is not None and (input_blend is not None or base["head"] is not None):
        raise ProductionError("legacy import inputs require a new project without another native input")
    if not isinstance(intent, str) or not intent.strip():
        raise ProductionError("a concrete edit intent is required")
    if not isinstance(timeout, (int, float)) or not 1 <= timeout <= 3600:
        raise ProductionError("timeout must be between 1 and 3600 seconds")
    if type(size) is not int or not 64 <= size <= 2048 or type(samples) is not int or not 1 <= samples <= 256:
        raise ProductionError("invalid render size or sample count")
    if review_spec:
        review_spec = Path(review_spec).expanduser().resolve()
        if not review_spec.is_file() or review_spec.stat().st_size > 65536:
            raise ProductionError("review specification must be a JSON file under 64 KiB")
    review = validate_review(read_json(review_spec)) if review_spec else None
    if review:
        supported_views = {v["name"] for v in review["views"]}
        source_digests = {source["sha256"] for source in base["sources"]}
        if any(v.get("reference", {}).get("sourceSha256") not in source_digests
               for v in review["views"] if "reference" in v):
            raise ProductionError("review references a source outside this project's captured inputs")
    else:
        supported_views = {"hero", "front", "back", "side", "top"}
    views = list(views) if views is not None else ([v["name"] for v in review["views"]] if review
                                                else (["hero"] if output_profile == "native" else ["hero", "side"]))
    if len(views) != len(set(views)) or any(view not in supported_views for view in views):
        raise ProductionError("unknown or duplicate requested view")
    script = Path(script).expanduser().resolve()
    if not script.is_file() or script.stat().st_size == 0:
        raise ProductionError("modeling script is missing or empty")
    executable = shutil.which(blender)
    if not executable and executor is None:
        raise ProductionError("Blender executable is unavailable: " + blender)
    run_id = uuid.uuid4().hex
    run_dir = relative_file(_runs_dir(meta), run_id)
    run_dir.mkdir()
    inputs = run_dir / "inputs"
    inputs.mkdir()
    artifact_dir = run_dir / "artifacts"
    artifact_dir.mkdir()
    run = {"schema": "refas.production.run/v2", "id": run_id, "status": "running",
           "intent": intent.strip(), "baseRevision": base["head"], "startedAt": utc_now(),
           "outputProfile": output_profile, "diagnosticsKept": bool(keep_diagnostics)}
    atomic_json(run_dir / "run.json", run)
    try:
        if review:
            source_review = Path(review_spec).expanduser().resolve()
            review_sha = digest(source_review)
            shutil.copy2(source_review, inputs / "review.json")
            if digest(inputs / "review.json") != review_sha or digest(source_review) != review_sha:
                raise ProductionError("review specification changed during capture")
            if validate_review(read_json(inputs / "review.json")) != review:
                raise ProductionError("review specification changed before capture")
        script_sha = digest(script)
        shutil.copy2(script, inputs / "edit.py")
        if digest(inputs / "edit.py") != script_sha or digest(script) != script_sha:
            raise ProductionError("script changed during capture")
        source_blend = None
        if input_blend:
            source_blend = Path(input_blend).expanduser().resolve()
        elif base["head"]:
            source_blend = relative_file(_revision_dir(meta, base["head"]) / "artifacts", current["outputs"]["blend"])
        if source_blend:
            if not source_blend.is_file():
                raise ProductionError("native input is missing")
            source_sha = digest(source_blend)
            shutil.copy2(source_blend, inputs / "base.blend")
            if digest(inputs / "base.blend") != source_sha or digest(source_blend) != source_sha:
                raise ProductionError("native input changed during capture")
        migration = None
        if _import_bundle is not None:
            bundle, captured = _import_bundle
            bundle = Path(bundle)
            check_inventory(bundle, captured)
            migration = read_json(bundle / "migration.json")
            if (not isinstance(migration, dict) or migration.get("schema") != "refas.production.legacy-import/v2" or
                    migration.get("route") not in {"native", "glb"}):
                raise ProductionError("invalid legacy import capture")
            import_asset = "asset.blend" if migration["route"] == "native" else "asset.glb"
            if {item["path"] for item in captured} != {"legacy-project.json", "legacy-checkpoint.json", "migration.json", import_asset}:
                raise ProductionError("invalid legacy import file set")
            shutil.copytree(bundle, inputs / "import")
            check_inventory(inputs / "import", captured)
            check_inventory(bundle, captured)
        frozen_inputs = inventory(inputs)
        job = {"operation": "edit", "baseBlend": str(inputs / "base.blend") if source_blend else None,
               "script": str(inputs / "edit.py"), "inputDir": str(inputs), "outputDir": str(artifact_dir),
               "views": views, "render": {"engine": "CYCLES", "samples": samples, "size": size},
               "outputProfile": output_profile, "protectedObjects": protected_objects}
        if migration:
            job["baseBlend" if migration["route"] == "native" else "baseGlb"] = str(inputs / "import" / import_asset)
            job["legacyImport"] = True
        if review:
            job["reviewSpec"] = str(inputs / "review.json")
        atomic_json(run_dir / "job.json", job)
        worker = Path(__file__).with_name("blender_worker.py")
        command = [executable or blender, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                   "--python", str(worker), "--", "--job", str(run_dir / "job.json")]
        elapsed = (executor or _execute)(command, run_dir, run_dir / "blender.log", timeout)
        check_inventory(inputs, frozen_inputs)
        result = _validate_worker_result(artifact_dir, output_profile, protected_objects)
        observed_views = [item.get("view") for item in result.get("observations", [])]
        if sorted(observed_views) != sorted(views):
            raise ProductionError("worker did not render exactly the requested views")
        revision_id = uuid.uuid4().hex
        revision = {"schema": REVISION_SCHEMA, "id": revision_id, "parent": base["head"],
                    "createdAt": utc_now(), "intent": intent.strip(), "kind": "edit", "runId": run_id,
                    "sources": base["sources"], "inputs": frozen_inputs,
                    "artifacts": inventory(artifact_dir), "outputs": result["outputs"],
                    "observations": result.get("observations", []), "blenderVersion": result.get("blenderVersion"),
                    "elapsedSeconds": elapsed, "verification": result.get("verification", {}),
                    "execution": {"outputProfile": output_profile, "views": views, "render": job["render"],
                                  "protectedObjects": protected_objects},
                    "warnings": result.get("warnings", []),
                    "assessment": {"referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"}}
        if migration:
            revision.update(kind="import-v1", migration=migration)
        # Keep interrupted publication discoverable when staged payloads have
        # already moved into a candidate that was never made current.
        run["candidateRevision"] = revision_id
        atomic_json(run_dir / "run.json", run)
        with project_lock(meta):
            _assert_base(root, base)
            final = _revision_dir(meta, revision_id)
            # Build a complete revision before publishing its pointer. Interrupted
            # orphan revisions are retained and never mistaken for the current one.
            final.mkdir()
            # The staging and revision directories share a filesystem. Transfer
            # ownership instead of retaining a second complete native/render copy.
            os.rename(artifact_dir, final / "artifacts")
            os.rename(inputs, final / "inputs")
            atomic_json(final / "revision.json", revision)
            check_inventory(final / "artifacts", revision["artifacts"])
            check_inventory(final / "inputs", revision["inputs"])
            state = {**base, "head": revision_id, "sequence": base["sequence"] + 1,
                     "revisionDigests": {**base["revisionDigests"], revision_id: digest(final / "revision.json")},
                     "updatedAt": utc_now()}
            atomic_json(meta / "project.json", state)
        run.update(status="committed", revision=revision_id, endedAt=utc_now())
        atomic_json(run_dir / "run.json", run)
        if not keep_diagnostics:
            for name in ("job.json", "blender.log"):
                (run_dir / name).unlink(missing_ok=True)
        return {**status(root), "runId": run_id, "publishedRevision": revision_id, "elapsedSeconds": elapsed}
    except BaseException as exc:
        # Do not convert a post-publication logging error into a failed edit.
        published = load_project(root)
        is_published = locals().get("revision_id") in published["revisionDigests"]
        run.update(status="committed" if is_published else "failed", endedAt=utc_now(), error=str(exc))
        try:
            atomic_json(run_dir / "run.json", run)
        except OSError:
            # A persistent bookkeeping failure must not invert the already
            # committed result, or mask the original pre-publication error.
            pass
        if is_published:
            return {**status(root), "runId": run_id, "publishedRevision": revision_id,
                    "warning": "revision published; run bookkeeping reported: " + str(exc)}
        raise


def restore(root, revision_id, expected_revision=None, expected_sequence=None):
    root, meta = _meta(root)
    base = load_project(root)
    _check_expected(base, expected_revision, expected_sequence)
    target = _load_revision(meta, base, revision_id)
    if not target:
        raise ProductionError("restore target is missing")
    source_dir = _revision_dir(meta, revision_id)
    new_id = uuid.uuid4().hex
    with project_lock(meta):
        _assert_base(root, base, verify_head=False)
        final = _revision_dir(meta, new_id)
        final.mkdir()
        shutil.copytree(source_dir / "artifacts", final / "artifacts")
        shutil.copytree(source_dir / "inputs", final / "inputs")
        revision = {**target, "id": new_id, "parent": base["head"], "restoredFrom": revision_id,
                    "createdAt": utc_now(), "intent": "Restore revision " + revision_id,
                    "kind": "restore", "runId": None, "elapsedSeconds": 0}
        atomic_json(final / "revision.json", revision)
        check_inventory(final / "artifacts", target["artifacts"])
        check_inventory(final / "inputs", target["inputs"])
        _check_sources(meta, target["sources"])
        state = {**base, "head": new_id, "sequence": base["sequence"] + 1,
                 "revisionDigests": {**base["revisionDigests"], new_id: digest(final / "revision.json")},
                 "updatedAt": utc_now()}
        atomic_json(meta / "project.json", state)
    return status(root)


def deliver(root, blender="blender", views=None, size=384, samples=8, timeout=180,
            expected_revision=None, expected_sequence=None, review_spec=None, executor=None,
            keep_diagnostics=False):
    """Derive a delivery bundle from the selected native without a user edit script."""
    base = load_project(root)
    _check_expected(base, expected_revision, expected_sequence)
    if not base["head"]:
        raise ProductionError("create a native revision before preparing delivery")
    with tempfile.TemporaryDirectory(prefix="refas-delivery-") as temporary:
        script = Path(temporary) / "deliver.py"
        script.write_text("# Prepare delivery from the current native without authoring changes.\n", encoding="utf-8")
        return run_edit(root, script, "Prepare delivery from the current native", blender=blender,
                        views=views, size=size, samples=samples, timeout=timeout,
                        expected_revision=base["head"], expected_sequence=base["sequence"],
                        review_spec=review_spec, executor=executor, output_profile="delivery",
                        keep_diagnostics=keep_diagnostics)


def _temporary_observation(job, output_key, blender, timeout, executor=None):
    """Run a read-only worker query and retain only its JSON value, not a bundle."""
    if not isinstance(timeout, (int, float)) or not 1 <= timeout <= 3600:
        raise ProductionError("timeout must be between 1 and 3600 seconds")
    executable = shutil.which(blender)
    if not executable and executor is None:
        raise ProductionError("Blender executable is unavailable: " + blender)
    with tempfile.TemporaryDirectory(prefix="refas-query-") as temporary:
        folder = Path(temporary)
        output = folder / "output"
        output.mkdir()
        job = {**job, "outputDir": str(output), "views": []}
        atomic_json(folder / "job.json", job)
        worker = Path(__file__).with_name("blender_worker.py")
        command = [executable or blender, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                   "--python", str(worker), "--", "--job", str(folder / "job.json")]
        log = folder / "blender.log"
        try:
            (executor or _execute)(command, folder, log, timeout)
            result = read_json(output / "result.json")
            if (result.get("schema") != "refas.production.result/v2" or result.get("ok") is not True
                    or set(result.get("outputs", {})) != {output_key}):
                raise ProductionError("worker did not return the requested native observation")
            observed = read_json(relative_file(output, result["outputs"][output_key]))
            if observed.get("schema") != "refas.production." + output_key + "/v2":
                raise ProductionError("worker returned an invalid observation schema")
            return observed
        except (ProductionError, OSError, ValueError) as exc:
            tail = ""
            if log.is_file():
                with log.open("rb") as stream:
                    stream.seek(max(0, log.stat().st_size - 2048))
                    tail = stream.read().decode("utf-8", errors="replace")
            raise ProductionError(str(exc) + ("\nBlender diagnostic tail:\n" + tail if tail else "")) from exc


def inspect_native(root=None, objects=(), frames=(), topology=False, blender="blender", timeout=180,
                   expected_revision=None, expected_sequence=None, executor=None, *, input_blend=None):
    """Observe one managed revision or standalone native without adopting its bytes."""
    if (root is None) == (input_blend is None):
        raise ProductionError("inspect requires exactly one of root or input_blend")
    if input_blend is not None:
        if expected_revision is not None or expected_sequence is not None:
            raise ProductionError("expected revision and sequence require a project root")
        native = Path(input_blend).expanduser().resolve()
        if not native.is_file():
            raise ProductionError("input_blend must name an existing native file")
        source = {"revision": None, "inputBlend": str(native)}
    else:
        state = load_project(root)
        _check_expected(state, expected_revision, expected_sequence)
        _, meta = _meta(root)
        revision = _verify_state(meta, state)
        if revision is None:
            raise ProductionError("create a native revision before inspecting it")
        native = relative_file(_revision_dir(meta, revision["id"]) / "artifacts", revision["outputs"]["blend"])
        source = {"revision": revision["id"], "evidenceFreshness": _evidence_freshness(state, revision)}
    objects, frames = list(objects), list(frames)
    if (any(not isinstance(name, str) or not name.strip() for name in objects)
            or len(set(objects)) != len(objects)):
        raise ProductionError("query objects must be unique exact names")
    if any(type(frame) is not int for frame in frames) or len(set(frames)) != len(frames):
        raise ProductionError("query frames must be unique integers")
    before = digest(native)
    job = {"operation": "query", "baseBlend": str(native), "queryTopology": bool(topology)}
    if objects:
        job["queryObjects"] = objects
    if frames:
        job["queryFrames"] = frames
    observed = _temporary_observation(job, "query", blender, timeout, executor)
    if digest(native) != before:
        raise ProductionError("native source changed during inspection")
    if observed.get("blendSha256") != before:
        raise ProductionError("observation does not match the selected native source")
    return {**observed, **source, "nativeSha256": before, "persisted": False}


def export_preflight(blender="blender", timeout=60, executor=None):
    return _temporary_observation({"operation": "preflight"}, "preflight", blender, timeout, executor)


def _file_usage(folder):
    count = size = 0
    if folder.is_symlink():
        raise ProductionError("storage directory cannot be a symlink")
    for path in folder.rglob("*"):
        if path.is_symlink():
            raise ProductionError("symlink in project storage: " + str(path))
        if path.is_file():
            count += 1
            size += path.stat().st_size
    return {"files": count, "bytes": size}


def storage_stats(root):
    state = load_project(root)
    _, meta = _meta(root)
    _verify_state(meta, state)
    groups = {name: _file_usage(relative_file(meta, name)) for name in ("sources", "revisions", "runs")}
    return {"ok": True, "scope": "logical-file-bytes", "head": state["head"], "sequence": state["sequence"],
            "committedRevisions": len(state["revisionDigests"]), "groups": groups,
            "total": _file_usage(meta), "hint": "compact previews only redundant committed run payloads; checkpoints remain"}


def _redundant_run_payloads(meta, state):
    candidates, skipped = [], []
    runs = _runs_dir(meta)
    for revision_id in state["revisionDigests"]:
        revision = _load_revision(meta, state, revision_id, verify=False)
        run_id = revision.get("runId")
        if not run_id:
            continue
        # An authoritative revision owns only its own UUID-named staging folder.
        if not isinstance(run_id, str) or len(run_id) != 32 or any(c not in "0123456789abcdef" for c in run_id):
            raise ProductionError("invalid committed run ID")
        run = relative_file(runs, run_id)
        names = [name for name in ("inputs", "artifacts") if (run / name).exists() or (run / name).is_symlink()]
        if not names:
            continue
        try:
            _load_revision(meta, state, revision_id, verify=True)
            for name in names:
                check_inventory(relative_file(run, name), revision[name])
        except (ProductionError, OSError) as exc:
            skipped.append({"runId": run_id, "reason": str(exc)})
            continue
        candidates.append({"runId": run_id, "revision": revision_id,
                           "paths": ["runs/" + run_id + "/" + name for name in names],
                           "bytes": sum(sum(item["bytes"] for item in revision[name]) for name in names),
                           "files": sum(len(revision[name]) for name in names)})
    return candidates, skipped


def compact(root, apply=False, expected_sequence=None):
    """Remove only byte-verified staging copies already held by committed revisions."""
    state = load_project(root)
    _check_expected(state, None, expected_sequence)
    _, meta = _meta(root)
    _verify_state(meta, state)
    candidates, skipped = _redundant_run_payloads(meta, state)
    reclaimed = 0
    if apply:
        with project_lock(meta):
            _assert_base(root, state)
            for candidate in candidates:
                revision = _load_revision(meta, state, candidate["revision"], verify=True)
                for relative in candidate["paths"]:
                    path = relative_file(meta, relative)
                    check_inventory(path, revision[path.name])
                for relative in candidate["paths"]:
                    shutil.rmtree(relative_file(meta, relative))
                reclaimed += candidate["bytes"]
    return {"ok": True, "scope": "redundant-committed-run-payloads", "applied": bool(apply),
            "head": state["head"], "sequence": state["sequence"], "candidates": candidates, "skipped": skipped,
            "reclaimableBytes": sum(item["bytes"] for item in candidates), "reclaimedBytes": reclaimed,
            "preserved": ["source references", "committed revisions", "failed and uncommitted runs"]}
