#!/usr/bin/env python3
"""Compatibility adapter for the published v1.2.1 evidence --image contract.

The normal observation pipeline is the request/utility workflow. This adapter
preserves the legacy CLI output layout and manifest for existing integrations.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps
from evidence_request import extract
from observation_image import digest_json, make_board, roi_pixels, sha256
from source_manifest import inspect_primary_image

LEGACY_NAMES = ('context','crop','contrast','low-frequency','high-frequency',
                'gradient','edges','highlights')
LEGACY_RECIPE = {
    'schema':'refas.evidence-recipe/v1',
    'contrast':'autocontrast+1.15',
    'lowFrequency':'gaussian',
    'gradient':'finite-difference',
    'edgePercentile':78,
    'highlightPercentile':95,
}


def publish_legacy(staging: Path, out: Path):
    out.mkdir(parents=True,exist_ok=True)
    names=[name+'.png' for name in LEGACY_NAMES]+['evidence-board.png','manifest.json']
    backup=Path(tempfile.mkdtemp(prefix='.refas-legacy-backup-',dir=out.parent))
    moved=[]; created=[]
    try:
        for name in names:
            destination=out/name
            if destination.is_symlink() or (destination.exists() and not destination.is_file()):
                raise ValueError('legacy evidence output contains unsupported target')
            if destination.exists():
                os.replace(destination,backup/name)
                moved.append(name)
            os.replace(staging/name,destination)
            created.append(name)
    except BaseException:
        for name in reversed(created):
            (out/name).unlink(missing_ok=True)
        for name in reversed(moved):
            os.replace(backup/name,out/name)
        raise
    finally:
        shutil.rmtree(backup,ignore_errors=True)


def produce(image_path, out_path, scope, roi_str, padding):
    original=Path(image_path)
    if original.is_symlink() or not original.is_file():
        raise ValueError('legacy source must be a regular image file')
    original=original.resolve()
    out=Path(out_path).resolve()
    if original.is_relative_to(out) or out==original or out in original.parents:
        raise ValueError('legacy evidence output overlaps the original source')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}',scope):
        raise ValueError('legacy scope must be a safe ID')
    raw=original.read_bytes()
    width,height=inspect_primary_image(raw)
    with Image.open(BytesIO(raw)) as im:
        source=im.convert('RGB')
    roi=[float(x) for x in roi_str.split(',')]
    box=roi_pixels(roi,width,height)
    if box[2]<=box[0] or box[3]<=box[1]:
        raise ValueError('legacy ROI is subpixel or empty')
    padding=max(0.,min(.5,float(padding)))
    x,y,w,h=roi
    context_bounds=[max(0.,x-padding),max(0.,y-padding),
                    min(1.,x+w+padding),min(1.,y+h+padding)]
    context_roi=[context_bounds[0],context_bounds[1],
                 context_bounds[2]-context_bounds[0],context_bounds[3]-context_bounds[1]]
    context_box=tuple(round(v*scale) for v,scale in
                      zip(context_bounds,(width,height,width,height)))
    crop=source.crop(box)
    context=source.crop(context_box)
    overlay=context.copy()
    draw=ImageDraw.Draw(overlay)
    draw.rectangle((box[0]-context_box[0],box[1]-context_box[1],
                    box[2]-context_box[0],box[3]-context_box[1]),
                   outline=(255,91,52),width=max(2,round(min(source.size)/350)))
    images={'context':overlay,'crop':crop}
    for category in LEGACY_NAMES[2:]:
        if category=='low-frequency':
            gray=ImageOps.grayscale(crop)
            images[category]=gray.filter(ImageFilter.GaussianBlur(
                radius=max(1.2,min(gray.size)/120)))
        else:
            images[category]=extract(crop,category)
    source_digest=sha256(original)
    recipe_digest=digest_json(LEGACY_RECIPE)
    records=[{'id':scope+'.raw-source','kind':'primary','primary':True,
              'path':str(original),'sha256':source_digest,'sourceSha256':source_digest,
              'recipeDigest':None,'width':width,'height':height}]
    out.parent.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='.refas-legacy-stage-',dir=out.parent))
    try:
        for name in LEGACY_NAMES:
            target=stage/(name+'.png')
            images[name].save(target,format='PNG',optimize=False)
            records.append({'id':scope+'.'+name,'kind':'derived-observation-aid',
                'primary':False,'sourceSha256':source_digest,
                'recipeDigest':recipe_digest,'path':target.name,
                'sha256':sha256(target),'width':images[name].width,
                'height':images[name].height})
        board=stage/'evidence-board.png'
        make_board([('RAW SOURCE',source)]+[(n.replace('-',' ').upper(),images[n])
                                           for n in LEGACY_NAMES],board)
        manifest={'schema':'refas.evidence-manifest/v1','scopeId':scope,
            'source':{'path':str(original),'sha256':source_digest,
                      'width':width,'height':height},
            'roi':roi,'contextRoi':context_roi,'contextPadding':padding,
            'recipe':LEGACY_RECIPE,'recipeDigest':recipe_digest,
            'authority':{'rawReferenceIsPrimary':True,
                         'derivedViewsAreObservationAidsOnly':True,
                         'geometryFromPixelsForbidden':True},
            'items':records,
            'board':{'path':board.name,'sha256':sha256(board)}}
        (stage/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        if sha256(original)!=source_digest:
            raise ValueError('original source changed while building legacy observation views')
        publish_legacy(stage,out)
        print(json.dumps({'status':'PASS','manifest':str(out/'manifest.json'),
                          'board':str(out/'evidence-board.png'),
                          'sourceSha256':source_digest},indent=2))
    finally:
        shutil.rmtree(stage,ignore_errors=True)


def main():
    parser=argparse.ArgumentParser(description='Published v1.2.1 evidence CLI compatibility')
    parser.add_argument('--image',required=True)
    parser.add_argument('--out',required=True)
    parser.add_argument('--scope',default='whole')
    parser.add_argument('--roi',default='0,0,1,1')
    parser.add_argument('--padding',default='0.08',type=float)
    args=parser.parse_args()
    produce(args.image,args.out,args.scope,args.roi,args.padding)


if __name__=='__main__':
    main()
