#!/usr/bin/env python3
"""Read-only, independent original-photo / registered-render pixel observation.

This module reuses the installed compare_registered foreground/warp algorithm,
but does NOT read worker-authored registered-comparison metrics or authorize
Reference Fidelity. The caller binds and checks exact source, hero and
registration bytes before this script runs.
"""
import argparse
import json
from pathlib import Path
from PIL import Image
from compare_registered import (
    foreground_mask, perceptual_metrics, roi_box, warp_source,
)


def main():
    parser = argparse.ArgumentParser(description="Trusted source-to-render pixel observation aid")
    parser.add_argument("--source", required=True)
    parser.add_argument("--hero", required=True)
    parser.add_argument("--registration", required=True)
    parser.add_argument("--roi", default="[0,0,1,1]")
    args = parser.parse_args()

    registration = json.loads(Path(args.registration).read_text(encoding="utf8"))
    if registration.get("schema") != "refas.reference-registration/v1":
        raise ValueError("registered pixel evidence requires actual canonical reference-registration")
    source = Image.open(args.source).convert("RGB")
    hero = Image.open(args.hero).convert("RGB")
    source.load()
    hero.load()
    if min(*source.size, *hero.size) < 32 or max(*hero.size) > 1024:
        raise ValueError("registered pixel evidence image dimensions outside supported bounds")
    if source.width * source.height > 36_000_000:
        raise ValueError("registered pixel evidence exceeds decoded source-image pixel budget")
    roi = json.loads(args.roi)
    if not isinstance(roi, list) or len(roi) != 4:
        raise ValueError("registered pixel evidence ROI requires normalized 4-element box")
    if any(not isinstance(x, (int, float)) or not 0 <= x <= 1 for x in roi):
        raise ValueError("registered pixel evidence ROI must be finite normalized coordinates")
    box = roi_box(roi, hero.width, hero.height)
    aligned = warp_source(source, hero.size, registration["homographyChildToParent"])
    src, rnd = aligned.crop(box), hero.crop(box)
    a, b = foreground_mask(src), foreground_mask(rnd)
    metrics = perceptual_metrics(src, rnd, a, b)
    print(json.dumps({
        "schema": "refas.independent-source-render-pixels/v1",
        "claimScope": "derived-contradiction-evidence-only",
        "cannotAuthorizeReferenceFidelity": True,
        "sourceForegroundPixels": int(a.sum()),
        "renderForegroundPixels": int(b.sum()),
        "roi": roi,
        "renderDimensions": list(hero.size),
        "perceptual": metrics,
    }, allow_nan=False, sort_keys=True))


if __name__ == "__main__":
    main()
