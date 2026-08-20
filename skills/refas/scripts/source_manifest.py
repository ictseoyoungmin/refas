#!/usr/bin/env python3
"""Bind a primary reference image to a portable RefAs source manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def contained_path(root: Path, candidate: Path, label: str) -> Path:
    root = root.resolve()
    candidate = candidate.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} must remain inside the project root") from error
    return candidate


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a RefAs primary source manifest")
    parser.add_argument("--root", required=True, help="RefAs project root")
    parser.add_argument("--image", required=True, help="primary image inside the project root")
    parser.add_argument("--id", required=True, help="semantic source ID")
    parser.add_argument("--out", required=True, help="manifest output inside the project root")
    parser.add_argument("--acquisition", help="optional JSON object with camera or retrieval context")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    image_path = contained_path(root, Path(args.image), "image")
    output_path = contained_path(root, Path(args.out), "output")
    if not image_path.is_file():
        raise ValueError("image must be a file")
    with Image.open(image_path) as image:
        width, height = image.size
        image.verify()
    acquisition = json.loads(args.acquisition) if args.acquisition else {}
    if not isinstance(acquisition, dict):
        raise ValueError("acquisition must be a JSON object")
    manifest = {
        "schema": "refas.source-manifest/v1",
        "id": args.id,
        "path": image_path.relative_to(root).as_posix(),
        "sha256": sha256(image_path),
        "sizeBytes": image_path.stat().st_size,
        "width": width,
        "height": height,
        "authority": "primary",
        "acquisition": acquisition,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "manifest": str(output_path), "sourceSha256": manifest["sha256"]}, indent=2))


if __name__ == "__main__":
    main()
