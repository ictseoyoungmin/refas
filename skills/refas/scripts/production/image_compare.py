"""Read-only raster coverage comparison; no reference or asset approval.

Coordinates are top-left pixels; bounds are exclusive on right/bottom. No shape registration, contour-distance gate or target approval is inferred.
"""
from array import array
import hashlib
import math
import struct


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _size(width, height):
    _require(type(width) is int and type(height) is int and 1 <= width <= 2048
             and 1 <= height <= 2048 and width * height <= 1048576,
             "dimensions require integers 1..2048 and area <=1048576")


def validate_regions(value, width, height):
    _size(width, height)
    _require(isinstance(value, dict) and set(value) == {"regions"}, "expected only regions field")
    rows = value["regions"]
    _require(isinstance(rows, list) and 1 <= len(rows) <= 16, "expected 1..16 regions")
    result, names = [], set()
    for row in rows:
        _require(isinstance(row, dict) and not set(row) - {"name", "role", "rectPixels", "maxChangedPixels"},
                 "unknown region fields")
        name, role, rect = row.get("name"), row.get("role"), row.get("rectPixels")
        _require(isinstance(name, str) and 1 <= len(name) <= 64 and name == name.strip()
                 and name not in names, "names require unique trimmed strings (1..64 chars)")
        _require(role in ("target", "protected"), "role must be target or protected")
        _require(isinstance(rect, list) and len(rect) == 4 and all(type(n) is int for n in rect),
                 "rectPixels requires four integers")
        left, top, right, bottom = rect
        _require(0 <= left < right <= width and 0 <= top < bottom <= height,
                 "rectPixels must have positive area inside image")
        for other in result:
            a, b, c, d = other["rectPixels"]
            _require(not (left < c and a < right and top < d and b < bottom), "regions overlap")
        normalized = {"name": name, "role": role, "rectPixels": list(rect)}
        if role == "target":
            _require("maxChangedPixels" not in row, "target cannot declare thresholds")
        else:
            limit = row.get("maxChangedPixels")
            _require(type(limit) is int and limit >= 0, "maxChangedPixels requires nonnegative integer")
            normalized["maxChangedPixels"] = limit
        result.append(normalized)
        names.add(name)
    _require(any(row["role"] == "protected" for row in result), "protected region required")
    return result


def _mask(value, count):
    try:
        _require(len(value) == count, "mask length must match image dimensions")
        _require(all(type(n) in (int, bool) and n in (0, 1) for n in value), "expected binary sequence")
        return bytearray(value)
    except TypeError as exc:
        raise ValueError("masks must be flat binary sequences") from exc


def _metrics(before, after, width, rect):
    left, top, right, bottom = rect
    baseline = candidate = intersection = 0
    bounds = [right, bottom, left, top]
    for y in range(top, bottom):
        for x in range(left, right):
            i = y * width + x
            old, new = before[i], after[i]
            baseline += old
            candidate += new
            intersection += old & new
            if old != new:
                bounds = [min(bounds[0], x), min(bounds[1], y),
                          max(bounds[2], x + 1), max(bounds[3], y + 1)]
    added, removed = candidate - intersection, baseline - intersection
    union, changed = baseline + candidate - intersection, added + removed
    return {"baselinePixels": baseline, "candidatePixels": candidate, "intersectionPixels": intersection,
            "unionPixels": union, "addedPixels": added, "removedPixels": removed, "changedPixels": changed,
            "iou": intersection / union if union else None,
            "changedBoundsPixels": bounds if changed else None}


def compare_masks(before, after, width, height, regions):
    rows = validate_regions(regions, width, height)
    before, after = _mask(before, width * height), _mask(after, width * height)
    args = before, after, width
    whole = _metrics(*args, [0, 0, width, height])
    observations, protected, covered = [], 0, 0
    for row in rows:
        metrics = _metrics(*args, row["rectPixels"])
        l, t, r, bottom = row["rectPixels"]
        area = (r - l) * (bottom - t)
        covered += area
        status = "changed" if metrics["changedPixels"] else "unchanged"
        if row["role"] == "protected":
            protected += area
            bad = metrics["changedPixels"] > row["maxChangedPixels"]
            status = "protected-regression" if bad else "within-protected-limits"
        observations.append({**row, "metrics": metrics, "status": status})
    statuses = {row["status"] for row in observations}
    empty = not whole["baselinePixels"] or not whole["candidatePixels"]
    decision = ("protected-regression" if "protected-regression" in statuses else
                "inconclusive" if empty else "within-protected-limits")
    return {"schema": "refas.production.comparison/v2", "imageSize": [width, height],
            "maskRule": {"channel": "alpha", "threshold": 0.5, "operator": ">=", "origin": "top-left"},
            "global": whole, "regions": observations, "decision": decision,
            "protectedCoverage": {"pixels": protected, "fraction": protected / (width * height),
                                  "unprotectedPixels": width * height - protected},
            "unassessedPixels": width * height - covered,
            "scope": "single-view rendered coverage; target changes and uncovered pixels are not approved",
            "assessment": {key: "not-evaluated" for key in
                           ("targetImprovement", "referenceResemblance", "gameReadiness")},
            "persisted": False}


def _png_hash(path, expected_size):
    with open(path, "rb") as stream:
        header = stream.read(24)
        if (len(header) != 24 or header[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
                or struct.unpack(">II", header[16:24]) != tuple(expected_size)):
            raise ValueError("PNG header dimensions must match the bounded expected image size")
        digest = hashlib.sha256(header)
        for chunk in iter(lambda: stream.read(1048576), b""):
            digest.update(chunk)
        return digest.hexdigest()


def compare_images(before_path, after_path, regions, expected_size):
    """Decode actual RGBA PNG alpha with Blender; no host image dependency."""
    if not isinstance(expected_size, (list, tuple)) or len(expected_size) != 2:
        raise ValueError("expected_size must contain width and height")
    width, height = expected_size
    validate_regions(regions, width, height)
    import bpy

    def read(path):
        image = None
        try:
            digest = _png_hash(path, expected_size)
            image = bpy.data.images.load(str(path), check_existing=False)
            if tuple(image.size) != (width, height) or image.channels != 4:
                raise ValueError("comparison images must be same-sized RGBA PNGs")
            pixels = array("f", [0.0]) * (width * height * 4)
            image.pixels.foreach_get(pixels)
            mask = bytearray(width * height)
            for y in range(height):
                for x in range(width):
                    alpha = pixels[((height - 1 - y) * width + x) * 4 + 3]
                    if not math.isfinite(alpha) or not 0 <= alpha <= 1:
                        raise ValueError("PNG alpha must be finite and between zero and one")
                    mask[y * width + x] = alpha >= 0.5
            if _png_hash(path, expected_size) != digest:
                raise ValueError("PNG changed while decoding")
            return mask, digest
        except (OSError, RuntimeError) as exc:
            raise ValueError("cannot decode comparison PNG: " + str(exc)) from exc
        finally:
            if image is not None:
                bpy.data.images.remove(image)

    before, before_sha = read(before_path)
    after, after_sha = read(after_path)
    return {**compare_masks(before, after, width, height, regions),
            "inputSha256": {"baseline": before_sha, "candidate": after_sha}}
