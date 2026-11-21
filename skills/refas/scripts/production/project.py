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
    if not revision_id:
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
    return revision


def verify_project(root):
    state = load_project(root)
    _, meta = _meta(root)
    for source in state["sources"]:
        check_inventory(meta, [source], exact=False)
    current = load_revision(root)
    return {"ok": True, "scope": "recorded-file-integrity", "head": state["head"],
            "artifactCount": len(current["artifacts"]) if current else 0,
            "referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"}


def _runs_dir(meta):
    folder = relative_file(meta, "runs")
    if not folder.is_dir():
        raise ProductionError("project run directory is missing")
    return folder


def status(root):
    state = load_project(root)
    _, meta = _meta(root)
    current = load_revision(root)
    revisions = []
    committed_run_ids = set()
    for revision_id in state["revisionDigests"]:
        rev = load_revision(root, revision_id, verify=False)
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
                runs.append({"id": run.get("id"), "status": run.get("status"), "error": run.get("error")})
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
            "referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"}


def _assert_base(root, base, verify_head=True):
    latest = load_project(root)
    if latest != base:
        raise ProductionError("project changed during execution; candidate retained, current revision untouched")
    if verify_head:
        verify_project(root)
    else:
        # Recovery may replace a damaged HEAD with an intact older bundle.
        # Keep source identity and the state lease strict without requiring
        # the damaged payload to pass the very check recovery will repair.
        _, meta = _meta(root)
        for source in latest["sources"]:
            check_inventory(meta, [source], exact=False)


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


def _validate_worker_result(artifact_dir):
    result = read_json(artifact_dir / "result.json")
    if result.get("schema") != "refas.production.result/v2" or result.get("ok") is not True:
        raise ProductionError("worker did not report a successful production result")
    outputs = result.get("outputs", {})
    if set(outputs) != {"blend", "glb", "scene"}:
        raise ProductionError("worker must return native, GLB and scene inventory")
    for key, suffix in (("blend", ".blend"), ("glb", ".glb"), ("scene", ".json")):
        path = relative_file(artifact_dir, outputs[key])
        if path.suffix != suffix or not path.is_file() or not path.stat().st_size:
            raise ProductionError("worker output missing or wrong type: " + key)
    with relative_file(artifact_dir, outputs["blend"]).open("rb") as stream:
        if stream.read(7) != b"BLENDER":
            raise ProductionError("native output is not an uncompressed Blender project")
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
             size=384, samples=8, timeout=180, expected_revision=None, executor=None, review_spec=None):
    root, meta = _meta(root)
    base = load_project(root)
    verify_project(root)
    if expected_revision is not None and expected_revision != (base["head"] or "none"):
        raise ProductionError("expected revision is not current")
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
    views = list(views) if views is not None else ([v["name"] for v in review["views"]] if review else ["hero", "side"])
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
           "intent": intent.strip(), "baseRevision": base["head"], "startedAt": utc_now()}
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
            current = load_revision(root)
            source_blend = relative_file(_revision_dir(meta, base["head"]) / "artifacts", current["outputs"]["blend"])
        if source_blend:
            if not source_blend.is_file():
                raise ProductionError("native input is missing")
            source_sha = digest(source_blend)
            shutil.copy2(source_blend, inputs / "base.blend")
            if digest(inputs / "base.blend") != source_sha or digest(source_blend) != source_sha:
                raise ProductionError("native input changed during capture")
        frozen_inputs = inventory(inputs)
        job = {"operation": "edit", "baseBlend": str(inputs / "base.blend") if source_blend else None,
               "script": str(inputs / "edit.py"), "inputDir": str(inputs), "outputDir": str(artifact_dir),
               "views": views, "render": {"engine": "CYCLES", "samples": samples, "size": size}}
        if review:
            job["reviewSpec"] = str(inputs / "review.json")
        atomic_json(run_dir / "job.json", job)
        worker = Path(__file__).with_name("blender_worker.py")
        command = [executable or blender, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                   "--python", str(worker), "--", "--job", str(run_dir / "job.json")]
        elapsed = (executor or _execute)(command, run_dir, run_dir / "blender.log", timeout)
        check_inventory(inputs, frozen_inputs)
        result = _validate_worker_result(artifact_dir)
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
                    "warnings": result.get("warnings", []),
                    "assessment": {"referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"}}
        with project_lock(meta):
            _assert_base(root, base)
            final = _revision_dir(meta, revision_id)
            # Build a complete revision before publishing its pointer. Interrupted
            # orphan revisions are retained and never mistaken for the current one.
            final.mkdir()
            shutil.copytree(artifact_dir, final / "artifacts")
            shutil.copytree(inputs, final / "inputs")
            atomic_json(final / "revision.json", revision)
            check_inventory(final / "artifacts", revision["artifacts"])
            check_inventory(final / "inputs", revision["inputs"])
            state = {**base, "head": revision_id, "sequence": base["sequence"] + 1,
                     "revisionDigests": {**base["revisionDigests"], revision_id: digest(final / "revision.json")},
                     "updatedAt": utc_now()}
            atomic_json(meta / "project.json", state)
        run.update(status="committed", revision=revision_id, endedAt=utc_now())
        atomic_json(run_dir / "run.json", run)
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


def restore(root, revision_id, expected_revision=None):
    root, meta = _meta(root)
    base = load_project(root)
    if expected_revision is not None and expected_revision != (base["head"] or "none"):
        raise ProductionError("expected revision is not current")
    target = load_revision(root, revision_id)
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
        state = {**base, "head": new_id, "sequence": base["sequence"] + 1,
                 "revisionDigests": {**base["revisionDigests"], new_id: digest(final / "revision.json")},
                 "updatedAt": utc_now()}
        atomic_json(meta / "project.json", state)
    return status(root)
