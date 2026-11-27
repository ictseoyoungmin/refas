#!/usr/bin/env python3
"""Offline R14-06E2 review-v2: original-source imported/rendered diagnostic Cycles evidence.

This is a narrowly versioned NEW diagnostic-frame acceptance, not a claim that
historical-camera replay, photo registration or cross-renderer PBR equivalence passed.
Never uploads the private GLB. Rechecks real source bytes and every packet artifact.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import zipfile
import math
from PIL import Image
import numpy as np

SOURCE_SHA = '30f8e135a34470366780b9b600040dff823171dfe857e7e4ab681c520a95f8d7'
FRAME_SHA_V2 = 'd142e9f5344e7ac8d58b7788273f45d44facd526a9404b6c3d9e397c3e2eb9ec'
HISTORICAL_FRAME_SHA = '76074dec7ae1dd8accc00453426f13d8070c45dc0f696dfe01ed5739b2e2a5a1'
SCHEMA = 'refas.e2-private-original-diagnostic-review/v2'
ROOT = 'evidence/'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def require(ok, reason):
    if not ok:
        raise ValueError('R14E2V2_REJECTED: '+reason)

def json_member(z, name):
    return json.loads(z.read(ROOT+name))

def glb_inventory(p):
    payload=p.read_bytes()
    require(len(payload)==26129684 and digest(payload)==SOURCE_SHA, 'original source bytes/SHA')
    require(payload[:4]==b'glTF' and struct.unpack_from('<I',payload,8)[0]==len(payload),'GLB header/length')
    o=12; data=None
    while o<len(payload):
        size,kind=struct.unpack_from('<II',payload,o);o+=8
        require(o+size<=len(payload),'GLB chunk bounds')
        if kind==0x4e4f534a:
            data=json.loads(payload[o:o+size])
        o+=size
    require(data is not None,'GLB JSON missing')
    mesh=data['meshes']; access=data['accessors']
    tris=0; pcount=0; colored=0; vertices=0
    for node in data['nodes']:
        if 'mesh' not in node: continue
        for primitive in mesh[node['mesh']]['primitives']:
            require(primitive.get('mode',4)==4 and 'indices' in primitive,'non-indexed source geometry')
            count=access[primitive['indices']]['count']
            require(count%3==0,'invalid indexed triangle count')
            n=count//3;tris+=n;pcount+=1
            if 'COLOR_0' in primitive.get('attributes',{}):
                colored+=n;vertices+=access[primitive['attributes']['COLOR_0']]['count']
    result=dict(triangles=tris,primitives=pcount,color0Triangles=colored,color0Vertices=vertices,materials=len(data.get('materials',[])))
    require(result==dict(triangles=901664,primitives=40,color0Triangles=512000,color0Vertices=320000,materials=8),'source inventory')
    require(all(m.get('doubleSided') is True for m in data['materials']),'source double-sided materials')
    return result

def verify(glb:Path, frame:Path, packet:Path, blender:Path):
    require(glb.is_file() and frame.is_file() and packet.is_file() and blender.is_file(),'required private inputs absent')
    inv=glb_inventory(glb)
    require(digest(frame.read_bytes())==FRAME_SHA_V2,'explicit v2 camera SHA; historical camera must not be substituted')
    cam=json.loads(frame.read_text())
    require(cam.get('schema')=='refas.canonical-object-frame/v1' and cam.get('id')=='r14-06e2-diagnostic-reconstruction','v2 frame identity')
    hero=cam.get('hero',{})
    require(hero.get('registrationDigest')=='0'*64 and hero.get('fovY')==31,'camera MUST be unregistered')
    require(cam.get('axes')=={'right':[1,0,0],'up':[0,1,0],'forward':[0,0,1]},'camera object frame basis')
    expected_blender_location=[hero['position'][0],-hero['position'][2],hero['position'][1]]
    with zipfile.ZipFile(packet) as z:
        names=z.namelist();require(len(names)==len(set(names)) and all(n.startswith(ROOT) for n in names),'package entry names')
        manifest=json_member(z,'package-manifest.json')
        require(manifest.get('sourceIncluded') is False and manifest.get('sourceOriginalSha256')==SOURCE_SHA,'package source exclusion')
        artifacts=manifest.get('artifacts',{})
        require(set(names)=={ROOT+n for n in artifacts}.union({ROOT+'package-manifest.json'}),'package member inventory')
        for rel,check in artifacts.items():
            content=z.read(ROOT+rel)
            require(digest(content)==check['sha256'] and len(content)==check['sizeBytes'],'package member SHA '+rel)
        require(z.read(ROOT+'scripts/diagnostic_cam_new.json')==frame.read_bytes(),'packet camera must equal v2 camera bytes')
        review=json_member(z,'private-e2-session-evidence.json')
        audit=json_member(z,'import_audit.json')
        metrics=json_member(z,'cpu_v2_vs_cycles_ab_metrics.json')
        cpu=json_member(z,'cpu/report.json')
        require(review.get('claimScope')=='external-pbr-preview-only' and review.get('certificationEligible') is False and review.get('cameraAuthority')=='UNREGISTERED-DIAGNOSTIC','cannot self-certify')
        require(review['camera']['usedFrameSha256']==FRAME_SHA_V2 and review['camera']['historicalRequiredFrameSha256']==HISTORICAL_FRAME_SHA and review['camera']['exactHistoricalFrameAvailable'] is False,'camera version provenance')
        require(review['verifiedSource']['sha256']==SOURCE_SHA and review['verifiedSource']['indexedTriangles']==inv['triangles'],'review source identity')
        require(audit['sourceGlbSha256']==SOURCE_SHA and audit['importedTriangles']==inv['triangles'],'actual Blender imported triangles')
        require(audit['meshObjects']==39 and audit['usedMaterialGroups']==inv['primitives'] and audit['colorBearingImportedTriangles']==inv['color0Triangles'],'actual imported object/material/color inventory')
        used=[]; total_faces=0; color_faces=0
        for obj in audit['materials']:
            total_faces+=obj['faces']
            for mat in obj['usedMaterials']:
                used.append(mat)
                if obj['colorAttributes']:
                    color_faces+=mat['faces']
                    require(mat['cull'] is False and any(link.get('target')=='Principled BSDF' and link.get('socket')=='Base Color' for link in mat['linkedColorNodes']),'COLOR_0 used slot not connected')
        require(total_faces==inv['triangles'] and len(used)==inv['primitives'] and color_faces==inv['color0Triangles'],'import material face totals')
        require(cpu.get('status')=='COMPLETE' and cpu.get('asset',{}).get('glbSha256')==SOURCE_SHA and cpu['asset']['frameFileSha256']==FRAME_SHA_V2,'CPU source/frame replay')
        require(cpu.get('claimScope')=='material-preview-only' and cpu.get('certificationEligible') is False,'CPU preview-only authority')
        require(metrics['cameraSha256']==FRAME_SHA_V2 and metrics['sourceSha256']==SOURCE_SHA and metrics['registeredOriginalCameraSha256']==HISTORICAL_FRAME_SHA,'A/B provenance')
        require(digest(z.read(ROOT+'cpu_v2_vs_cycles_ab_board.png'))==metrics['boardSha256'],'QA board SHA')
        samples=[]
        for res in (160,384):
            k=str(res)
            image=z.read(ROOT+f'monster_bed_cycles_{res}_neutral.png')
            creport=json_member(z,f'monster_bed_blender_report_{res}_neutral.json')
            cpudata=z.read(ROOT+f'cpu/{res}-beauty.png')
            cpupass=next(v for v in cpu['views'] if v['resolution']==[res,res])
            require(creport['glb_sha256']==SOURCE_SHA and creport['imported_triangles']==inv['triangles'],'real source imported '+k)
            require(creport['blender_version']=='4.5.4 LTS' and creport['blender_build_hash']=='b3efe983cc58' and creport['mesh_objects']==39,'independent engine '+k)
            require(creport['output_sha256']==digest(image) and cpupass['coldFirst']['passes']['beauty']['pngSha256']==digest(cpudata),'render byte SHA '+k)
            require(creport['peak_rss_kib']>0 and creport['render_ms']>0 and creport['import_ms']>0,'resource timings '+k)
            with Image.open(io.BytesIO(image)) as png:
                png.verify()
            with Image.open(io.BytesIO(image)) as png:
                require(png.size==(res,res) and len(png.convert('RGB').getcolors(res*res) or [])>2,'nonconstant Cycles PNG '+k)
                b=np.asarray(png.convert('RGB'),dtype=np.float32)
            with Image.open(io.BytesIO(cpudata)) as png:
                require(png.size==(res,res),'CPU beauty image shape '+k)
                c=np.asarray(png.convert('RGB'),dtype=np.float32)
            bm=np.linalg.norm(b-b[0,0],axis=2)>18
            cm=np.linalg.norm(c-c[0,0],axis=2)>18
            inter=np.logical_and(bm,cm).sum(); union=np.logical_or(bm,cm).sum()
            iou=float(inter/max(1,union))
            require(iou>=0.85 and abs(iou-metrics['views'][k]['heuristicSilhouetteIoU'])<0.0002,'independent 2-view foreground IoU '+k)
            if res==160:
                observed=creport.get('camera',{}).get('location',[])
                require(len(observed)==3 and all(abs(float(a)-float(b))<1e-5 for a,b in zip(observed,expected_blender_location)),'glTF Y-up to Blender Z-up basis')
                require(creport.get('color_bearing_imported_triangles')==inv['color0Triangles'],'imported colored triangles 160')
            require(metrics['views'][k]['equivalence'].startswith('NOT_ESTABLISHED'),'must not assert PBR pixel equivalence')
            samples.append({'pixels':res,'cyclesPngSha256':digest(image),'cpuPngSha256':digest(cpudata),'silhouetteIoU':round(iou,5),'cyclesVmHWMKiB':creport['peak_rss_kib']})
    binary_sha=digest(blender.read_bytes())
    require(binary_sha=='7a305b41d339958f0b94d1549c5576763a67c316353282cd58a102bc83d8538e','Blender binary SHA')
    require(digest(glb.read_bytes())==SOURCE_SHA and digest(frame.read_bytes())==FRAME_SHA_V2,'inputs changed during gate')
    return {'schema':SCHEMA,'status':'ACCEPTED','acceptanceScope':'original-monster-bed-external-render-diagnostic','sourceSha256':SOURCE_SHA,'cameraSha256':FRAME_SHA_V2,'cameraSupersedesHistoricalSha256':HISTORICAL_FRAME_SHA,'historicalCameraReplayed':False,'cameraAuthority':'UNREGISTERED-DIAGNOSTIC','blenderExecutableSha256':binary_sha,'evidencePackageSha256':digest(packet.read_bytes()),'sourceInventory':inv,'images':samples,'crossRendererEquivalence':'NOT_ESTABLISHED','referencePhotoResemblance':'NOT_EVALUATED','certificationEligible':False,'claimScope':'external-pbr-preview-only'}

def main():
    p=argparse.ArgumentParser()
    for name in ('glb','frame','packet','blender','out'):
        p.add_argument('--'+name,required=True,type=Path)
    a=p.parse_args()
    require(not a.out.exists(),'output target already exists')
    result=verify(a.glb,a.frame,a.packet,a.blender)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'status':result['status'],'schema':SCHEMA,'output':str(a.out)}))

if __name__=='__main__': main()
