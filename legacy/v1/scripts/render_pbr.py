#!/usr/bin/env python3
"""Independent, deterministic metallic-roughness PBR renderer for RefAs evidence."""

from __future__ import annotations

import argparse, hashlib, json, math, os, shutil, tempfile, time
from pathlib import Path

import numpy as np
from PIL import Image

NEUTRAL_CLAY_PRESET = {
    "id": "refas-neutral-clay-v1",
    "material": {"baseColor": [0.58, 0.58, 0.58], "metallic": 0, "roughness": 0.78},
    "lighting": {
        "rigId": "neutral-clay-three-light-v1",
        "keyIntensity": 2.8,
        "fillIntensity": 1.2,
        "rimIntensity": 0.55,
        "background": [24, 24, 26],
        "cameraFovY": 31,
    },
    "colorPipeline": {"exposure": 0, "toneMapping": "Reinhard", "outputColorSpace": "sRGB"},
}

from render_glb import (MIB, camera_basis, check_deadline, frame_bounds, frame_digest,
                        load_canonical_frame, load_primitives, local_to_world, make_board,
                        normalize, object_color, parse_glb, resource_policy, sha256, world_bounds,
                        estimate_decoded_geometry_bytes)


def _js_number_normalize(value):
    """Keep Python's JSON numbers equivalent to JSON.stringify numbers.

    Python writes ``0.0`` while JavaScript writes ``0``.  Reports are
    validated and digested by both runtimes, so normalize integral floats
    (including negative zero) before hashing without changing non-integral
    values.
    """
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("canonical JSON cannot contain NaN or Infinity")
        return int(value) if value.is_integer() else value
    if isinstance(value, dict):
        return {key: _js_number_normalize(child) for key, child in value.items()}
    if isinstance(value, (list, tuple)):
        return [_js_number_normalize(child) for child in value]
    return value


def canonical_digest(value):
    normalized = _js_number_normalize(value)
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def pbr_shade(base, normal, view, metallic, roughness, lights=None, exposure=0.0):
    n = normal / np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-9)
    v = view / np.maximum(np.linalg.norm(view, axis=-1, keepdims=True), 1e-9)
    ndotv = np.clip(np.sum(n * v, axis=-1), 0.001, 1.0)
    alpha = max(0.04, roughness * roughness)
    f0 = 0.04 * (1.0 - metallic) + base * metallic
    result = base * (0.025 + 0.055 * (1.0 - roughness)) * (1.0 - metallic) + f0 * (0.10 + 0.16 * (1.0 - roughness))
    result = np.broadcast_to(result, n.shape).copy()
    lights = lights or [([-0.55, 0.75, 0.65], 3.4, [1.0, 0.96, 0.90]), ([0.72, 0.18, 0.54], 1.5, [0.70, 0.82, 1.0]), ([-0.15, -0.62, 0.77], 0.65, [1.0, 0.76, 0.58])]
    for direction, intensity, tint in lights:
        l = normalize(direction)
        h = v + l
        h /= np.maximum(np.linalg.norm(h, axis=-1, keepdims=True), 1e-9)
        ndotl = np.clip(np.sum(n * l, axis=-1), 0.0, 1.0)
        ndoth = np.clip(np.sum(n * h, axis=-1), 0.0, 1.0)
        vdoth = np.clip(np.sum(v * h, axis=-1), 0.0, 1.0)
        denom = (ndoth * ndoth * (alpha * alpha - 1.0) + 1.0)
        distribution = alpha * alpha / np.maximum(math.pi * denom * denom, 1e-6)
        k = (roughness + 1.0) ** 2 / 8.0
        geometry = (ndotv / (ndotv * (1.0 - k) + k)) * (ndotl / (ndotl * (1.0 - k) + k))
        fresnel = f0 + (1.0 - f0) * np.power(1.0 - vdoth[..., None], 5)
        specular = distribution[..., None] * geometry[..., None] * fresnel / np.maximum(4.0 * ndotv[..., None] * ndotl[..., None], 1e-5)
        diffuse = (1.0 - fresnel) * (1.0 - metallic) * base / math.pi
        result += (diffuse + specular) * ndotl[..., None] * intensity * np.asarray(tint)
    result *= 2.0 ** float(exposure)
    return np.clip(result / (1.0 + result), 0.0, 1.0)


