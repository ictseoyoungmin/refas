#!/usr/bin/env python3
"""Bind a primary reference image to a portable RefAs source manifest.

Original source bytes remain the authority. No displayed-orientation transform or
image synthesis is performed by this intake helper.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

# Bound the actual decode, not merely the metadata dimensions. This is a
# conservative intake limit rather than an asset-resolution quality claim.
MAX_PRIMARY_IMAGE_PIXELS = 40_000_000
MAX_PRIMARY_IMAGE_BYTES = 256 * 1024 * 1024


def sha256(source_bytes: bytes) -> str:
    return hashlib.sha256(source_bytes).hexdigest()


def contained_path(root: Path, candidate: Path, label: str) -> Path:
    root = root.resolve()
    candidate = candidate.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} must remain inside the project root") from error
    return candidate


def inspect_primary_image(source_bytes: bytes) -> tuple[int, int]:
    """Read and decode one original still frame in canonical encoded orientation.

    RefAs v1 source coordinates are relative to the encoded width/height.
    Applying EXIF orientation implicitly would make observed normalized source
    points refer to a different raster than later source/GLB comparisons.
    Until an explicit orientation-aware source-coordinate contract exists, a
    rotated/mirrored EXIF input must fail closed rather than silently pass.
    """
    if not source_bytes or len(source_bytes) > MAX_PRIMARY_IMAGE_BYTES:
        raise ValueError("primary image exceeds the supported encoded-byte budget")
    try:
        # Pillow PNG verify() must be the first operation after open; even
        # reading EXIF can consume internal PNG chunks before verify().
        with Image.open(BytesIO(source_bytes)) as image:
            image.verify()
        # Decode and inspect the same immutable SHA-bound source bytes using
        # a fresh decoder; do not reuse a consumed verify() handle.
        with Image.open(BytesIO(source_bytes)) as image:
            width, height = image.size
            if width < 1 or height < 1 or width * height > MAX_PRIMARY_IMAGE_PIXELS:
                raise ValueError("primary image exceeds the supported pixel budget")
            if getattr(image, "n_frames", 1) != 1:
                raise ValueError("primary source must be a single still image")
            orientation = int(image.getexif().get(274, 1))
            if orientation != 1:
                raise ValueError(
                    f"primary image EXIF orientation {orientation} is not canonical; "
                    "preserve the original and explicitly normalize a source copy before intake"
                )
            image.load()
        return width, height
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("primary image cannot be decoded completely") from error


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
    if image_path == output_path:
        raise ValueError("manifest output must not overwrite the primary source image")
    if not image_path.is_file():
        raise ValueError("image must be a file")
    source_bytes = image_path.read_bytes()
    width, height = inspect_primary_image(source_bytes)
    acquisition = json.loads(args.acquisition) if args.acquisition else {}
    if not isinstance(acquisition, dict):
        raise ValueError("acquisition must be a JSON object")
    manifest = {
        "schema": "refas.source-manifest/v1",
        "id": args.id,
        "path": image_path.relative_to(root).as_posix(),
        "sha256": sha256(source_bytes),
        "sizeBytes": len(source_bytes),
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
