"""Read-only native vs actual reopened GLB garment triangle correspondence.

Blender invocation: --background --threads 2 --python-exit-code 1 --python
inspect_correspondence.py -- --native scene.blend --glb asset.glb
--scope wearable-observation.json --out report.json [--frames 1 49 97].

This checks every scoped garment triangle, winding and material assignment at
the recorded sample times. It never welds, repairs, saves or re-exports either
input. Closed topology, body collision and appearance are separate gates.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import time

import bpy
from mathutils.kdtree import KDTree
import numpy as np


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cyclic(face):
    a, b, c = (int(x) for x in face)
    return min((a, b, c), (b, c, a), (c, a, b))


def reverse(face):
    return cyclic((face[0], face[2], face[1]))


def load_glb(path):
    blob = path.read_bytes()
    magic, version, total = struct.unpack_from('<III', blob, 0)
    assert magic == 0x46546C67 and version == 2 and total == len(blob)
    cursor, document, binary = 12, None, None
    while cursor < len(blob):
        length, kind = struct.unpack_from('<II', blob, cursor)
        chunk = blob[cursor + 8: cursor + 8 + length]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        cursor += 8 + length
    assert document is not None and binary is not None
    return document, binary


def indices(document, binary, primitive):
    assert primitive.get('mode', 4) == 4, 'Only explicit triangle primitives are supported'
    accessor = document['accessors'][primitive['indices']]
    assert accessor['type'] == 'SCALAR' and 'sparse' not in accessor
    view = document['bufferViews'][accessor['bufferView']]
    assert view.get('buffer', 0) == 0
    dtype = np.dtype({5121: 'u1', 5123: '<u2', 5125: '<u4'}[accessor['componentType']])
    values = np.ndarray((accessor['count'],), dtype=dtype, buffer=binary,
        offset=view.get('byteOffset', 0) + accessor.get('byteOffset', 0),
        strides=(view.get('byteStride', dtype.itemsize),)).copy()
    assert len(values) % 3 == 0
    return values.reshape(-1, 3)


def capture(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    local = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get('co', local)
    matrix = np.asarray(evaluated.matrix_world, dtype=np.float64)
    vertices = local.reshape(-1, 3) @ matrix[:3, :3].T + matrix[:3, 3]
    faces = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
    mesh.loop_triangles.foreach_get('vertices', faces)
    material_ids = np.empty(len(mesh.loop_triangles), dtype=np.int32)
    mesh.loop_triangles.foreach_get('material_index', material_ids)
    materials = [material.name if material else None for material in mesh.materials]
    face_materials = [materials[i] if i < len(materials) else None for i in material_ids]
    evaluated.to_mesh_clear()
    return vertices, faces.reshape(-1, 3), face_materials


def compare(native, imported, tolerance):
    vertices, faces, materials = native
    imported_vertices, imported_faces, imported_materials = imported
    # Every face retains a distinct identity. UV/normal splits and coincident
    # native vertices therefore need no global vertex welding/canonicalization.
    tree = KDTree(len(vertices))
    for index, point in enumerate(vertices):
        tree.insert(point, index)
    tree.balance()
    mapped, distances = [], []
    for point in imported_vertices:
        _, index, _ = tree.find(point)
        mapped.append(index)
        # Measure in float64, not the KDTree's float32 distance report.
        distances.append(float(np.linalg.norm(point - vertices[index])))

    source_triangles, target_triangles = vertices[faces], imported_vertices[imported_faces]
    centroids = source_triangles.mean(axis=1)
    face_tree = KDTree(len(faces))
    for index, point in enumerate(centroids):
        face_tree.insert(point, index)
    face_tree.balance()
    source_normals = np.cross(source_triangles[:, 1] - source_triangles[:, 0], source_triangles[:, 2] - source_triangles[:, 0])
    target_normals = np.cross(target_triangles[:, 1] - target_triangles[:, 0], target_triangles[:, 2] - target_triangles[:, 0])
    # The KDTree is float32, so broaden candidate discovery by its coordinate
    # rounding envelope. Actual corner distances below remain float64 and use
    # exactly the requested tolerance; this margin never grants acceptance.
    search_margin = float(np.max(np.abs(vertices))) * np.finfo(np.float32).eps * 4
    candidate_edges, reverse_edges, edge_errors = [], [], {}
    for target_index, triangle in enumerate(target_triangles):
        candidates = face_tree.find_range(triangle.mean(axis=0), tolerance + search_margin)
        forward, backward = [], []
        for _, source_index, _ in candidates:
            other = source_triangles[source_index]
            same_orientation = float(np.dot(source_normals[source_index], target_normals[target_index])) > 0
            order = [[0, 1, 2], [1, 2, 0], [2, 0, 1]] if same_orientation else [[0, 2, 1], [2, 1, 0], [1, 0, 2]]
            errors = np.sum((triangle[None, :, :] - other[order]) ** 2, axis=2)
            best = float(np.sqrt(np.min(np.max(errors, axis=1))))
            if best <= tolerance:
                if same_orientation:
                    forward.append((best, source_index))
                    edge_errors[(target_index, source_index)] = best
                else:
                    backward.append((best, source_index))
        candidate_edges.append([index for _, index in sorted(forward)])
        reverse_edges.append([index for _, index in sorted(backward)])

    def matching(edges):
        # Local augmenting paths retain exact face multiplicity even where two
        # source faces are coincident. Nearest-neighbor greediness alone can
        # incorrectly consume the sole match needed by a later face.
        source_to_target = {}
        def augment(target, visited):
            for source in edges[target]:
                if source in visited:
                    continue
                visited.add(source)
                previous = source_to_target.get(source)
                if previous is None or augment(previous, visited):
                    source_to_target[source] = target
                    return True
            return False
        for target in sorted(range(len(edges)), key=lambda index: len(edges[index])):
            augment(target, set())
        return source_to_target

    geometry_matches = matching(candidate_edges)
    material_edges = [[source for source in row if materials[source] == imported_materials[target]]
                      for target, row in enumerate(candidate_edges)]
    material_matches = matching(material_edges)
    missing = set(range(len(faces))) - set(geometry_matches)
    extra = set(range(len(imported_faces))) - set(geometry_matches.values())
    reversed_matches = matching([[source for source in reverse_edges[target] if source in missing]
                                 if target in extra else [] for target in range(len(imported_faces))])
    maximum = max(distances, default=0.0)
    worst = sorted(range(len(distances)), key=lambda index: distances[index], reverse=True)[:5]
    fully_matches = len(material_matches) == len(faces) == len(imported_faces)
    return {
        'nativeTriangles': len(faces), 'importedTriangles': len(imported_faces),
        'nativeVertices': len(vertices), 'importedVerticesIncludingDisplaySplits': len(imported_vertices),
        'maxMappedVertexErrorM': maximum,
        'verticesOutsideTolerance': sum(distance > tolerance for distance in distances),
        'worstVertexAssociations': [{'importedVertex': index, 'nativeVertex': mapped[index],
            'distanceM': distances[index], 'nativeWorldM': vertices[mapped[index]].tolist(),
            'importedWorldM': imported_vertices[index].tolist()} for index in worst],
        'matchedOrientedTriangles': len(geometry_matches),
        'missingOrReversedTriangles': len(missing),
        'extraOrReversedTriangles': len(extra),
        'confirmedReversedTriangles': len(reversed_matches),
        'matchedOrientedMaterialTriangles': len(material_matches),
        'missingOrChangedMaterialTriangles': len(faces) - len(material_matches),
        'extraOrChangedMaterialTriangles': len(imported_faces) - len(material_matches),
        'materialMismatchBeyondGeometry': len(geometry_matches) - len(material_matches),
        'maximumMatchedCornerErrorM': max((edge_errors[(target, source)] for source, target in material_matches.items()), default=0.0),
        'geometryAndMaterialMultiplicityMatches': fully_matches,
        'passed': maximum <= tolerance and fully_matches,
    }


parser = argparse.ArgumentParser()
parser.add_argument('--native', type=Path, required=True)
parser.add_argument('--glb', type=Path, required=True)
parser.add_argument('--scope', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--frames', nargs='+', type=int, default=[1, 49, 97])
parser.add_argument('--vertex-tolerance', type=float, default=2e-6)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
assert math.isfinite(args.vertex_tolerance) and args.vertex_tolerance > 0
assert args.frames and len(args.frames) == len(set(args.frames))
assert args.out.resolve() not in (args.native.resolve(), args.glb.resolve(), args.scope.resolve())
started, clock = datetime.now(timezone.utc).isoformat(), time.monotonic()
hashes = {key: sha(getattr(args, key)) for key in ('native', 'glb', 'scope')}
scope = json.loads(args.scope.read_text())
names = [row['name'] for row in scope['meshes']]
assert len(names) == len(set(names)) == scope['coatMeshes'] == 100
fps = scope['fps']
assert fps == 30, 'This garment review is fixed to its recorded 30 fps motion'
document, binary = load_glb(args.glb)
assert [animation.get('name') for animation in document.get('animations', [])] == [scope['clip']], 'Expected the single declared garment clip'

raw_nodes, encoded = {}, []
for name in names:
    candidates = [node for node in document['nodes'] if node.get('name') == name and 'mesh' in node]
    assert len(candidates) == 1, (name, 'missing or ambiguous encoded garment node')
    node = candidates[0]
    raw_nodes[name] = node
    mesh = document['meshes'][node['mesh']]
    primitive_rows = []
    for index, primitive in enumerate(mesh['primitives']):
        faces = indices(document, binary, primitive)
        unoriented = Counter(tuple(sorted(int(x) for x in face)) for face in faces)
        oriented = Counter(cyclic(face) for face in faces)
        material = document['materials'][primitive['material']].get('name') if 'material' in primitive else None
        primitive_rows.append({'primitive': index, 'triangles': len(faces), 'material': material,
            'duplicateIndexFaceExcess': sum(n - 1 for n in unoriented.values() if n > 1),
            'duplicateOrientedIndexFaceExcess': sum(n - 1 for n in oriented.values() if n > 1),
            'repeatedIndexTriangles': sum(len(set(int(x) for x in face)) < 3 for face in faces)})
    encoded.append({'object': name, 'meshIndex': node['mesh'], 'meshName': mesh.get('name'),
        'triangles': sum(row['triangles'] for row in primitive_rows),
        'duplicateIndexFaceExcess': sum(row['duplicateIndexFaceExcess'] for row in primitive_rows),
        'primitives': primitive_rows})

bpy.ops.wm.open_mainfile(filepath=str(args.native.resolve()))
scene = bpy.context.scene
assert scene.render.fps / scene.render.fps_base == fps, 'Native timebase differs from recorded inspection'
native = {}
for frame in args.frames:
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    native[frame] = {}
    for name in names:
        obj = scene.objects.get(name)
        assert obj is not None and obj.type == 'MESH', (name, 'missing native garment mesh')
        native[frame][name] = capture(obj, graph)
    print(json.dumps({'stage': 'native captured', 'frame': frame, 'meshes': len(native[frame])}), flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
# glTF seconds are converted into action keyframes DURING import. Setting this
# after import would silently compare different physical times.
scene.render.fps = fps
scene.render.fps_base = 1.0
bpy.ops.import_scene.gltf(filepath=str(args.glb.resolve()), disable_bone_shape=True)
imported_meshes = [obj for obj in scene.objects if obj.type == 'MESH']
resolved, resolution = {}, []
for name in names:
    raw_mesh_name = document['meshes'][raw_nodes[name]['mesh']].get('name')
    direct = [obj for obj in imported_meshes if obj.name == name]
    if direct:
        candidates, method = direct, 'exact GLTF node name'
    else:
        candidates = [obj for obj in imported_meshes if obj.data.name == raw_mesh_name]
        method = 'exact GLTF mesh datablock name (skinned/morph child)'
    assert len(candidates) == 1, (name, raw_mesh_name, 'ambiguous imported correspondence', [o.name for o in candidates])
    resolved[name] = candidates[0]
    resolution.append({'object': name, 'encodedMeshName': raw_mesh_name,
                       'importedObject': candidates[0].name, 'method': method})
assert len({obj.as_pointer() for obj in resolved.values()}) == len(names)

frames = []
for frame in args.frames:
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    rows = []
    for name in names:
        result = compare(native[frame][name], capture(resolved[name], graph), args.vertex_tolerance)
        rows.append({'object': name, **result})
    frames.append({'frame': frame, 'seconds': frame / fps, 'meshes': rows,
        'nativeTriangles': sum(row['nativeTriangles'] for row in rows),
        'importedTriangles': sum(row['importedTriangles'] for row in rows),
        'passedMeshes': sum(row['passed'] for row in rows),
        'maxMappedVertexErrorM': max(row['maxMappedVertexErrorM'] for row in rows)})
    print(json.dumps({'stage': 'actual GLB compared', 'frame': frame,
        'passedMeshes': frames[-1]['passedMeshes'],
        'failed': [{key: row[key] for key in ('object', 'missingOrReversedTriangles', 'extraOrReversedTriangles', 'maxMappedVertexErrorM')} for row in rows if not row['passed']]}), flush=True)

unchanged = {key: sha(getattr(args, key)) == value for key, value in hashes.items()}
duplicate_total = sum(row['duplicateIndexFaceExcess'] for row in encoded)
passed = all(unchanged.values()) and duplicate_total == 0 and all(frame['passedMeshes'] == len(names) for frame in frames)
report = {
    'schema': 'refas.garment-native-actual-glb-correspondence/v1', 'passed': passed,
    'startedUtc': started, 'endedUtc': datetime.now(timezone.utc).isoformat(),
    'elapsedSeconds': time.monotonic() - clock,
    'blenderVersion': bpy.app.version_string, 'scriptSha256': sha(Path(__file__)),
    'argv': sys.argv, 'native': str(args.native), 'asset': str(args.glb),
    'scopeManifest': str(args.scope), 'inputSha256': hashes, 'inputBytesUnchanged': unchanged,
    'garmentMeshes': len(names), 'clip': scope['clip'], 'fpsSetBeforeImport': fps,
    'boneVisualizationDisabled': True, 'vertexToleranceM': args.vertex_tolerance,
    'encodedGarmentTriangles': sum(row['triangles'] for row in encoded),
    'encodedDuplicateIndexFaceExcess': duplicate_total,
    'encodedMeshes': encoded, 'importedObjectResolution': resolution, 'frames': frames,
    'scope': 'Every evaluated garment triangle, cyclic winding and named material assignment at the requested recorded times; all 100 manifest meshes. Actual original GLB bytes imported in Blender with no repair/weld/re-export.',
    'limitations': [
        'One-to-one maximum-cardinality triangle matching retains face multiplicity; cyclic corners and material names are compared within the explicit geometric tolerance. No vertices are welded, clustered or canonicalized.',
        'Normal/UV splits do not change geometric triangles. This is geometric correspondence, not proof of identical source index topology or all attribute layers. Changes below the declared geometric tolerance remain bounded rather than bit-identical.',
        'No whole-avatar publication or geometry acceptance; body/shirt collisions, attachments, topology, appearance, and the full 97-frame use range are separate gates.',
        'Only the manifest garment meshes and requested sample frames are compared; no arbitrary animation or continuous-time guarantee.'
    ]}
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'passed': passed, 'garmentMeshes': len(names), 'encodedDuplicateFaces': duplicate_total,
                  'frames': [{'frame': f['frame'], 'passedMeshes': f['passedMeshes'], 'nativeTriangles': f['nativeTriangles'], 'importedTriangles': f['importedTriangles']} for f in frames]}), flush=True)
if not passed:
    raise SystemExit(2)