def srgb_to_linear(rgb):
    rgb = np.clip(np.asarray(rgb, dtype=np.float64), 0.0, 1.0)
    return np.where(rgb <= 0.04045, rgb / 12.92, np.power((rgb + 0.055) / 1.055, 2.4))


def linear_to_srgb(rgb):
    """IEC 61966-2-1 output transfer, only for COLOR_0-aware appearance."""
    linear = np.clip(rgb, 0.0, 1.0)
    return np.where(linear <= 0.0031308, linear * 12.92,
                    1.055 * np.power(linear, 1.0 / 2.4) - 0.055)


def sample_base_color_texture(texture, uv):
    if texture is None:
        return None
    height, width = texture.shape[:2]
    wrapped = np.mod(uv, 1.0)
    x = wrapped[..., 0] * max(1, width - 1)
    y = wrapped[..., 1] * max(1, height - 1)
    x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64)
    x1 = (x0 + 1) % width; y1 = (y0 + 1) % height
    tx = (x - x0)[..., None]; ty = (y - y0)[..., None]
    c00 = texture[y0, x0, :3]; c10 = texture[y0, x1, :3]
    c01 = texture[y1, x0, :3]; c11 = texture[y1, x1, :3]
    top = c00 * (1.0 - tx) + c10 * tx
    bottom = c01 * (1.0 - tx) + c11 * tx
    return srgb_to_linear(top * (1.0 - ty) + bottom * ty)


def triangle_texcoords(primitive, tri):
    if primitive.texcoords is None:
        return None
    uv = primitive.texcoords[tri].astype(np.float64).copy()
    if np.max(uv[:, 0]) - np.min(uv[:, 0]) > 0.5:
        uv[uv[:, 0] < 0.5, 0] += 1.0
    return uv


