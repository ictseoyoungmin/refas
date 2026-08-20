#!/usr/bin/env python3
"""Generate the licensed deterministic wing-cover dogfood reference."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def pixels(points, size):
    return [(round(x * size), round(y * size)) for x, y in points]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--size", type=int, default=900)
    args = parser.parse_args()
    fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    size = args.size

    image = Image.new("RGB", (size, size), (10, 14, 22))
    draw = ImageDraw.Draw(image)
    for row in range(size):
        t = row / max(1, size - 1)
        color = (round(12 + 10 * t), round(18 + 12 * t), round(29 + 18 * t))
        draw.line((0, row, size, row), fill=color)

    outline = pixels(fixture["outline"], size)
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.polygon([(x + size * 0.018, y + size * 0.025) for x, y in outline], fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.018))
    image = Image.alpha_composite(image.convert("RGBA"), shadow)
    draw = ImageDraw.Draw(image)

    draw.polygon(outline, fill=(117, 79, 34, 255), outline=(238, 192, 88, 255), width=max(5, size // 90))
    palette = [(29, 83, 116), (35, 101, 134), (43, 112, 139), (26, 74, 108)]
    for index, cell in enumerate(fixture["cells"]):
        polygon = pixels(cell["polygon"], size)
        base = palette[index % len(palette)]
        draw.polygon(polygon, fill=(*base, 255), outline=(224, 171, 67, 255), width=max(3, size // 180))
        highlight = tuple(min(255, channel + 35) for channel in base)
        draw.line(polygon[: max(2, len(polygon) // 2 + 1)], fill=(*highlight, 210), width=max(1, size // 450), joint="curve")

    draw.line(outline + [outline[0]], fill=(248, 204, 103, 255), width=max(7, size // 75), joint="curve")
    draw.line(outline + [outline[0]], fill=(103, 62, 25, 255), width=max(2, size // 280), joint="curve")
    center = fixture["fastener"]["center"]
    radius = fixture["fastener"]["radius"]
    box = tuple(round(value * size) for value in (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius))
    draw.ellipse(box, fill=(199, 143, 50, 255), outline=(255, 224, 132, 255), width=max(3, size // 180))
    inner = tuple(round(value * size) for value in (center[0] - radius * 0.38, center[1] - radius * 0.38, center[0] + radius * 0.38, center[1] + radius * 0.38))
    draw.ellipse(inner, fill=(93, 58, 28, 255))

    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output, format="PNG", optimize=False)


if __name__ == "__main__":
    main()
