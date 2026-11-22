"""Read-only exact segment/triangle contacts between moving thumb cover and palm."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri


def geometry(obj):
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    me.calc_loop_triangles()
    points = [ev.matrix_world @ v.co for v in me.vertices]
    faces = [tuple(t.vertices) for t in me.loop_triangles]
    ev.to_mesh_clear()
    return points, faces


def contacts(one, two):
    result = []
    for first, second in ((one, two), (two, one)):
        for i in range(3):
            start, end = first[i], first[(i+1) % 3]
            direction = end-start
            if direction.length_squared < 1e-20:
                continue
            point = intersect_ray_tri(*second, direction, start, True)
            if point is not None:
                t = (point-start).dot(direction)/direction.length_squared
                if -1e-6 <= t <= 1+1e-6:
                    result.append(point)
    return result


scene = bpy.context.scene
native = Path(bpy.data.filepath)
palm = bpy.data.objects['Palm_graphite_body']
armor = bpy.data.objects['THUMB_S0_ivory_phalanx']
pivot = bpy.data.objects['THUMB_J0']
rows = []
peak_details = []
for frame in range(1, 122):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    cp, cf = geometry(palm)
    ap, af = geometry(armor)
    ct, at = BVHTree.FromPolygons(cp, cf, all_triangles=True), BVHTree.FromPolygons(ap, af, all_triangles=True)
    potential = ct.overlap(at)
    if not potential:
        continue
    inverse = pivot.matrix_world.inverted()
    hits = []
    hit_pairs = []
    for cidx, aidx in potential:
        points = contacts([cp[i] for i in cf[cidx]], [ap[i] for i in af[aidx]])
        if points:
            local = [inverse @ point for point in points]
            hits.extend(local)
            hit_pairs.append({'coreTriangle': cidx, 'armorTriangle': aidx,
                              'intersectionPointsInThumbRootM': [list(p) for p in local]})
    penetrations = []
    samples = ap + [sum((ap[i] for i in f), Vector())/3 for f in af]
    for point in samples:
        nearest, normal, tri, distance = ct.find_nearest(point)
        signed = (point-nearest).dot(normal)
        if signed < -1e-7:
            penetrations.append({'depthM': -signed, 'thumbRootM': list(inverse @ point),
                                 'palmTriangle': tri})
    rows.append({'frame': frame, 'bvhTrianglePairs': len(potential),
                 'verifiedCrossingTrianglePairs': len(hit_pairs),
                 'intersectionPointCountIncludingDuplicates': len(hits),
                 'minHingeAxisRadiusM': min((math.hypot(p.y, p.z) for p in hits), default=None),
                 'maxHingeAxisRadiusM': max((math.hypot(p.y, p.z) for p in hits), default=None),
                 'maxSampledArmorDepthIntoPalmM': max((p['depthM'] for p in penetrations), default=0),
                 'intersectionBoundsInThumbRootM': {'min': [min(p[i] for p in hits) for i in range(3)],
                                                    'max': [max(p[i] for p in hits) for i in range(3)]} if hits else None})
    if frame == 61:
        peak_details = {'trianglePairs': hit_pairs,
                        'deepestArmorSamples': sorted(penetrations, key=lambda p:p['depthM'], reverse=True)[:10]}
output = Path(sys.argv[sys.argv.index('--')+1])
output.write_text(json.dumps({
    'nativeSha256': hashlib.sha256(native.read_bytes()).hexdigest(),
    'scope': 'Read-only actual triangle crossings. Distances reported in current THUMB_J0 frame. Signed nearest-surface vertex/centroid penetration is a sample, not an exhaustive depth bound.',
    'originalThumbKnuckleRadiusM': .017*.46,
    'originalThumbKnuckleHalfAxialLengthM': .017*.56,
    'rows': rows, 'peakFrame61': peak_details,
}, indent=2)+'\n')
print(json.dumps({'affectedFrames': len(rows), 'first': rows[0] if rows else None,
                  'peak': next((row for row in rows if row['frame']==61), None),
                  'maximumHingeAxisRadiusM': max((row['maxHingeAxisRadiusM'] or 0 for row in rows), default=0),
                  'maximumSampledDepthM': max((row['maxSampledArmorDepthIntoPalmM'] for row in rows), default=0)}))