def render(primitives, position, target, output, *, size, mode, up_hint, deadline, fov=31, tile_size=128,
           lights=None, exposure=0.0, background=(15, 18, 23)):
    """Rasterize only bounded screen tiles and shade only depth-visible samples.

    The framebuffer is persistent; temporary barycentric/shading arrays must never
    scale with a large triangle's whole screen rectangle.
    """
    # Nonopaque vertex alpha requires a separately specified blend/mask path.
    if mode in ("albedo", "beauty"):
        for primitive in primitives:
            if (primitive.vertex_alpha is not None and
                    np.any(primitive.vertex_alpha != 1.0)):
                raise ValueError("VERTEX_COLOR_UNSUPPORTED: COLOR_0 vertex alpha")
    right, up, forward = camera_basis(position, target, up_hint)
    position = np.asarray(position, dtype=np.float64)
    scale = math.tan(math.radians(fov) / 2)
    background = np.asarray(background, dtype=np.uint8)
    image = np.broadcast_to(background, (size, size, 3)).copy()
    depth_buffer = np.full((size, size), np.inf)
    for primitive in primitives:
        check_deadline(deadline)
        camera = np.column_stack(((primitive.positions - position) @ right,
                                  (primitive.positions - position) @ up,
                                  (primitive.positions - position) @ forward))
        for tri in primitive.indices:
            check_deadline(deadline)
            vertices = camera[tri]
            if np.any(vertices[:, 2] <= 0.01):
                continue
            screen = np.column_stack(((vertices[:, 0] / (vertices[:, 2] * scale) * .5 + .5) * (size - 1),
                                      (.5 - vertices[:, 1] / (vertices[:, 2] * scale) * .5) * (size - 1)))
            x0 = max(0, int(np.floor(screen[:, 0].min())))
            x1 = min(size - 1, int(np.ceil(screen[:, 0].max())))
            y0 = max(0, int(np.floor(screen[:, 1].min())))
            y1 = min(size - 1, int(np.ceil(screen[:, 1].max())))
            if x0 > x1 or y0 > y1:
                continue
            a, b, c = screen
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-10:
                continue
            tri_uv = triangle_texcoords(primitive, tri) if primitive.base_color_texture is not None else None
            if primitive.base_color_texture is not None and tri_uv is None:
                raise ValueError('textured primitive is missing TEXCOORD_0')
            for ty in range(y0, y1 + 1, tile_size):
                for tx in range(x0, x1 + 1, tile_size):
                    check_deadline(deadline)
                    yy, xx = np.mgrid[ty:min(y1 + 1, ty + tile_size), tx:min(x1 + 1, tx + tile_size)]
                    w0 = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / den
                    w1 = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / den
                    w2 = 1.0 - w0 - w1
                    inside = (w0 >= -1e-7) & (w1 >= -1e-7) & (w2 >= -1e-7)
                    if not np.any(inside):
                        continue
                    inv = w0 / vertices[0, 2] + w1 / vertices[1, 2] + w2 / vertices[2, 2]
                    depth = np.where(inv > 1e-12, 1.0 / inv, np.inf)
                    region_depth = depth_buffer[ty:ty + yy.shape[0], tx:tx + xx.shape[1]]
                    visible = inside & (depth < region_depth)
                    if not np.any(visible):
                        continue
                    weights = np.stack((w0[visible] / vertices[0, 2],
                                        w1[visible] / vertices[1, 2],
                                        w2[visible] / vertices[2, 2]), axis=-1) / np.maximum(inv[visible, None], 1e-12)
                    count = weights.shape[0]
                    if mode == 'object-id':
                        color = np.broadcast_to(object_color(primitive.object_id), (count, 3))
                    else:
                        base = np.broadcast_to(primitive.color, (count, 3))
                        if mode in ('albedo', 'beauty') and primitive.vertex_colors is not None:
                            # Pixel weights were already perspective-corrected
                            # by depth; glTF COLOR_0 RGB is stored in linear.
                            base = base * (weights @ primitive.vertex_colors[tri])
                        if tri_uv is not None:
                            uv = weights @ tri_uv
                            base = base * sample_base_color_texture(primitive.base_color_texture, uv)
                        if mode == 'albedo':
                            color = base
                        else:
                            normals = weights @ primitive.normals[tri]
                            if mode == 'normal':
                                color = np.clip(normals * .5 + .5, 0, 1)
                            else:
                                worlds = weights @ primitive.positions[tri]
                                views = position - worlds
                                color = pbr_shade(base, normals, views, primitive.metallic,
                                                  primitive.roughness, lights=lights, exposure=exposure)
                    if mode in ('albedo', 'beauty') and primitive.vertex_colors is not None:
                        encoded = np.round(linear_to_srgb(color) * 255).astype(np.uint8)
                    else:
                        encoded = np.round(np.power(np.clip(color, 0, 1), 1 / 2.2) * 255).astype(np.uint8)
                    region = image[ty:ty + yy.shape[0], tx:tx + xx.shape[1]]
                    region[visible] = encoded
                    region_depth[visible] = depth[visible]
    Image.fromarray(image, 'RGB').save(output)
    return {"path": output.name, "sha256": sha256(output), "mode": mode}


VIEW_IDS = ('hero', 'oblique', 'side', 'top', 'grazing', 'normal', 'object-id', 'albedo')


def _preview_selection(value):
    requested = [part.strip() for part in value.split(',')]
    if not requested or any(view not in VIEW_IDS for view in requested):
        raise ValueError('--views must contain known canonical view IDs')
    if len(set(requested)) != len(requested):
        raise ValueError('--views cannot repeat view IDs')
    return requested


def _preview_cache_valid(out, expected_digest, views):
    manifest_path = out / 'preview-manifest.json'
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        envelope = dict(manifest)
        saved_digest = envelope.pop('manifestDigest', None)
        if saved_digest != canonical_digest(envelope):
            return False
        if (manifest.get('schema') != 'refas.render-preview/v1' or
            manifest.get('claimScope') != 'preview-only' or
            manifest.get('eligibleForCertification') is not False or
            manifest.get('inputDigest') != expected_digest or
            [item['viewId'] for item in manifest.get('outputs', [])] != views):
            return False
        for item in manifest['outputs']:
            if item.get('path') != item['viewId'] + '.png':
                return False
            image = out / item['path']
            if not image.is_file() or sha256(image) != item['sha256']:
                return False
        return True
    except (OSError, KeyError, ValueError, TypeError, json.JSONDecodeError):
        return False



