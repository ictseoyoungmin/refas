#!/usr/bin/env python3
"""Presentation-only combined review board from digest-verified source render reports."""
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

from PIL import Image

from render_glb import make_board, sha256


VIEWS = ('hero', 'oblique', 'side', 'top', 'grazing', 'normal', 'object-id', 'albedo')


def _load_report(directory: Path, expected_scope: str):
    report_file = directory / 'render-report.json'
    report = json.loads(report_file.read_text(encoding='utf-8'))
    if expected_scope == 'portable':
        if report.get('schema') != 'refas.multiview-render-report/v1' or report.get('status') != 'PASS':
            raise ValueError('portable report must be a complete integrity PASS')
        source = report.get('frames', [])
        entries = {f['path'].removesuffix('.png'): f for f in source}
        asset = report.get('assetSha256')
        frame = report.get('frameDigest')
    else:
        if (report.get('schema') != 'refas.pbr-render-report/v1' or
            report.get('claimScope') != expected_scope):
            raise ValueError(f'{expected_scope} requires an authoritative canonical PBR report')
        if expected_scope == 'shape-resemblance-only' and report.get('presentation', {}).get('mode') != 'neutral-clay':
            raise ValueError('clay report must use canonical neutral-clay presentation')
        source = report.get('outputs', [])
        entries = {f['viewId']: f for f in source}
        asset = report.get('assetSha256')
        frame = report.get('frameDigest')
    if (not isinstance(asset, str) or len(asset) != 64 or
        not isinstance(frame, str) or len(frame) != 64):
        raise ValueError('renderer report is missing bound asset/frame digests')
    if len(entries) != len(source):
        raise ValueError('duplicate view IDs are not allowed')
    return report, entries, asset, frame


def _frame(directory: Path, entries: dict, view: str, label: str):
    entry = entries.get(view)
    if entry is None:
        raise ValueError(f'required {label} view {view} is absent')
    # Reports record logical evidence paths. Only canonical basenames may be opened
    # below this exact trusted input directory; never follow arbitrary report paths.
    logical = entry.get('path', '')
    if not isinstance(logical, str) or Path(logical).name != view + '.png':
        raise ValueError(f'noncanonical {label} frame path')
    actual = directory / (view + '.png')
    if actual.is_symlink() or not actual.is_file():
        raise ValueError(f'missing or symlinked {label} frame: {view}')
    if sha256(actual) != entry.get('sha256'):
        raise ValueError(f'{label} frame digest mismatch: {view}')
    return {'label':label.upper(), 'absolutePath':str(actual)}


def _presentation_warning(frame: dict):
    """Non-authoritative image readability hint, never a fidelity verdict.

    Inspect only already digest-verified canonical frames. A near-flat clay or
    normal picture may support a silhouette but cannot show local surface
    curvature/normals. A valid flat object may legitimately trigger this hint.
    """
    label = frame['label']
    if not (label.startswith('NEUTRAL-CLAY ') or label == 'PBR NORMAL'):
        return None
    with Image.open(frame['absolutePath']) as source:
        rgb = source.convert('RGB')
        count = rgb.getcolors(maxcolors=3)
        if count is None or len(count) > 2:
            return None
    return {
        'code': 'LOW_SURFACE_INFORMATION',
        'view': label,
        'severity': 'REVIEW',
        'observedRgbColorsAtMost': len(count),
        'meaning': 'This pass offers little visible interior shading; it may still support silhouette inspection.',
        'nextAction': 'Inspect a diagnostic image with real surface normals or lighting before inferring local relief.',
        'sourceFrameSha256': sha256(Path(frame['absolutePath'])),
        'certificationAuthority': 'NONE',
    }


