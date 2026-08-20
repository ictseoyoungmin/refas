#!/usr/bin/env python3
"""Generate observation aids while preserving the raw reference as truth authority."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest_json(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def font(size: int):
    for candidate in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"):
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def save(image: Image.Image, path: Path) -> dict:
    image.save(path, format="PNG", optimize=False)
    return {"path": path.name, "sha256": sha256(path), "width": image.width, "height": image.height}


def normalize_uint8(array: np.ndarray) -> np.ndarray:
    array = np.nan_to_num(array.astype(np.float32))
    lo, hi = float(np.percentile(array, 1)), float(np.percentile(array, 99))
    if hi <= lo + 1e-8:
        return np.zeros(array.shape, dtype=np.uint8)
    return np.clip((array - lo) / (hi - lo) * 255.0, 0, 255).astype(np.uint8)


def roi_pixels(roi, width: int, height: int):
    if len(roi) != 4:
        raise ValueError("ROI must be normalized [x,y,width,height]")
    x, y, w, h = map(float, roi)
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1 or y + h > 1:
        raise ValueError("ROI must lie within [0,1]")
    return (round(x * width), round(y * height), round((x + w) * width), round((y + h) * height))


def make_board(items: list[tuple[str, Image.Image]], output: Path):
    cell_w, cell_h, header = 420, 360, 42
    columns = 3
    rows = (len(items) + columns - 1) // columns
    board = Image.new("RGB", (columns * cell_w, rows * (cell_h + header)), (14, 17, 21))
    draw = ImageDraw.Draw(board)
    label_font = font(18)
    for index, (label, image) in enumerate(items):
        column, row = index % columns, index // columns
        x, y = column * cell_w, row * (cell_h + header)
        fitted = ImageOps.contain(image.convert("RGB"), (cell_w - 20, cell_h - 20), Image.Resampling.LANCZOS)
        board.paste(fitted, (x + (cell_w - fitted.width) // 2, y + header + (cell_h - fitted.height) // 2))
        draw.text((x + 12, y + 10), label, fill=(235, 240, 246), font=label_font)
    board.save(output, format="PNG")


def main():
    parser = argparse.ArgumentParser(description="RefAs hierarchy-preserving visual evidence generator")
    parser.add_argument("--image", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--roi", default="0,0,1,1", help="normalized x,y,width,height")
    parser.add_argument("--scope", default="whole")
    parser.add_argument("--padding", type=float, default=0.08)
    args = parser.parse_args()

    source_path = Path(args.image).resolve()
    output = Path(args.out).resolve()
    output.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGB")
    roi = [float(value) for value in args.roi.split(",")]
    box = roi_pixels(roi, source.width, source.height)
    padding = max(0.0, min(0.5, args.padding))
    x, y, w, h = roi
    context_bounds = [max(0, x - padding), max(0, y - padding), min(1, x + w + padding), min(1, y + h + padding)]
    context_roi = [context_bounds[0], context_bounds[1], context_bounds[2] - context_bounds[0], context_bounds[3] - context_bounds[1]]
    context_box = (round(context_bounds[0] * source.width), round(context_bounds[1] * source.height), round(context_bounds[2] * source.width), round(context_bounds[3] * source.height))
    crop = source.crop(box)
    context = source.crop(context_box)
    context_overlay = context.copy()
    overlay_draw = ImageDraw.Draw(context_overlay)
    overlay_draw.rectangle((box[0] - context_box[0], box[1] - context_box[1], box[2] - context_box[0], box[3] - context_box[1]), outline=(255, 91, 52), width=max(2, round(min(source.size) / 350)))

    gray = ImageOps.grayscale(crop)
    contrast = ImageEnhance.Contrast(ImageOps.autocontrast(gray)).enhance(1.15)
    low = gray.filter(ImageFilter.GaussianBlur(radius=max(1.2, min(crop.size) / 120)))
    high = ImageChops.add(ImageChops.subtract(gray, low, scale=1.0, offset=128), Image.new("L", gray.size, 0))
    array = np.asarray(gray, dtype=np.float32)
    gy, gx = np.gradient(array)
    gradient = np.hypot(gx, gy)
    gradient_image = Image.fromarray(normalize_uint8(gradient), mode="L")
    threshold = float(np.percentile(gradient, 78))
    edges = Image.fromarray(np.where(gradient >= threshold, 255, 0).astype(np.uint8), mode="L")
    brightness = np.asarray(crop, dtype=np.float32).max(axis=2)
    highlight_threshold = float(np.percentile(brightness, 95))
    highlights = Image.fromarray(np.where(brightness >= highlight_threshold, 255, 0).astype(np.uint8), mode="L")

    recipe = {
        "schema": "refas.evidence-recipe/v1",
        "contrast": "autocontrast+1.15",
        "lowFrequency": "gaussian",
        "gradient": "finite-difference",
        "edgePercentile": 78,
        "highlightPercentile": 95,
    }
    recipe_digest = digest_json(recipe)
    source_sha256 = sha256(source_path)
    images = {
        "context": context_overlay,
        "crop": crop,
        "contrast": contrast,
        "low-frequency": low,
        "high-frequency": high,
        "gradient": gradient_image,
        "edges": edges,
        "highlights": highlights,
    }
    records = [{
        "id": f"{args.scope}.raw-source",
        "kind": "primary",
        "primary": True,
        "path": str(source_path),
        "sha256": source_sha256,
        "sourceSha256": source_sha256,
        "recipeDigest": None,
        "width": source.width,
        "height": source.height,
    }]
    for name, image in images.items():
        path = output / f"{name}.png"
        record = save(image, path)
        records.append({
            "id": f"{args.scope}.{name}",
            "kind": "derived-observation-aid",
            "primary": False,
            "sourceSha256": source_sha256,
            "recipeDigest": recipe_digest,
            **record,
        })
    board_path = output / "evidence-board.png"
    make_board([("RAW SOURCE", source), *[(name.replace("-", " ").upper(), image) for name, image in images.items()]], board_path)
    manifest = {
        "schema": "refas.evidence-manifest/v1",
        "scopeId": args.scope,
        "source": {"path": str(source_path), "sha256": source_sha256, "width": source.width, "height": source.height},
        "roi": roi,
        "contextRoi": context_roi,
        "contextPadding": padding,
        "recipe": recipe,
        "recipeDigest": recipe_digest,
        "authority": {"rawReferenceIsPrimary": True, "derivedViewsAreObservationAidsOnly": True, "geometryFromPixelsForbidden": True},
        "items": records,
        "board": {"path": board_path.name, "sha256": sha256(board_path)},
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "manifest": str(manifest_path), "board": str(board_path), "sourceSha256": source_sha256}, indent=2))


if __name__ == "__main__":
    main()