def publish_outputs_rollback_safe(staging: Path, out: Path, committed_name: str, remove=()):
    """Stage, publish the digest-bearing manifest last, and restore on failure.

    Readers must verify the manifest hashes, since individual file renames
    are not a multi-file atomic transaction for concurrent readers.
    """
    out.mkdir(parents=True,exist_ok=True)
    if out.is_symlink():
        raise ValueError('PBR output root cannot be a symlink')
    sources=sorted(item.name for item in staging.iterdir() if item.is_file())
    if committed_name not in sources:
        raise ValueError('missing PBR commit manifest')
    names=[name for name in sources if name!=committed_name]
    removed=sorted(set(remove)-set(sources)-{committed_name})
    names.extend(removed)
    names.append(committed_name)
    backup=Path(tempfile.mkdtemp(prefix='.refas-pbr-rollback-',dir=out.parent))
    original=[]; written=[]
    fail_after=os.environ.get('REFAS_TEST_PBR_PUBLISH_FAIL_AFTER')
    fail_after=int(fail_after) if fail_after and fail_after.isdigit() else 0
    try:
        for name in names:
            current=out/name
            if current.is_symlink() or (current.exists() and not current.is_file()):
                raise ValueError(f'non-file PBR publication target: {name}')
            if current.exists():
                os.replace(current,backup/name)
                original.append(name)
            if name in sources:
                os.replace(staging/name,current)
                written.append(name)
            if fail_after and len(written)==fail_after:
                raise RuntimeError('injected PBR publication failure')
    except BaseException:
        for name in reversed(written):
            (out/name).unlink(missing_ok=True)
        for name in reversed(original):
            os.replace(backup/name,out/name)
        raise
    finally:
        shutil.rmtree(backup,ignore_errors=True)