def _framing_warning(frame: dict):
    """Heuristic border-contact warning, not proof that a camera was misregistered."""
    label = frame['label']
    if not (label.endswith(' HERO') or label.startswith('PORTABLE HERO')):
        return None
    with Image.open(frame['absolutePath']) as source:
        rgb = source.convert('RGB')
        width, height = rgb.size
        if width < 8 or height < 8:
            return None
        corners = [rgb.getpixel((x, y)) for x, y in
                   [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]]
        if corners.count(corners[0]) < 3:
            return None  # Cannot identify a background robustly enough for a warning.
        background = corners[0]
        edges = {
            'left': [(0, y) for y in range(height)],
            'right': [(width - 1, y) for y in range(height)],
            'top': [(x, 0) for x in range(width)],
            'bottom': [(x, height - 1) for x in range(width)],
        }
        touched = [side for side, pixels in edges.items()
                   if sum(rgb.getpixel(pixel) != background for pixel in pixels) / len(pixels) > 0.03]
        if not touched:
            return None
    return {
        'code': 'POSSIBLE_FRAME_CLIPPING',
        'view': label,
        'severity': 'REVIEW',
        'touchingImageEdges': touched,
        'meaning': 'Foreground appears on the frame border; this can be an intentional crop or a clipped model.',
        'nextAction': 'Check original-camera mapping and render framing before using border silhouette measurements.',
        'sourceFrameSha256': sha256(Path(frame['absolutePath'])),
        'certificationAuthority': 'NONE',
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--portable', required=True)
    p.add_argument('--pbr', required=True)
    p.add_argument('--clay')
    p.add_argument('--reference')
    p.add_argument('--out', required=True)
    a = p.parse_args()
    portable, pbr = Path(a.portable).resolve(), Path(a.pbr).resolve()
    _, port_entries, port_asset, port_frame = _load_report(portable, 'portable')
    _, pbr_entries, pbr_asset, pbr_frame = _load_report(pbr, 'visual-fidelity')
    if (port_asset, port_frame) != (pbr_asset, pbr_frame):
        raise ValueError('portable/PBR candidate or camera frame digest mismatch')
    if a.clay:
        clay = Path(a.clay).resolve()
        _, clay_entries, clay_asset, clay_frame = _load_report(clay, 'shape-resemblance-only')
        if (port_asset, port_frame) != (clay_asset, clay_frame):
            raise ValueError('clay candidate or camera frame digest mismatch')
    else:
        clay, clay_entries = None, None

    # Digest-check every included image before publishing a composite.
    # A camera/frame digest match only proves shared renderer input, not photo registration.
    frames = [_frame(portable, port_entries, 'hero', 'portable hero (registration unverified)')]
    if clay:
        frames += [_frame(clay, clay_entries, view, 'neutral-clay ' + view) for view in ('hero', 'side', 'top')]
    frames += [_frame(pbr, pbr_entries, view, 'PBR ' + view) for view in VIEWS]
    reference = Path(a.reference).resolve() if a.reference else None
    if reference and (reference.is_symlink() or not reference.is_file()):
        raise ValueError('reference must be an existing regular image file')
    out = Path(a.out).resolve()
    if out.suffix.lower() != '.png':
        raise ValueError('combined board output must be a .png')
    for source_dir in (portable, pbr, clay):
        if source_dir and (out == source_dir or source_dir in out.parents):
            raise ValueError('review board must not overwrite or reside inside immutable source render evidence')
    out.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.refas-review-', dir=out.parent))
    try:
        image = stage / 'board.png'
        make_board(reference, frames, image)
        warnings = []
        for f in frames:
            warnings.extend(w for w in (_presentation_warning(f), _framing_warning(f)) if w is not None)
        manifest = {
            'schema':'refas.combined-review-board/v1',
            'claimScope':'presentation-only',
            'eligibleForCertification':False,
            'presentationWarnings':warnings,
            'assetSha256':port_asset,
            'frameDigest':port_frame,
            'sourceImageSha256':sha256(reference) if reference else None,
            'boardSha256':sha256(image),
            'cells':[{'label':v['label'],'sha256':sha256(Path(v['absolutePath']))} for v in frames],
        }
        if reference:
            manifest['cells'].insert(0, {'label':'RAW REFERENCE','sha256':manifest['sourceImageSha256']})
        output_manifest = out.with_suffix('.json')
        (stage/'board.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        os.replace(image, out)
        os.replace(stage/'board.json', output_manifest)
    finally:
        for candidate in stage.iterdir():
            candidate.unlink(missing_ok=True)
        stage.rmdir()
    print(json.dumps({'status':'PASS','claimScope':'presentation-only','board':str(out),
                      'manifest':str(output_manifest),'cells':len(manifest['cells'])},indent=2))


if __name__ == '__main__':
    main()
