"""Read-only native triangulation, edge references and protected-data inspection.

Run in Blender with --native, --repo and --out. An optional --baseline compares
a triangulation-only edit using exact vertex/key/weight arrays and corner lineage.
No mesh validation/repair, save or export operator is called.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import numpy as np


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def array_hash(values):
    return hashlib.sha256(np.ascontiguousarray(values).tobytes()).hexdigest()


def values(collection, name, width=1, dtype=np.float32):
    result = np.empty(len(collection) * width, dtype=dtype)
    collection.foreach_get(name, result)
    return result.reshape(len(collection), width) if width > 1 else result


def point_attributes(mesh):
    fields = {'FLOAT': ('value', 1, np.float32), 'INT': ('value', 1, np.int32),
              'INT8': ('value', 1, np.int8), 'BOOLEAN': ('value', 1, np.bool_),
              'FLOAT_VECTOR': ('vector', 3, np.float32), 'FLOAT2': ('vector', 2, np.float32),
              'FLOAT_COLOR': ('color', 4, np.float32), 'BYTE_COLOR': ('color', 4, np.float32)}
    result = {}
    for attr in mesh.attributes:
        if attr.domain != 'POINT':
            continue
        if attr.data_type not in fields:
            raise ValueError('Unsupported protected point attribute: ' + attr.name + '/' + attr.data_type)
        field, width, dtype = fields[attr.data_type]
        result[attr.name] = {'type': attr.data_type, 'sha256': array_hash(values(attr.data, field, width, dtype))}
    return result


def edge_references(mesh):
    if not len(mesh.loops):
        return {'count': 0, 'examples': []}
    vertices = values(mesh.loops, 'vertex_index', dtype=np.int32)
    edge_ids = values(mesh.loops, 'edge_index', dtype=np.int32)
    edges = values(mesh.edges, 'vertices', 2, np.int32)
    starts = values(mesh.polygons, 'loop_start', dtype=np.int32)
    sizes = values(mesh.polygons, 'loop_total', dtype=np.int32)
    following = np.arange(len(vertices)) + 1
    following[starts + sizes - 1] = starts
    valid = (edge_ids >= 0) & (edge_ids < len(edges))
    actual = np.full((len(vertices), 2), -1, dtype=np.int32)
    actual[valid] = edges[edge_ids[valid]]
    expected = np.column_stack([vertices, vertices[following]])
    matches = valid & np.all(np.sort(actual, axis=1) == np.sort(expected, axis=1), axis=1)
    bad = np.flatnonzero(~matches)
    polygon_ids = np.repeat(np.arange(len(sizes)), sizes)
    examples = [{'polygon': int(polygon_ids[index]), 'loop': int(index),
        'edgeIndex': int(edge_ids[index]), 'expectedVertices': expected[index].tolist(),
        'actualVertices': actual[index].tolist() if valid[index] else None} for index in bad[:12]]
    return {'count': int(len(bad)), 'examples': examples}


def snapshot(path, worker):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    scene.frame_set(1)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    result = {'objects': {}, 'selected': [], 'geometry': {}}
    for obj in sorted(scene.objects, key=lambda item: item.name):
        row = worker.object_record(obj, graph)
        if obj.type == 'MESH':
            mesh = obj.data
            row['exactPointAttributes'] = point_attributes(mesh)
            row['exactWeights'] = array_hash(np.asarray([(v.index, g.group, g.weight)
                for v in mesh.vertices for g in v.groups], dtype=np.float64))
            row['vertexGroupLocks'] = [(g.name, g.lock_weight) for g in obj.vertex_groups]
            row['edgeReferenceErrors'] = edge_references(mesh)
            row['exactShapeMetadata'] = [{'name': key.name, 'minimum': key.slider_min,
                'maximum': key.slider_max, 'mute': key.mute, 'relativeKey': key.relative_key.name,
                'vertexGroup': key.vertex_group, 'interpolation': key.interpolation}
                for key in mesh.shape_keys.key_blocks] if mesh.shape_keys else []
            selected = bool(obj.get('wearable_source_name'))
            if selected:
                result['selected'].append(obj.name)
                result['geometry'][obj.name] = {
                    'faces': [list(p.vertices) for p in mesh.polygons],
                    'faceMaterials': [p.material_index for p in mesh.polygons],
                    'faceSmooth': [p.use_smooth for p in mesh.polygons],
                    'loops': [list(p.loop_indices) for p in mesh.polygons],
                    'uv': {layer.name: values(layer.data, 'uv', 2) for layer in mesh.uv_layers},
                }
        result['objects'][obj.name] = row
    return result


def compare(baseline, candidate):
    checks = {'sameObjectIdentities': baseline['objects'].keys() == candidate['objects'].keys(),
              'sameSelectedGarmentObjects': baseline['selected'] == candidate['selected']}
    rows = []
    for name, before in baseline['objects'].items():
        after = candidate['objects'].get(name)
        if after is None:
            rows.append({'object': name, 'passed': False, 'missing': True})
            continue
        if name not in baseline['selected']:
            changed = [key for key in before if before[key] != after.get(key)]
            rows.append({'object': name, 'scope': 'Protected object exact recorded state',
                         'passed': not changed, 'changedFields': changed})
            continue
        excluded = {'mesh', 'evaluatedMesh', 'fingerprint', 'edgeReferenceErrors'}
        changed = [key for key in before if key not in excluded and before[key] != after.get(key)]
        per = {'sameVertexCount': before['mesh']['vertices'] == after['mesh']['vertices'],
               'sameVertexPositions': before['mesh']['positions'] == after['mesh']['positions'],
               'otherProtectedDataUnchanged': not changed}
        if before['mesh'] == after['mesh']:
            per['unchangedMeshTopologyAndCornerData'] = True
            rows.append({'object': name, 'scope': 'Unchanged garment mesh data', 'checks': per,
                         'changedProtectedFields': changed, 'passed': all(per.values())})
            continue
        old, new = baseline['geometry'][name], candidate['geometry'][name]
        by_vertex = defaultdict(set)
        for face_id, face in enumerate(old['faces']):
            for vertex in face:
                by_vertex[vertex].add(face_id)
        mappings, problems = [], []
        for face_id, face in enumerate(new['faces']):
            candidates = set.intersection(*(by_vertex.get(v, set()) for v in face)) if len(face) == 3 else set()
            good = []
            for source_id in candidates:
                source_face = old['faces'][source_id]
                if len(set(source_face)) != len(source_face):
                    continue
                order = [source_face.index(v) for v in face]
                winding = sum((order[(i+1) % 3] - order[i]) % len(source_face) for i in range(3)) == len(source_face)
                if winding and old['faceMaterials'][source_id] == new['faceMaterials'][face_id] and old['faceSmooth'][source_id] == new['faceSmooth'][face_id]:
                    good.append(source_id)
            if len(good) != 1:
                problems.append({'candidateFace': face_id, 'sourceCandidates': sorted(good)})
                continue
            source_id = good[0]
            mappings.append(source_id)
            for layer, data in old['uv'].items():
                current = new['uv'].get(layer)
                source_loops = [old['loops'][source_id][old['faces'][source_id].index(v)] for v in face]
                if current is None or not np.array_equal(data[source_loops], current[new['loops'][face_id]]):
                    problems.append({'candidateFace': face_id, 'sourceFace': source_id, 'uvLayer': layer})
        counts = Counter(mappings)
        missing = [i for i, face in enumerate(old['faces']) if counts[i] != len(face) - 2]
        per['completeOrientedFaceAndCornerLineage'] = not problems and not missing
        per['sameUvLayerNames'] = old['uv'].keys() == new['uv'].keys()
        rows.append({'object': name, 'scope': 'Triangulation-only preservation', 'checks': per,
                     'changedProtectedFields': changed, 'lineageProblemCount': len(problems),
                     'lineageExamples': problems[:12], 'incompleteSourcePolygonCount': len(missing),
                     'passed': all(per.values())})
    checks['allObjectComparisonsPass'] = all(row['passed'] for row in rows)
    return {'checks': checks, 'passed': all(checks.values()), 'objects': rows}


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, required=True)
parser.add_argument('--native', type=Path, required=True)
parser.add_argument('--baseline', type=Path)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--frames', nargs='+', type=int, default=list(range(1, 98)))
parser.add_argument('--require-triangle-polygons', action='store_true',
                    help='Additional authoring constraint; stable unchanged rigid quads otherwise remain permitted.')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
args.native = args.native.resolve()
if args.baseline:
    args.baseline = args.baseline.resolve()
if args.out.exists() or args.out.resolve() in {args.native, args.baseline}:
    raise ValueError('Output must be a new file distinct from inputs')
assert args.frames and args.frames[0] == 1 and len(set(args.frames)) == len(args.frames)
worker_path = args.repo.resolve() / 'skills/refas/scripts/production/blender_worker.py'
spec = importlib.util.spec_from_file_location('refas_native_audit_worker', worker_path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
inputs = {'native': args.native, 'worker': worker_path}
if args.baseline:
    inputs['baseline'] = args.baseline
hashes = {name: sha(path) for name, path in inputs.items()}
started = datetime.now(timezone.utc).isoformat()
before = snapshot(args.baseline, worker) if args.baseline else None
after = snapshot(args.native, worker)
comparison = compare(before, after) if before else None
rest, frames = {}, []
for frame in args.frames:
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    rows = []
    for name in after['selected']:
        obj = bpy.data.objects[name]
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles = values(mesh.loop_triangles, 'vertices', 3, np.int32)
        signature = {'vertices': len(mesh.vertices), 'triangles': array_hash(triangles),
                     'materials': array_hash(values(mesh.loop_triangles, 'material_index', dtype=np.int32))}
        if frame == 1:
            rest[name] = signature
        rows.append({'object': name, 'stable': signature == rest[name],
                     'edgeReferences': edge_references(mesh),
                     'nonTrianglePolygons': sum(p.loop_total != 3 for p in mesh.polygons)})
        evaluated.to_mesh_clear()
    frames.append({'frame': frame, 'objects': rows, 'passed': all(row['stable'] and
        row['edgeReferences']['count'] == 0 and (not args.require_triangle_polygons or
        row['nonTrianglePolygons'] == 0) for row in rows)})
    print(json.dumps({'frame': frame, 'passed': frames[-1]['passed']}), flush=True)
edge_rows = {name: row['edgeReferenceErrors'] for name, row in after['objects'].items() if row['type'] == 'MESH'}
unchanged = {name: sha(path) == hashes[name] for name, path in inputs.items()}
report = {'schema': 'refas.native-triangulation-integrity/v1', 'startedUtc': started,
          'completedUtc': datetime.now(timezone.utc).isoformat(), 'blenderVersion': bpy.app.version_string,
          'helperSha256': sha(__file__), 'inputPaths': {name: str(p) for name, p in inputs.items()},
          'inputSha256': hashes, 'inputBytesUnchanged': unchanged, 'selectedMeshes': len(after['selected']),
          'requireTrianglePolygons': args.require_triangle_polygons,
          'requestedFrames': args.frames, 'nativeEdgeReferences': edge_rows, 'frames': frames,
          'triangulationPreservation': comparison,
          'scope': 'All garment raw/evaluated edge references, fixed triangle/material identities over requested frames; optional triangulation-only exact data and source-corner lineage comparison. No self-intersection, body-fit, shading-normal, consumer or overall asset acceptance.'}
report['passed'] = len(after['selected']) == 100 and all(unchanged.values()) and all(
    row['count'] == 0 for row in edge_rows.values()) and all(f['passed'] for f in frames) and (
    comparison is None or comparison['passed'])
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
print(json.dumps({'passed': report['passed'], 'selectedMeshes': report['selectedMeshes'], 'out': str(args.out)}))
raise SystemExit(0 if report['passed'] else 2)
