#!/usr/bin/env python3
"""Build digest-bound, registration-aware source/render critique evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


SCHEMA = "refas.registered-comparison/v1"
CONTRACT_FIXTURE_ACQUISITIONS = {
    "test-fixture",
    "deterministic-project-fixture",
    "synthetic-test-fixture",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest_json(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(payload).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def font(size: int):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"):
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def checked_path(root: Path, value: str, label: str) -> Path:
    result = (root / value).resolve() if not Path(value).is_absolute() else Path(value).resolve()
    if not result.is_file():
        raise ValueError(f"{label} does not exist: {result}")
    return result


def checked_reference(bases, value: str, label: str) -> Path:
    if Path(value).is_absolute():
        return checked_path(Path("/"), value, label)
    for base in bases:
        candidate = (base / value).resolve()
        if candidate.is_file():
            return candidate
    raise ValueError(f"{label} does not exist relative to its manifest or project root: {value}")


def verify_digest(path: Path, expected: str, label: str):
    actual = sha256(path)
    if actual != expected:
        raise ValueError(f"{label} digest mismatch: expected {expected}, got {actual}")


def verify_embedded_digest(value, field, label):
    expected = value.get(field)
    payload = dict(value)
    payload.pop(field, None)
    if not isinstance(expected, str) or len(expected) != 64 or digest_json(payload) != expected:
        raise ValueError(f"{label} {field} mismatch")


def source_requires_realized_projection(source_manifest):
    kind = str(source_manifest.get("acquisition", {}).get("kind", "")).lower()
    return kind not in CONTRACT_FIXTURE_ACQUISITIONS


def apply_h(matrix, point):
    x, y = point
    w = matrix[6] * x + matrix[7] * y + matrix[8]
    if abs(w) < 1e-12:
        raise ValueError("registration maps a point to infinity")
    return [(matrix[0] * x + matrix[1] * y + matrix[2]) / w,
            (matrix[3] * x + matrix[4] * y + matrix[5]) / w]


def warp_source(source: Image.Image, size, child_to_parent):
    sw, sh = source.size
    rw, rh = size
    # PIL maps output pixels to input pixels. Convert normalized child->parent H.
    s_child = np.array([[1 / rw, 0, 0], [0, 1 / rh, 0], [0, 0, 1]], dtype=float)
    s_parent = np.array([[sw, 0, 0], [0, sh, 0], [0, 0, 1]], dtype=float)
    h = s_parent @ np.asarray(child_to_parent, dtype=float).reshape(3, 3) @ s_child
    h /= h[2, 2]
    coeffs = tuple(h.flatten()[:8])
    return source.transform(size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)


def roi_box(roi, width, height, padding=0.0):
    x, y, w, h = map(float, roi)
    x0, y0 = max(0.0, x - padding), max(0.0, y - padding)
    x1, y1 = min(1.0, x + w + padding), min(1.0, y + h + padding)
    if x1 <= x0 or y1 <= y0:
        raise ValueError("scope ROI is empty")
    return (round(x0 * width), round(y0 * height), round(x1 * width), round(y1 * height))


def foreground_mask(image: Image.Image):
    arr = np.asarray(image.convert("RGB"), dtype=np.int16)
    corners = np.concatenate((arr[:8, :8].reshape(-1, 3), arr[:8, -8:].reshape(-1, 3),
                              arr[-8:, :8].reshape(-1, 3), arr[-8:, -8:].reshape(-1, 3)))
    bg = np.median(corners, axis=0)
    delta = np.sqrt(np.sum((arr - bg) ** 2, axis=2))
    return delta > max(18.0, float(np.percentile(delta, 55)) * 0.35)


def edge_mask(image: Image.Image):
    gray = np.asarray(ImageOps.grayscale(image), dtype=np.float32)
    gy, gx = np.gradient(gray)
    mag = np.hypot(gx, gy)
    return mag >= max(10.0, float(np.percentile(mag, 82)))


def fit_tile(image: Image.Image, size=(360, 300)):
    canvas = Image.new("RGB", size, (14, 17, 21))
    fitted = ImageOps.contain(image.convert("RGB"), (size[0] - 12, size[1] - 12), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
    return canvas


def make_board(title, ancestry, images, metrics, output):
    cell_w, cell_h, header = 360, 300, 38
    board = Image.new("RGB", (cell_w * 3, 74 + (cell_h + header) * 2), (10, 12, 16))
    draw = ImageDraw.Draw(board)
    draw.text((14, 10), title, fill=(245, 247, 250), font=font(22))
    landmark_text = ""
    if metrics.get("landmarkResidualRmse") is not None:
        landmark_text = f"   anchor RMSE {metrics['landmarkResidualRmse']:.4f}"
    draw.text((14, 40), f"ANCESTRY: {' > '.join(ancestry)}   IoU {metrics['silhouetteIoU']:.4f}{landmark_text} (aids only)",
              fill=(164, 178, 196), font=font(14))
    for index, (label, image) in enumerate(images):
        x, y = (index % 3) * cell_w, 74 + (index // 3) * (cell_h + header)
        board.paste(fit_tile(image, (cell_w, cell_h)), (x, y + header))
        draw.text((x + 12, y + 9), label, fill=(228, 234, 242), font=font(16))
    board.save(output, format="PNG", optimize=False)


def load_projection_evidence(root, spec, source_manifest, render_report, registration):
    raw_entries = spec.get("projectionEvidence", [])
    if raw_entries and (spec.get("landmarks") or spec.get("dimensions")):
        raise ValueError("manual landmarks/dimensions cannot be mixed with realized projection evidence")
    required = source_requires_realized_projection(source_manifest)
    scope_ids = list(spec.get("scopeIds", []))
    if required and not raw_entries:
        raise ValueError("real-source registered comparison requires realized projection evidence")
    by_scope = {}
    bindings = []
    for index, raw in enumerate(raw_entries):
        scope_id = str(raw.get("scopeId", ""))
        if not scope_id or scope_id in by_scope:
            raise ValueError(f"projectionEvidence[{index}] has a missing or duplicate scopeId")
        geometry_path = checked_path(root, raw.get("referenceGeometry", ""), f"projectionEvidence[{index}].referenceGeometry")
        realized_path = checked_path(root, raw.get("realizedProjection", ""), f"projectionEvidence[{index}].realizedProjection")
        geometry = load_json(geometry_path)
        proof = load_json(realized_path)
        if geometry.get("schema") != "refas.reference-geometry/v1":
            raise ValueError(f"projectionEvidence[{index}] reference geometry schema is invalid")
        if proof.get("schema") != "refas.realized-projection/v1":
            raise ValueError(f"projectionEvidence[{index}] realized projection schema is invalid")
        verify_embedded_digest(geometry, "geometryDigest", f"projectionEvidence[{index}] reference geometry")
        verify_embedded_digest(proof, "realizedProjectionDigest", f"projectionEvidence[{index}] realized projection")
        fit = proof.get("projectionFit", {})
        verify_embedded_digest(fit, "projectionFitDigest", f"projectionEvidence[{index}] projection fit")
        if geometry.get("scopeId") != scope_id or proof.get("scopeId") != scope_id or fit.get("scopeId") != scope_id:
            raise ValueError(f"projectionEvidence[{index}] scope binding mismatch")
        if geometry.get("sourceSha256") != source_manifest.get("sha256") or proof.get("sourceSha256") != source_manifest.get("sha256"):
            raise ValueError(f"projectionEvidence[{index}] source digest mismatch")
        if fit.get("referenceGeometryDigest") != geometry.get("geometryDigest"):
            raise ValueError(f"projectionEvidence[{index}] does not bind the supplied reference geometry")
        asset_sha = render_report.get("asset", {}).get("sha256")
        if proof.get("assetSha256") != asset_sha:
            raise ValueError(f"projectionEvidence[{index}] realized GLB digest does not match the rendered asset")
        if proof.get("projectionFitDigest") != fit.get("projectionFitDigest"):
            raise ValueError(f"projectionEvidence[{index}] projection fit digest binding mismatch")

        anchor_by_id = {item["id"]: item for item in geometry.get("anchors", [])}
        landmarks = []
        for item in fit.get("anchorProjections", []):
            reference_id = item.get("referenceId")
            anchor = anchor_by_id.get(reference_id)
            if not anchor:
                raise ValueError(f"projectionEvidence[{index}] projection references unknown anchor: {reference_id}")
            source_xy = item.get("sourceXY")
            if source_xy != anchor.get("xy"):
                raise ValueError(f"projectionEvidence[{index}] source anchor coordinates drifted: {reference_id}")
            projected_xy = item.get("projectedXY")
            residual = item.get("errorNormalized")
            if not (isinstance(projected_xy, list) and len(projected_xy) == 2 and all(np.isfinite(projected_xy))):
                raise ValueError(f"projectionEvidence[{index}] projected anchor is invalid: {reference_id}")
            if not isinstance(residual, (int, float)) or not np.isfinite(residual):
                raise ValueError(f"projectionEvidence[{index}] residual is invalid: {reference_id}")
            landmarks.append({
                "id": reference_id,
                "sourceNormalized": source_xy,
                "registeredSourceNormalized": apply_h(registration["homographyParentToChild"], source_xy),
                "realizedRenderNormalized": projected_xy,
                "residualNormalized": float(residual),
                "insideFrame": bool(item.get("insideFrame", all(0 <= value <= 1 for value in projected_xy))),
                "importance": anchor.get("importance"),
                "visibility": anchor.get("visibility"),
                "confidence": anchor.get("confidence"),
                "semanticRole": anchor.get("semanticRole", ""),
                "evidenceClass": "derived-observation-aid",
            })
        if not landmarks:
            raise ValueError(f"projectionEvidence[{index}] must realize at least one anchor")

        dimension_by_id = {item["id"]: item for item in geometry.get("dimensions", [])}
        dimensions = []
        for item in fit.get("dimensionResiduals", []):
            definition = dimension_by_id.get(item.get("id"))
            if not definition:
                raise ValueError(f"projectionEvidence[{index}] dimension residual references unknown dimension: {item.get('id')}")
            source_value = item.get("sourceValue")
            projected_value = item.get("projectedValue")
            dimensions.append({
                "id": item["id"],
                "kind": definition.get("kind"),
                "aAnchorId": definition.get("aAnchorId"),
                "bAnchorId": definition.get("bAnchorId"),
                "evaluable": bool(item.get("evaluable")),
                "sourceNormalizedLength": source_value,
                "renderNormalizedLength": projected_value,
                "ratioRenderToSource": (float(projected_value) / max(float(source_value), 1e-12))
                    if isinstance(source_value, (int, float)) and isinstance(projected_value, (int, float)) else None,
                "relativeError": item.get("relativeError"),
                "evidenceClass": "derived-observation-aid",
            })

        metrics = fit.get("metrics", {})
        expected_rmse = float(np.sqrt(np.mean([item["residualNormalized"] ** 2 for item in landmarks])))
        fit_rmse = metrics.get("anchorRmseNormalized")
        if fit_rmse is None or abs(float(fit_rmse) - expected_rmse) > 1e-10:
            raise ValueError(f"projectionEvidence[{index}] anchor RMSE is inconsistent with realized anchors")
        binding = {
            "scopeId": scope_id,
            "referenceGeometryPath": str(geometry_path),
            "referenceGeometryFileSha256": sha256(geometry_path),
            "referenceGeometryDigest": geometry["geometryDigest"],
            "realizedProjectionPath": str(realized_path),
            "realizedProjectionFileSha256": sha256(realized_path),
            "realizedProjectionDigest": proof["realizedProjectionDigest"],
            "projectionFitDigest": fit["projectionFitDigest"],
            "assetSha256": proof["assetSha256"],
        }
        by_scope[scope_id] = {
            "measurementAuthority": "realized-projection",
            "landmarks": landmarks,
            "dimensions": dimensions,
            "binding": binding,
            "fitMetrics": metrics,
        }
        bindings.append(binding)

    if required:
        missing = [scope_id for scope_id in scope_ids if scope_id not in by_scope]
        if missing:
            raise ValueError(f"real-source registered comparison lacks realized projection evidence for scopes: {', '.join(missing)}")
    return by_scope, bindings, required


def fixture_measurements(spec, scope_id, registration):
    local_landmarks = []
    for landmark in spec.get("landmarks", []):
        if landmark["scopeId"] != scope_id:
            continue
        mapped_point = apply_h(registration["homographyParentToChild"], landmark["source"])
        residual = float(np.hypot(mapped_point[0] - landmark["render"][0], mapped_point[1] - landmark["render"][1]))
        local_landmarks.append({
            "id": landmark["id"],
            "sourceNormalized": landmark["source"],
            "registeredSourceNormalized": mapped_point,
            "declaredRenderNormalized": landmark["render"],
            "residualNormalized": residual,
            "evidenceClass": "derived-observation-aid",
        })
    dimensions = []
    by_id = {item["id"]: item for item in local_landmarks}
    for dimension in spec.get("dimensions", []):
        if dimension["a"] in by_id and dimension["b"] in by_id:
            a, b = by_id[dimension["a"]], by_id[dimension["b"]]
            sd = float(np.hypot(a["sourceNormalized"][0] - b["sourceNormalized"][0], a["sourceNormalized"][1] - b["sourceNormalized"][1]))
            rd = float(np.hypot(a["declaredRenderNormalized"][0] - b["declaredRenderNormalized"][0], a["declaredRenderNormalized"][1] - b["declaredRenderNormalized"][1]))
            dimensions.append({
                "id": dimension["id"],
                "sourceNormalizedLength": sd,
                "renderNormalizedLength": rd,
                "ratioRenderToSource": rd / max(sd, 1e-12),
                "evidenceClass": "derived-observation-aid",
            })
    return {
        "measurementAuthority": "declared-test-fixture" if local_landmarks else "image-only",
        "landmarks": local_landmarks,
        "dimensions": dimensions,
        "binding": None,
        "fitMetrics": {},
    }


def main():
    parser = argparse.ArgumentParser(description="RefAs registered comparison evidence")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    input_path = Path(args.input).resolve()
    root = input_path.parent
    spec = load_json(input_path)
    if spec.get("schema") != "refas.registered-comparison-input/v1":
        raise ValueError("input schema must be refas.registered-comparison-input/v1")

    source_manifest_path = checked_path(root, spec["sourceManifest"], "source manifest")
    render_report_path = checked_path(root, spec["renderReport"], "render report")
    registration_path = checked_path(root, spec["registration"], "registration")
    hierarchy_path = checked_path(root, spec["hierarchy"], "hierarchy")
    source_manifest, render_report = load_json(source_manifest_path), load_json(render_report_path)
    registration, hierarchy = load_json(registration_path), load_json(hierarchy_path)
    source_path = checked_reference([source_manifest_path.parent, source_manifest_path.parent.parent, root], source_manifest["path"], "source image")
    render_path = checked_path(render_report_path.parent, spec["renderImage"], "render image")
    verify_digest(source_path, source_manifest["sha256"], "source image")
    frame_id = str(spec["frameId"]).lower()
    frame = next((f for f in render_report.get("frames", []) if str(f.get("id", "")).lower() == frame_id
                  or Path(str(f.get("path", ""))).stem.lower() == frame_id or str(f.get("label", "")).lower() == frame_id), None)
    if not frame:
        raise ValueError("frameId is absent from render report")
    verify_digest(render_path, frame["sha256"], "render frame")
    if registration.get("parentSourceSha256") != source_manifest["sha256"]:
        raise ValueError("registration parent digest does not bind the source")
    if registration.get("childSourceSha256") != frame["sha256"]:
        raise ValueError("registration child digest does not bind the selected render frame")

    projection_by_scope, projection_bindings, projection_required = load_projection_evidence(
        root, spec, source_manifest, render_report, registration
    )

    source = Image.open(source_path).convert("RGB")
    render = Image.open(render_path).convert("RGB")
    registered_source = warp_source(source, render.size, registration["homographyChildToParent"])
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    node_by_id = {node["id"]: node for node in hierarchy["nodes"]}
    records, scope_reports = [], []

    for scope_id in spec["scopeIds"]:
        node = node_by_id.get(scope_id)
        if not node:
            raise ValueError(f"unknown hierarchy scope: {scope_id}")
        ancestry, cursor = [], node
        while cursor:
            ancestry.append(cursor["id"])
            cursor = node_by_id.get(cursor.get("parentId"))
        ancestry.reverse()
        corners = [(node["roi"][0], node["roi"][1]), (node["roi"][0] + node["roi"][2], node["roi"][1]),
                   (node["roi"][0] + node["roi"][2], node["roi"][1] + node["roi"][3]), (node["roi"][0], node["roi"][1] + node["roi"][3])]
        mapped = [apply_h(registration["homographyParentToChild"], point) for point in corners]
        child_roi = [min(p[0] for p in mapped), min(p[1] for p in mapped), max(p[0] for p in mapped) - min(p[0] for p in mapped), max(p[1] for p in mapped) - min(p[1] for p in mapped)]
        box = roi_box(child_roi, render.width, render.height, float(node.get("contextPadding", 0)))
        src_crop, render_crop = registered_source.crop(box), render.crop(box)
        overlay_opacity = float(spec.get("overlayOpacity", 0.5))
        if not 0 <= overlay_opacity <= 1:
            raise ValueError("overlayOpacity must be in [0,1]")
        overlay = Image.blend(src_crop, render_crop, overlay_opacity)
        grid_draw = ImageDraw.Draw(overlay)
        for fraction in (0.25, 0.5, 0.75):
            grid_draw.line((round(overlay.width * fraction), 0, round(overlay.width * fraction), overlay.height), fill=(255, 210, 64), width=1)
            grid_draw.line((0, round(overlay.height * fraction), overlay.width, round(overlay.height * fraction)), fill=(255, 210, 64), width=1)
        split = src_crop.copy()
        split.paste(render_crop.crop((render_crop.width // 2, 0, render_crop.width, render_crop.height)), (render_crop.width // 2, 0))
        split_draw = ImageDraw.Draw(split)
        split_draw.line((render_crop.width // 2, 0, render_crop.width // 2, render_crop.height), fill=(255, 210, 64), width=3)
        source_edges, render_edges = edge_mask(src_crop), edge_mask(render_crop)
        edges = np.zeros((src_crop.height, src_crop.width, 3), dtype=np.uint8)
        edges[source_edges] = [255, 69, 78]
        edges[render_edges] = np.maximum(edges[render_edges], [42, 205, 255])
        edge_image = Image.fromarray(edges)
        source_mask, render_mask = foreground_mask(src_crop), foreground_mask(render_crop)
        union = np.logical_or(source_mask, render_mask)
        intersection = np.logical_and(source_mask, render_mask)
        iou = float(intersection.sum() / max(1, union.sum()))
        diff = np.zeros((src_crop.height, src_crop.width, 3), dtype=np.uint8)
        diff[np.logical_and(source_mask, ~render_mask)] = [255, 68, 68]
        diff[np.logical_and(~source_mask, render_mask)] = [45, 199, 255]
        diff[np.logical_and(source_mask, render_mask)] = [55, 70, 58]
        diff_image = Image.fromarray(diff)
        context = render.copy()
        context_draw = ImageDraw.Draw(context)
        context_draw.rectangle(box, outline=(255, 210, 64), width=max(2, render.width // 180))

        measurements = projection_by_scope.get(scope_id) or fixture_measurements(spec, scope_id, registration)
        local_landmarks = measurements["landmarks"]
        dimensions = measurements["dimensions"]
        fit_metrics = measurements["fitMetrics"]
        metrics = {
            "silhouetteIoU": iou,
            "sourceForegroundPixels": int(source_mask.sum()),
            "renderForegroundPixels": int(render_mask.sum()),
            "landmarkResidualRmse": float(np.sqrt(np.mean([x["residualNormalized"] ** 2 for x in local_landmarks]))) if local_landmarks else None,
            "macroLandmarkResidualRmse": fit_metrics.get("macroAnchorRmseNormalized"),
            "projectedAnchorsOutsideFrame": fit_metrics.get("projectedAnchorsOutsideFrame"),
            "dimensionMeanRelativeError": fit_metrics.get("dimensionMeanRelativeError"),
        }
        if measurements["measurementAuthority"] == "realized-projection" and metrics["landmarkResidualRmse"] is None:
            raise ValueError(f"realized projection scope {scope_id} cannot emit null landmarkResidualRmse")

        scope_dir = out / scope_id
        scope_dir.mkdir(exist_ok=True)
        image_set = [("WHOLE CONTEXT + SCOPE", context), ("REGISTERED SOURCE", src_crop), ("CURRENT RENDER", render_crop),
                     (f"OVERLAY {overlay_opacity:.2f} + GRID", overlay), ("SPLIT SOURCE | RENDER", split), ("EDGES red=source cyan=render", edge_image),
                     ("SILHOUETTE DIFFERENCE", diff_image)]
        image_records = []
        for label, image in image_set:
            name = label.lower().replace(" ", "-").replace("/", "-").replace("|", "-").replace("=", "-") + ".png"
            image_path = scope_dir / name
            image.save(image_path, format="PNG", optimize=False)
            image_records.append({"label": label, "path": str(image_path.relative_to(out)), "sha256": sha256(image_path),
                                  "width": image.width, "height": image.height, "evidenceClass": "derived-observation-aid"})
        board_path = scope_dir / "comparison-board.png"
        make_board(f"REGISTERED COMPARISON — {scope_id}", ancestry, image_set[:6], metrics, board_path)
        image_records.append({"label": "COMPARISON BOARD", "path": str(board_path.relative_to(out)), "sha256": sha256(board_path),
                              "width": 1080, "height": 750, "evidenceClass": "derived-observation-aid"})
        records.extend(image_records)
        scope_reports.append({
            "scopeId": scope_id,
            "level": node["level"],
            "ancestry": ancestry,
            "sourceRoi": node["roi"],
            "registeredRenderRoi": child_roi,
            "measurementAuthority": measurements["measurementAuthority"],
            "projectionBinding": measurements["binding"],
            "metrics": metrics,
            "landmarks": local_landmarks,
            "dimensions": dimensions,
            "images": image_records,
        })

    report = {
        "schema": SCHEMA,
        "claimScope": "critique-evidence-only",
        "source": {
            "manifestPath": str(source_manifest_path),
            "manifestSha256": sha256(source_manifest_path),
            "sha256": source_manifest["sha256"],
            "acquisitionKind": str(source_manifest.get("acquisition", {}).get("kind", "")),
        },
        "render": {
            "reportPath": str(render_report_path),
            "reportSha256": sha256(render_report_path),
            "assetSha256": render_report["asset"]["sha256"],
            "frameId": spec["frameId"],
            "frameSha256": frame["sha256"],
        },
        "registration": {
            "path": str(registration_path),
            "fileSha256": sha256(registration_path),
            "digest": registration["registrationDigest"],
            "model": registration["model"],
            "metrics": registration["metrics"],
        },
        "hierarchy": {
            "path": str(hierarchy_path),
            "fileSha256": sha256(hierarchy_path),
            "digest": hierarchy["hierarchyDigest"],
        },
        "projectionEvidence": projection_bindings,
        "scopes": scope_reports,
        "policy": {
            "rawSourceRemainsPrimary": True,
            "outputsAreDerivedObservationAids": True,
            "metricsCannotSetVisualGate": True,
            "metricFailureRequiresTypedFindingBeforeRouting": True,
            "registrationResidualIsNotShapeTruth": True,
            "realSourceLandmarksMustUseRealizedProjection": True,
            "manualRenderCoordinatesCannotClaimRealSourceGeometry": True,
            "projectionMetricsRemainVetoOnly": True,
        },
        "inputDigest": digest_json(spec),
    }
    report["comparisonDigest"] = digest_json(report)
    report_path = out / "comparison-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "PASS",
        "report": str(report_path),
        "comparisonDigest": report["comparisonDigest"],
        "scopes": len(scope_reports),
        "projectionEvidenceRequired": projection_required,
        "projectionEvidenceScopes": len(projection_bindings),
    }, indent=2))


if __name__ == "__main__":
    main()