def main():
    p=argparse.ArgumentParser(); p.add_argument('--glb',required=True); p.add_argument('--out',required=True); p.add_argument('--frame',required=True); p.add_argument('--reference'); p.add_argument('--size',type=int,default=420); p.add_argument('--timeout-seconds',type=float,default=180); p.add_argument('--max-working-mb',type=float,default=512); p.add_argument('--exposure',type=float,default=0.0); p.add_argument('--background',default='15,18,23'); p.add_argument('--key-intensity',type=float,default=3.4); p.add_argument('--fill-intensity',type=float,default=1.5); p.add_argument('--rim-intensity',type=float,default=0.65); p.add_argument('--neutral-clay',action='store_true'); p.add_argument('--tile-size',type=int,default=128); p.add_argument('--no-board',action='store_true'); p.add_argument('--preview',action='store_true'); p.add_argument('--views',default='hero,side'); p.add_argument('--reuse',action='store_true'); a=p.parse_args()
    if not a.preview and a.reuse:
        raise ValueError('--reuse is preview-only; canonical final evidence must rerender')
    if not a.preview and a.views != 'hero,side':
        raise ValueError('--views is preview-only; canonical PBR always renders all eight views')
    if a.preview and a.neutral_clay:
        raise ValueError('preview cannot produce canonical neutral-clay evidence')
    if a.preview and a.reference:
        raise ValueError('preview never authenticates a source reference; use canonical render for evidence')
    selection = _preview_selection(a.views) if a.preview else list(VIEW_IDS)
    glb=Path(a.glb).resolve(); out=Path(a.out).resolve(); out.parent.mkdir(parents=True,exist_ok=True); frame_path=Path(a.frame).resolve(); model,binary=parse_glb(glb); decoded=estimate_decoded_geometry_bytes(model)
    policy=resource_policy(a.size,a.size,max_working_mb=a.max_working_mb,
                           requested_tile_size=a.tile_size,source_glb_bytes=glb.stat().st_size,
                           decoded_geometry_bytes=decoded)
    # The PBR integrator uses more intermediates than the portable rasterizer.
    # Derive a stricter tile bound, not an unbounded full-frame allocation.
    free_scratch=int(a.max_working_mb*MIB)-(a.size*a.size*11+glb.stat().st_size+decoded)
    if free_scratch < 512:
        raise MemoryError('PBR working memory budget cannot hold a one-pixel shading tile')
    tile_size=min(policy['tileSize'], max(1, int(math.sqrt(free_scratch / 512))))
    model,primitives=load_primitives(glb,parsed=(model,binary));
    if a.neutral_clay:
        clay = NEUTRAL_CLAY_PRESET["material"]
        for primitive in primitives:
            primitive.color = np.array(clay["baseColor"], dtype=np.float64)
            primitive.metallic = float(clay["metallic"])
            primitive.roughness = float(clay["roughness"])
            primitive.base_color_texture = None
            primitive.base_color_texture_sha256 = None
            # Neutral-clay intentionally substitutes the entire source material.
            primitive.vertex_colors = None
            primitive.vertex_alpha = None
    frame,basis,origin,fd=load_canonical_frame(frame_path); bounds=frame_bounds(primitives,frame,basis,origin); center=bounds['centerWorld']; distance=bounds['radius']*3.1; deadline=time.monotonic()+a.timeout_seconds
    if a.neutral_clay:
        preset_lighting = NEUTRAL_CLAY_PRESET["lighting"]
        background = tuple(preset_lighting["background"])
        key_intensity = float(preset_lighting["keyIntensity"])
        fill_intensity = float(preset_lighting["fillIntensity"])
        rim_intensity = float(preset_lighting["rimIntensity"])
        exposure = float(NEUTRAL_CLAY_PRESET["colorPipeline"]["exposure"])
    else:
        background=tuple(max(0,min(255,int(value))) for value in a.background.split(','))
        if len(background) != 3: raise ValueError('--background must be r,g,b')
        key_intensity = a.key_intensity
        fill_intensity = a.fill_intensity
        rim_intensity = a.rim_intensity
        exposure = a.exposure
    lights=[([-0.55, 0.75, 0.65], key_intensity, [1.0, 0.96, 0.90]), ([0.72, 0.18, 0.54], fill_intensity, [0.70, 0.82, 1.0]), ([-0.15, -0.62, 0.77], rim_intensity, [1.0, 0.76, 0.58])]
    specs=[('hero',[0,0,1],[0,1,0],'beauty','PBR HERO'),('oblique',[.72,.2,1],[0,1,0],'beauty','PBR OBLIQUE'),('side',[1,.05,.15],[0,1,0],'beauty','PBR SIDE'),('top',[.18,1,.35],[0,0,1],'beauty','PBR TOP'),('grazing',[-1,.05,.18],[0,1,0],'beauty','PBR GRAZING'),('normal',[0,0,1],[0,1,0],'normal','NORMAL'),('object-id',[0,0,1],[0,1,0],'object-id','OBJECT ID'),('albedo',[0,0,1],[0,1,0],'albedo','ALBEDO')]
    if a.preview:
        if (out/'render-report.json').exists():
            raise ValueError('preview output must not reuse a canonical evidence directory')
        specs=[spec for spec in specs if spec[0] in selection]
        specs.sort(key=lambda spec: selection.index(spec[0]))
        preview_input={
            'schema':'refas.render-preview-input/v1',
            'assetSha256':sha256(glb),'frameDigest':fd,'viewIds':selection,
            'size':a.size,'background':list(background),'exposure':exposure,
            'lights':[key_intensity,fill_intensity,rim_intensity],
            'renderer':'numpy-cook-torrance-headless/1.0.0'
        }
        preview_digest=canonical_digest(preview_input)
        if a.reuse and _preview_cache_valid(out,preview_digest,selection):
            print(json.dumps({'status':'REUSED','claimScope':'preview-only','manifest':str(out/'preview-manifest.json'),'frames':len(selection)},indent=2))
            return
    staging=Path(tempfile.mkdtemp(prefix='.refas-pbr-',dir=out.parent)); frames=[]
    try:
        for name,direction,up,mode,label in specs:
            hero = frame.get('hero') if name == 'hero' else None
            if hero:
                pos = local_to_world(hero['position'], basis, origin)
                target = local_to_world(hero['target'], basis, origin)
                up_hint = local_to_world(hero.get('up', [0, 1, 0]), basis)
                fov = float(hero.get('fovY', 31))
            else:
                pos = center + normalize(local_to_world(direction, basis)) * distance
                target = center
                up_hint = local_to_world(up, basis)
                fov = 31
            path = staging / f'{name}.png'
            rec = render(primitives, pos, target, path, size=a.size, mode=mode,
                         up_hint=up_hint, deadline=deadline, fov=fov, tile_size=tile_size, lights=lights,
                         exposure=exposure, background=background)
            frames.append({**rec, 'viewId':name,'label':label,'absolutePath':str(path)})
        if not a.no_board and not a.preview:
            board=staging/'pbr-review-board.png'
            make_board(Path(a.reference).resolve() if a.reference else None,frames,board)
        if a.preview:
            manifest={
                'schema':'refas.render-preview/v1','claimScope':'preview-only',
                'eligibleForCertification':False,'inputDigest':preview_digest,
                'assetSha256':preview_input['assetSha256'],'frameDigest':fd,
                'outputs':[{'viewId':frame['viewId'],'path':frame['path'],'sha256':frame['sha256']} for frame in frames]
            }
            manifest['manifestDigest']=canonical_digest(manifest)
            (staging/'preview-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
            stale=[view+'.png' for view in VIEW_IDS if view not in selection]
            publish_outputs_rollback_safe(staging,out,'preview-manifest.json',remove=stale)
            print(json.dumps({'status':'PASS','claimScope':'preview-only','manifest':str(out/'preview-manifest.json'),'frames':len(frames)},indent=2))
            return
        rig={"lights":"three-directional-calibrated-v1","keyIntensity":key_intensity,"fillIntensity":fill_intensity,"rimIntensity":rim_intensity,"background":list(background),"cameraFovY":31}; color={"exposure":exposure,"toneMapping":"Reinhard","outputColorSpace":"sRGB"}
        rig_id="fixed-three-light-review-rig"
        if a.neutral_clay:
            rig_id=NEUTRAL_CLAY_PRESET["lighting"]["rigId"]
            rig={
                "lights":"three-directional-calibrated-v1",
                "keyIntensity":key_intensity,
                "fillIntensity":fill_intensity,
                "rimIntensity":rim_intensity,
                "background":list(background),
                "cameraFovY":NEUTRAL_CLAY_PRESET["lighting"]["cameraFovY"],
            }
            color=dict(NEUTRAL_CLAY_PRESET["colorPipeline"])
        output_prefix="renders/clay" if a.neutral_clay else "renders/pbr"
        texture_bindings=[] if a.neutral_clay else sorted({p.base_color_texture_sha256 for p in primitives if p.base_color_texture_sha256})
        supported=["base-color-factor","metallic-factor","roughness-factor"] if a.neutral_clay else ["base-color-factor","base-color-texture","metallic-factor","roughness-factor","texcoord-0"]
        if not a.neutral_clay and any(p.vertex_colors is not None for p in primitives):
            supported.append("vertex-color-0")
        unsupported=["clearcoat","image-based-lighting","normal-maps"] + (["textures"] if a.neutral_clay else [])
        payload={"schema":"refas.pbr-render-report/v1","claimScope":"shape-resemblance-only" if a.neutral_clay else "visual-fidelity","assetSha256":sha256(glb),"frameDigest":fd,"renderer":{"family":"other","name":"RefAs Independent PBR","version":"1.0.0","backend":"numpy-cook-torrance-headless","independentProcess":True},"lighting":{"rigId":rig_id,"digest":canonical_digest(rig)},"colorPipeline":color,"materialSupport":{"supported":supported,"unsupported":unsupported},"textureBindings":[{"sha256":digest,"mimeType":"image/png","channel":"base-color"} for digest in texture_bindings],"outputs":[{"viewId":f['viewId'],"path":f"{output_prefix}/{f['path']}","sha256":f['sha256']} for f in frames],"reproducibility":{"mode":"deterministic","tolerance":""}}
        if a.neutral_clay:
            payload["presentation"]={"mode":"neutral-clay","presetId":NEUTRAL_CLAY_PRESET["id"],"presetDigest":canonical_digest(NEUTRAL_CLAY_PRESET)}
        payload['reportDigest']=canonical_digest(payload)
        (staging/'render-report.json').write_text(json.dumps(payload,indent=2)+'\n')
        publish_outputs_rollback_safe(staging,out,'render-report.json',
                                      remove=['pbr-review-board.png'] if a.no_board else [])
    finally: shutil.rmtree(staging,ignore_errors=True)
    print(json.dumps({"status":"PASS","report":str(out/'render-report.json'),"board":None if a.no_board else str(out/'pbr-review-board.png'),"frames":len(frames)},indent=2))

if __name__=='__main__': main()
