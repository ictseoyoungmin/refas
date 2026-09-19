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
    # Preserve the near-perfect whole registration while making the local attachment
    # unambiguously wrong under non-IoU perceptual evidence. The checker corruption
    # adds both strong local edge disagreement and large color disagreement, while
    # the displaced original patch preserves the intended attachment-error fixture.
    fastener_box = (190, 138, 226, 177)
    patch = improved.crop(fastener_box)
    draw = ImageDraw.Draw(improved)
    tile = 4
    for y in range(fastener_box[1], fastener_box[3], tile):
        for x in range(fastener_box[0], fastener_box[2], tile):
            phase = ((x - fastener_box[0]) // tile + (y - fastener_box[1]) // tile) % 2
            fill = (255, 0, 255) if phase == 0 else (0, 255, 64)
            draw.rectangle((x, y, min(x + tile - 1, fastener_box[2] - 1), min(y + tile - 1, fastener_box[3] - 1)), fill=fill)
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
