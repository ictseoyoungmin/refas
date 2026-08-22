#!/usr/bin/env python3
"""Create declared negative image fixtures for registered-comparison dogfood."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def sha256(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--render", required=True)
    parser.add_argument("--render-report", required=True)
    parser.add_argument("--registration", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    scripts = Path(__file__).resolve().parents[2] / "skills" / "refas" / "scripts"
    sys.path.insert(0, str(scripts))
    from compare_registered import warp_source  # pylint: disable=import-outside-toplevel

    source = Image.open(args.source).convert("RGB")
    render = Image.open(args.render).convert("RGB")
    registration = json.loads(Path(args.registration).read_text())
    base_report = json.loads(Path(args.render_report).read_text())
    output = Path(args.out); output.mkdir(parents=True, exist_ok=True)

    shifted = Image.new("RGB", render.size, tuple(render.getpixel((0, 0))))
    resized = render.resize((round(render.width * 0.86), round(render.height * 0.86)), Image.Resampling.BICUBIC)
    shifted.paste(resized, (30, 4))
    improved = warp_source(source, render.size, registration["homographyChildToParent"])
    # Preserve the near-perfect whole silhouette while making the local attachment visibly wrong.
    fastener_box = (190, 138, 226, 177)
    patch = improved.crop(fastener_box)
    ImageDraw.Draw(improved).rectangle(fastener_box, fill=(123, 190, 194))
    improved.paste(patch, (fastener_box[0] - 38, fastener_box[1] - 20))

    for name, image, purpose in (
        ("shifted-scaled", shifted, "deliberate whole-frame shift and scale failure"),
        ("better-global-worse-local", improved, "better global silhouette with deliberately displaced fastener attachment"),
    ):
        directory = output / name; directory.mkdir(exist_ok=True)
        image_path = directory / "hero.png"; image.save(image_path, format="PNG", optimize=False)
        report = json.loads(json.dumps(base_report))
        hero = next(frame for frame in report["frames"] if frame["path"] == "hero.png")
        hero["sha256"] = sha256(image_path)
        hero.pop("silhouetteSha256", None)
        report["runtime"] = {"kind": "declared-negative-image-fixture", "networkRequests": 0, "deterministicInputs": True, "purpose": purpose}
        report["claimScope"] = "registered-comparison-negative-test-only"
        (directory / "render-report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
