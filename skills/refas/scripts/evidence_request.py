#!/usr/bin/env python3
"""On-demand, multi-source visual observation aids. Never source-fidelity authority."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import stat
import tempfile
import time
from io import BytesIO
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, BadZipFile

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from source_manifest import inspect_primary_image, MAX_PRIMARY_IMAGE_BYTES
from observation_image import digest_json, make_board, normalize_uint8, roi_pixels, sha256

REQUEST_SCHEMA = 'refas.evidence-request/v1'
OUTPUT_SCHEMA = 'refas.observation-aid-set/v1'
ANALYSES = frozenset(('crop', 'context', 'edges', 'gradient', 'contrast', 'low-frequency',
                     'high-frequency', 'highlights', 'alpha-mask'))
MAX_SOURCES = 64
MAX_VIEWS = 160
MAX_TOTAL_PIXELS = 40_000_000
MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_BOARD_CELLS = 24
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')


def name(value, label):
    if not isinstance(value, str) or not NAME.fullmatch(value) or value in ('.', '..'):
        raise ValueError(f'{label} must be a safe nonempty ID')
    return value


def path_inside(root: Path, value, label):
    if not isinstance(value, str) or not value or Path(value).is_absolute() or '..' in Path(value).parts:
        raise ValueError(f'{label} must be a project-relative path without traversal')
    location = root / value
    if location.is_symlink() or not location.resolve().is_relative_to(root):
        raise ValueError(f'{label} cannot escape project root or use symlinks')
    location = location.resolve()
    if not location.is_file():
        raise ValueError(f'{label} must point to an existing regular file')
    return location


def digest(expected, label):
    if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise ValueError(f'{label} requires exact lowercase SHA-256')
    return expected


def checked_bytes(file, expected, label, max_bytes=MAX_PRIMARY_IMAGE_BYTES):
    if file.stat().st_size > max_bytes:
        raise ValueError(f'{label} exceeds encoded byte budget')
    content = file.read_bytes()
    actual = hashlib.sha256(content).hexdigest()
    if actual != digest(expected, label):
        raise ValueError(f'{label} SHA-256 mismatch')
    return content


def read_image(content, label):
    # The same conservative decoding, EXIF and single-still contract as source intake.
    width, height = inspect_primary_image(content)
    with Image.open(BytesIO(content)) as image:
        image.load()
        return image.copy(), width, height


def zip_bytes(source, root):
    file = path_inside(root, source['archive'], 'archive')
    archive_sha = digest(source.get('archiveSha256'), 'archiveSha256')
    raw = checked_bytes(file, archive_sha, 'archive', MAX_ARCHIVE_BYTES)
    member = source.get('member')
    if (not isinstance(member, str) or '\\' in member or
        str(PurePosixPath(member)) != member or member.startswith('/') or
        '..' in PurePosixPath(member).parts):
        raise ValueError('ZIP member must be an exact safe relative POSIX path')
    try:
        with ZipFile(BytesIO(raw)) as store:
            if len(store.infolist()) > 2048:
                raise ValueError('ZIP member count exceeds supported limit')
            info = store.getinfo(member)
            if info.is_dir() or stat.S_IFMT(info.external_attr >> 16) == stat.S_IFLNK:
                raise ValueError('ZIP member cannot be directory or symlink')
            if info.file_size > MAX_PRIMARY_IMAGE_BYTES or info.compress_size > MAX_ARCHIVE_BYTES:
                raise ValueError('ZIP member exceeds decoded/encoded byte budget')
            contents = store.read(info)
    except (KeyError, BadZipFile, RuntimeError, OSError) as error:
        raise ValueError(f'ZIP member invalid or cannot be decoded: {member}') from error
    if len(contents) > MAX_PRIMARY_IMAGE_BYTES:
        raise ValueError('ZIP member exceeds byte budget')
    return file, raw, contents


def box_context(roi, padding, width, height):
    x, y, w, h = roi
    coords = (max(0.0,x-padding), max(0.0,y-padding),
              min(1.0,x+w+padding), min(1.0,y+h+padding))
    return (round(coords[0]*width),round(coords[1]*height),
            round(coords[2]*width),round(coords[3]*height))


def extract(image, category):
    rgba = image.convert('RGBA')
    if category == 'alpha-mask':
        if not image.has_transparency_data:
            raise ValueError('alpha-mask requires a source image with alpha')
        return rgba.getchannel('A')
    rgb = Image.new('RGB', rgba.size, (236,236,236))
    rgb.paste(rgba,mask=rgba.getchannel('A'))
    if category == 'contrast':
        return ImageEnhance.Contrast(ImageOps.autocontrast(ImageOps.grayscale(rgb))).enhance(1.15)
    if category == 'low-frequency':
        return rgb.filter(ImageFilter.GaussianBlur(radius=max(1.2,min(rgb.size)/120)))
    if category == 'high-frequency':
        gray=ImageOps.grayscale(rgb)
        low=gray.filter(ImageFilter.GaussianBlur(radius=max(1.2,min(gray.size)/120)))
        return ImageChops.add(ImageChops.subtract(gray,low,scale=1.0,offset=128),
                              Image.new('L',gray.size,0))
    arr=np.asarray(rgb,dtype=np.float32)
    if category == 'highlights':
        brightness=arr.max(axis=2)
        threshold=float(np.percentile(brightness,95))
        return Image.fromarray(np.where(brightness>=threshold,255,0).astype(np.uint8))
    gray=np.asarray(ImageOps.grayscale(rgb),dtype=np.float32)
    if min(gray.shape)<2:
        raise ValueError('gradient and edge analyses need at least 2x2 pixels')
    gy,gx=np.gradient(gray)
    mag=np.hypot(gx,gy)
    if category == 'edges':
        threshold=float(np.percentile(mag,78))
        return Image.fromarray(np.where(mag>=threshold,255,0).astype(np.uint8))
    if category == 'gradient':
        return Image.fromarray(normalize_uint8(mag))
    raise ValueError(f'unknown analysis: {category}')


def images_for_source(root, source):
    source_id = name(source.get('id'), 'source.id')
    expected = digest(source.get('sha256'), f'{source_id}.sha256')
    if ('path' in source) == ('archive' in source):
        raise ValueError(f'{source_id} must declare exactly one of path or archive/member')
    if 'path' in source:
        raw_path = path_inside(root, source['path'], f'{source_id}.path')
        content = checked_bytes(raw_path, expected, f'{source_id} original')
        archive_path, archive_content = None, None
    else:
        raw_path, archive_content, content = zip_bytes(source,root)
        archive_path = raw_path
        if hashlib.sha256(content).hexdigest() != expected:
            raise ValueError(f'{source_id} ZIP member SHA-256 mismatch')
    image,width,height = read_image(content,source_id)
    if source.get('sourceManifest') is not None:
        if archive_path is not None:
            raise ValueError('sourceManifest binding requires a regular image path, not a ZIP member')
        manifest_file=path_inside(root,source['sourceManifest'],f'{source_id}.sourceManifest')
        manifest=json.loads(manifest_file.read_text(encoding='utf-8'))
        if manifest.get('schema')!='refas.source-manifest/v1' or manifest.get('sha256')!=expected:
            raise ValueError('sourceManifest does not bind the exact original image bytes')
        raw_reference=manifest.get('path')
        candidates=[]
        for base in (root,manifest_file.parent):
            try: candidates.append(path_inside(base,raw_reference,'sourceManifest.path'))
            except ValueError: pass
        if raw_path not in candidates or (manifest.get('width'),manifest.get('height'))!=(width,height):
            raise ValueError('sourceManifest original path or image dimensions disagree')
    descriptor = {
        'id':source_id,'sha256':expected,
        'kind':'archive-member' if archive_path else 'image',
        'width':width,'height':height,
        'path': source.get('path') if not archive_path else None,
        'archive':source.get('archive') if archive_path else None,
        'archiveSha256':source.get('archiveSha256') if archive_path else None,
        'member':source.get('member') if archive_path else None,
        'sourceManifest':source.get('sourceManifest'),
        'sourceManifestSha256':sha256(manifest_file) if source.get('sourceManifest') is not None else None,
        'viewCount':len(source.get('views',[])),
    }
    return image, descriptor, raw_path


def select_analyses(value, label):
    if not isinstance(value,list) or len(set(map(str,value)))!=len(value):
        raise ValueError(f'{label} must be a list of unique analysis IDs')
    if any(not isinstance(x,str) or x not in ANALYSES for x in value):
        raise ValueError(f'{label} contains unknown analysis')
    return list(value)


def request_plan(spec):
    if not isinstance(spec,dict) or spec.get('schema')!=REQUEST_SCHEMA:
        raise ValueError(f'expected {REQUEST_SCHEMA}')
    subject=name(spec.get('subjectId'),'subjectId')
    sources=spec.get('sources')
    if not isinstance(sources,list) or not 1 <= len(sources) <= MAX_SOURCES:
        raise ValueError('sources must list 1-64 original images or archive members')
    default=select_analyses(spec.get('defaultAnalyses',[]),'defaultAnalyses')
    board=spec.get('board',False)
    if not isinstance(board,bool):
        raise ValueError('board must be boolean')
    ids=set(); view_ids=set(); count=0
    for source in sources:
        if not isinstance(source,dict):
            raise ValueError('source must be an object')
        identity=name(source.get('id'),'source.id')
        if identity in ids:
            raise ValueError('duplicate source ID')
        ids.add(identity)
        views=source.get('views')
        if not isinstance(views,list) or not views:
            raise ValueError('every source requires one or more explicitly labeled views')
        for view in views:
            if not isinstance(view,dict):
                raise ValueError('view must be an object')
            vid=name(view.get('id'),'view.id')
            if (identity,vid) in view_ids:
                raise ValueError('duplicate source/view ID')
            view_ids.add((identity,vid))
            roi=view.get('roi',[0,0,1,1])
            if (not isinstance(roi,list) or len(roi)!=4 or
                any(not isinstance(x,(int,float)) or isinstance(x,bool) or not math.isfinite(x) for x in roi)):
                raise ValueError('view.roi must be four finite numeric values')
            if not isinstance(view.get('padding',0.08),(int,float)) or not math.isfinite(view.get('padding',0.08)) or not 0<=view.get('padding',0.08)<=.5:
                raise ValueError('view.padding must be in [0,0.5]')
            name(view.get('scopeId','whole'),'view.scopeId')
            if view.get('role') is not None:
                name(view.get('role'),'view.role')
            if not isinstance(view.get('materialize',False),bool):
                raise ValueError('materialize must be boolean')
            analyses = select_analyses(view.get('analyses',default),'view.analyses')
            needs_reason = any(item != 'crop' for item in analyses)
            if needs_reason:
                for field in ('question', 'decisionTarget'):
                    detail = view.get(field)
                    if not isinstance(detail,str) or not detail.strip():
                        raise ValueError(f'{identity}/{vid} derived analysis requires substantive {field}')
                    if len(detail)>1024:
                        raise ValueError(f'{identity}/{vid}.{field} exceeds the supported length')
            count+=1
    if count>MAX_VIEWS:
        raise ValueError('observation request exceeds 160 views')
    if board and count>MAX_BOARD_CELLS:
        raise ValueError('board exceeds 24 observation views; narrow the selection')
    return subject,sources,default,board,count


def run_request(spec_path: str, out_path: str, reuse=False):
    request=Path(spec_path).resolve()
    root=request.parent
    out=Path(out_path).resolve()
    if not out.is_relative_to(root):
        raise ValueError('observation output must stay within request project root')
    if out==request or out in request.parents or request.is_relative_to(out):
        raise ValueError('output cannot overlap the observation request')
    spec=json.loads(request.read_text(encoding='utf-8'))
    subject,sources,default,board,requested=request_plan(spec)
    observed=[]; raw_paths=[]; total_pixels=0
    # Validate every selected original *before* writing anything.
    decoded=[]
    for source in sources:
        image, descriptor,raw_path=images_for_source(root,source)
        if raw_path.is_relative_to(out):
            raise ValueError('observation output cannot overwrite or contain any original source/archive')
        if source.get('sourceManifest') is not None:
            source_manifest = path_inside(root,source['sourceManifest'],'sourceManifest')
            if source_manifest.is_relative_to(out):
                raise ValueError('observation output cannot overwrite or contain a bound source manifest')
            raw_paths.append((source_manifest,sha256(source_manifest)))
        if raw_path.is_symlink():
            raise ValueError('source symlink cannot be accepted')
        total_pixels+=image.width*image.height
        if total_pixels>MAX_TOTAL_PIXELS:
            raise ValueError('combined original image pixels exceed observation resource budget')
        decoded.append((source,image,descriptor))
        raw_paths.append((raw_path,descriptor['archiveSha256'] if descriptor['kind']=='archive-member' else descriptor['sha256']))
    current=out/'manifest.json'
    if reuse and current.is_file() and not current.is_symlink():
        try:
            previous=json.loads(current.read_text(encoding='utf-8'))
            envelope=dict(previous)
            previous_digest=envelope.pop('manifestDigest',None)
            exact=previous.get('schema')==OUTPUT_SCHEMA and previous.get('inputDigest')==digest_json(spec)
            exact=exact and previous_digest==digest_json(envelope)
            exact=exact and [(x['id'],x['sha256'],x.get('sourceManifestSha256'),x.get('archiveSha256')) for x in previous.get('sources',[])]==[(x['id'],x['sha256'],x.get('sourceManifestSha256'),x.get('archiveSha256')) for x in [d for _,__,d in decoded]]
            for view in previous.get('views',[]):
                for item in view.get('analysisOutputs',[]):
                    if item.get('discardedSha256'):
                        exact=False
                        break
                    if 'path' in item:
                        location=out/item['path']
                        if not location.is_file() or location.is_symlink() or not location.resolve().is_relative_to(out) or sha256(location)!=item.get('sha256'):
                            exact=False
                            break
            board_item=previous.get('board')
            if board_item:
                board_file=out/board_item['path']
                if not board_file.is_file() or sha256(board_file)!=board_item['sha256']:
                    exact=False
            if exact:
                print(json.dumps({'status':'REUSED','claimScope':'derived-observation-aid-only','manifest':str(current),'sources':len(decoded),'views':len(previous['views'])},indent=2))
                return
        except (ValueError,KeyError,TypeError,OSError,json.JSONDecodeError):
            pass
    token=hashlib.sha256((digest_json(spec)+str(time.time_ns())).encode('utf-8')).hexdigest()[:24]
    snapshot_rel=Path('snapshots')/token
    out.parent.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='.refas-observation-',dir=out.parent))
    staged_files=[]; views_out=[]; board_items=[]; published=False
    try:
        for source,image,descriptor in decoded:
            source_id=descriptor['id']
            observed.append(descriptor)
            for view in source['views']:
                view_id=view['id']; roi=view.get('roi',[0,0,1,1]); b=roi_pixels(roi,image.width,image.height)
                if b[2]<=b[0] or b[3]<=b[1]:
                    raise ValueError('view.roi is subpixel or empty at the actual encoded image resolution')
                crop=image.crop(b)
                analyses=select_analyses(view.get('analyses',default),'view.analyses')
                if any(x in ('edges','gradient','highlights') for x in analyses) and min(crop.size)<2:
                    raise ValueError('analysis crop too small')
                whole=b==(0,0,image.width,image.height)
                materialize=(not whole) or view.get('materialize',False)
                outputs=[]
                def emit(key,bitmap):
                    relative=Path(source_id)/view_id/(key+'.png')
                    target=stage/relative
                    target.parent.mkdir(parents=True,exist_ok=True)
                    bitmap.save(target,format='PNG',optimize=False)
                    record={'analysis':key,'path':(snapshot_rel/relative).as_posix(),
                            'sha256':sha256(target),'width':bitmap.width,'height':bitmap.height,
                            'evidenceClass':'derived-observation-aid'}
                    outputs.append(record)
                    staged_files.append(relative)
                    return record
                if materialize:
                    emit('crop',crop)
                elif 'crop' in analyses:
                    # Whole-frame disk images already exist as SHA-bound raw bytes:
                    # do not waste another PNG just because an analysis was requested.
                    outputs.append({'analysis':'crop','alias':'raw-source','sha256':descriptor['sha256']})
                for item in analyses:
                    if item=='crop':continue
                    if item=='context':
                        context=box_context(roi,float(view.get('padding',.08)),image.width,image.height)
                        if context==b and materialize:
                            outputs.append({'analysis':'context','alias':'crop'})
                        elif context==(0,0,image.width,image.height):
                            outputs.append({'analysis':'context','alias':'raw-source','sha256':descriptor['sha256']})
                        else:
                            canvas=image.crop(context)
                            overlay=canvas.copy()
                            ink=ImageDraw.Draw(overlay)
                            ink.rectangle((b[0]-context[0],b[1]-context[1],b[2]-context[0]-1,b[3]-context[1]-1),
                                          outline=(255,91,52),width=max(1,round(min(image.size)/350)))
                            emit('context',overlay)
                    else:
                        emit(item,extract(crop,item))
                entry={'id':view_id,'sourceId':source_id,'role':view.get('role','unknown'),
                       'scopeId':view.get('scopeId','whole'),'roi':roi,
                       'rawSourceSha256':descriptor['sha256'],'wholeSource':whole,
                       'analysisQuestion':view.get('question') if any(a!='crop' for a in analyses) else None,
                       'decisionTarget':view.get('decisionTarget') if any(a!='crop' for a in analyses) else None,
                       'requestedAnalyses':analyses,
                       'analysisOutputs':outputs}
                views_out.append(entry)
                if board:
                    board_items.append((f'{source_id}/{view_id}',crop))
        if board:
            board_file=stage/'observation-board.png'
            make_board(board_items,board_file)
            board_record={'path':(snapshot_rel/'observation-board.png').as_posix(),'sha256':sha256(board_file)}
        else:
            board_record=None
        manifest={'schema':OUTPUT_SCHEMA,'claimScope':'derived-observation-aid-only',
                  'eligibleForCertification':False,'subjectId':subject,
                  'inputDigest':digest_json(spec),'sources':observed,'views':views_out,
                  'board':board_record,'policy':{'rawSourcePrimary':True,
                  'crossViewRegistrationEstablished':False,'singleSourceCertificationUnchanged':True,
                  'derivedImagesCannotAuthorizePass':True}}
        manifest['manifestDigest']=digest_json(manifest)
        # Detect mutable originals changed during extraction.
        for raw_path, expected_sha in raw_paths:
            if sha256(raw_path)!=expected_sha:
                raise ValueError('original image, ZIP or source manifest changed during observation extraction')
        out.mkdir(parents=True,exist_ok=True)
        snapshots=out/'snapshots'; snapshots.mkdir(parents=True,exist_ok=True)
        actual=snapshots/token
        if actual.exists():
            raise ValueError('observation snapshot collision')
        os.replace(stage,actual)
        pointer_tmp=None
        try:
            with tempfile.NamedTemporaryFile('w',dir=out,prefix='.manifest-',suffix='.json',
                                             encoding='utf-8',delete=False) as tmp:
                json.dump(manifest,tmp,indent=2,ensure_ascii=False)
                tmp.write('\n')
                pointer_tmp=Path(tmp.name)
            os.replace(pointer_tmp,out/'manifest.json')
            published=True
        finally:
            if pointer_tmp is not None:
                pointer_tmp.unlink(missing_ok=True)
            if not published:
                shutil.rmtree(actual,ignore_errors=True)
        # Old versions remain immutable: checkpoints, observation records, and
        # candidate transactions may retain paths or hashes into past snapshots.
        # Reclaiming physical bytes requires a separate verified reference index.
        # Only manifest.json determines the active observation revision.
        print(json.dumps({'status':'PASS','claimScope':manifest['claimScope'],
                          'manifest':str(out/'manifest.json'),'sources':len(observed),
                          'views':len(views_out),'derivedFiles':len(staged_files),
                          'board':str(out/board_record['path']) if board_record else None},indent=2))
    finally:
        if stage.exists():shutil.rmtree(stage,ignore_errors=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--spec',required=True)
    parser.add_argument('--out',required=True)
    parser.add_argument('--reuse',action='store_true')
    args=parser.parse_args()
    run_request(args.spec,args.out,args.reuse)


if __name__=='__main__':main()
