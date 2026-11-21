#!/usr/bin/env python3
"""Render an unchanged native candidate with this case's common review setup."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time


HERE = Path(__file__).resolve().parent
WORKER = HERE.parents[1] / "skills/refas/scripts/production/blender_worker.py"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blend", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--samples", type=int, default=24)
    args = parser.parse_args()
    source, out = args.blend.resolve(), args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    review = out / "review.json"
    shutil.copy2(HERE / "review.json", review)
    config = json.loads(review.read_text())
    original = sha(source)
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    prepare = [args.blender, "-b", "--factory-startup", "--threads", "2",
               "--python-exit-code", "1", "--python", str(HERE / "prepare_observation.py"),
               "--", str(source), str(out / "observation.blend")]
    with (out / "prepare.log").open("w") as log:
        subprocess.run(prepare, stdout=log, stderr=subprocess.STDOUT,
                       env=env, timeout=120, check=True)
    job = {"operation": "inspect", "baseBlend": str(out / "observation.blend"),
           "outputDir": str(out / "renders"), "reviewSpec": str(review),
           "views": [view["name"] for view in config["views"]],
           "render": {"engine": "CYCLES", "size": args.size, "samples": args.samples}}
    (out / "job.json").write_text(json.dumps(job, indent=2) + "\n")
    command = [args.blender, "-b", "--factory-startup", "--threads", "2",
               "--python-exit-code", "1", "--python", str(WORKER),
               "--", "--job", str(out / "job.json")]
    started = time.monotonic()
    with (out / "blender.log").open("w") as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT,
            env=env, timeout=900)
    record = {"inputSha256": original, "inputUnchanged": sha(source) == original,
              "reviewSha256": sha(review), "workerSha256": sha(WORKER),
              "observationBlendSha256": sha(out / "observation.blend"),
              "normalizationRecordSha256": sha(out / "normalization.json"),
              "normalization": "Curves realized in a separate observation copy; source unchanged",
              "elapsedSeconds": round(time.monotonic() - started, 3),
              "returncode": result.returncode,
              "scope": "Common observation after construction; excluded from trial timing"}
    (out / "observation.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record))
    if result.returncode or not record["inputUnchanged"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
