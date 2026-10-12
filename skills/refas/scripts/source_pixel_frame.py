#!/usr/bin/env python3
"""Trusted decode-only replay of one frozen primary reference byte snapshot.

The calling Node runtime owns source/manifest SHA and path authority. The
Python worker receives original bytes over stdin, never arbitrary file paths
or a caller-authored success report.
"""
from __future__ import annotations

import json
import sys

from source_manifest import MAX_PRIMARY_IMAGE_BYTES, inspect_primary_image


def main() -> None:
    raw = sys.stdin.buffer.read(MAX_PRIMARY_IMAGE_BYTES + 1)
    if not raw or len(raw) > MAX_PRIMARY_IMAGE_BYTES:
        raise ValueError("source pixel frame exceeds encoded-byte budget")
    width, height = inspect_primary_image(raw)
    print(json.dumps({
        "width": width,
        "height": height,
        "coordinateSpace": "encoded-top-left",
        "frameCount": 1,
    }, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print(f"source pixel-frame replay rejected: {error}", file=sys.stderr)
        sys.exit(2)
