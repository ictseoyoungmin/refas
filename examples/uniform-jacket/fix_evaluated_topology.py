"""Repair piping tube strips and freeze Blender's evaluated rest triangulation.

This is a pipeline edit: open an unmodified integrated wearable native, run this
script, and use its new outputs. Coordinates, vertex/deform/shape layers, animation
and materials are not edited. Repaired polygon and corner lineage is declared;
the following triangle-only stage preserves exact oriented rest triangles.
The default repairs three strips on the lapels and right princess seam. The
--include-back-seam option also repairs both inherited twists in the back seam.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

import bmesh
import bpy
import numpy as np


FIELDS = {'FLOAT': ('value', 1, np.float32), 'INT': ('value', 1, np.int32),
          'INT8': ('value', 1, np.int8), 'BOOLEAN': ('value', 1, np.bool_),
          'FLOAT_VECTOR': ('vector', 3, np.float32), 'FLOAT2': ('vector', 2, np.float32),
          'FLOAT_COLOR': ('color', 4, np.float32), 'BYTE_COLOR': ('color', 4, np.float32)}
REPAIRS = {'R Lapel | fine piping': (6, 18, 2),
           'L Lapel | fine piping': (6, 18, 5),
           'R body | princess seam': (4, 49, 1)}
FACE_LAYER = '_refas_temp_source_face'
LOOP_LAYER = '_refas_temp_source_loop'


def values(collection, prop, width=1, dtype=np.float32):
    data = np.empty(len(collection)*width, dtype=dtype)
    collection.foreach_get(prop, data)
    return data.reshape((len(collection), width)) if width > 1 else data


def sha_array(data):
    return hashlib.sha256(np.ascontiguousarray(data).tobytes()).hexdigest()


def attribute_values(attr):
    if attr.data_type not in FIELDS:
        raise ValueError('Unimplemented attribute type: ' + attr.name + '/' + attr.data_type)
    prop, width, dtype = FIELDS[attr.data_type]
    return values(attr.data, prop, width, dtype)


def protected(obj):
    mesh = obj.data
    keys = mesh.shape_keys
    result = {
        'vertexPositions': sha_array(values(mesh.vertices, 'co', 3)),
        'vertexCount': len(mesh.vertices),
        'pointAttributes': {a.name: {'type': a.data_type, 'sha256': sha_array(attribute_values(a))}
                            for a in mesh.attributes if a.domain == 'POINT'},
        'vertexGroups': [(g.name, g.index, g.lock_weight) for g in obj.vertex_groups],
        'weights': sha_array(np.asarray([(v.index, g.group, g.weight)
            for v in mesh.vertices for g in v.groups], dtype=np.float64)),
        'materials': [m.name if m else None for m in mesh.materials],
        'shapeKeys': [{'name': key.name, 'coordinates': sha_array(values(key.data, 'co', 3)),
            'relativeKey': key.relative_key.name, 'minimum': key.slider_min,
            'maximum': key.slider_max, 'mute': key.mute, 'value': key.value,
            'interpolation': key.interpolation, 'vertexGroup': key.vertex_group}
            for key in keys.key_blocks] if keys else [],
        'shapeKeyUseRelative': keys.use_relative if keys else None,
        'shapeKeyAction': keys.animation_data.action.name
            if keys and keys.animation_data and keys.animation_data.action else None,
    }
    return result


def geometry(mesh):
    return {
        'faces': [tuple(p.vertices) for p in mesh.polygons],
        'loops': [tuple(p.loop_indices) for p in mesh.polygons],
        'faceMaterials': [p.material_index for p in mesh.polygons],
        'faceSmooth': [p.use_smooth for p in mesh.polygons],
        'pointAttributes': {a.name: {'type': a.data_type, 'values': attribute_values(a)}
            for a in mesh.attributes if a.domain == 'POINT'},
        'faceAttributes': {a.name: {'type': a.data_type, 'values': attribute_values(a)}
            for a in mesh.attributes if a.domain == 'FACE'},
        'cornerAttributes': {a.name: {'type': a.data_type, 'values': attribute_values(a)}
            for a in mesh.attributes if a.domain == 'CORNER'
            and a.name not in {'.corner_vert', '.corner_edge'}},
    }


def evaluated(obj):
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    result = {
        'vertices': values(mesh.vertices, 'co', 3),
        'faces': [tuple(p.vertices) for p in mesh.polygons],
        'triangles': [tuple(t.vertices) for t in mesh.loop_triangles],
        'triangleLoops': [tuple(t.loops) for t in mesh.loop_triangles],
        'trianglePolygons': [t.polygon_index for t in mesh.loop_triangles],
    }
    ev.to_mesh_clear()
    return result


def oriented_key(face):
    return min(tuple(face[i:]+face[:i]) for i in range(len(face)))


def check_edges(mesh):
    bad = []
    for p in mesh.polygons:
        loops = list(p.loop_indices)
        for i, li in enumerate(loops):
            expected = {mesh.loops[li].vertex_index, mesh.loops[loops[(i+1)%len(loops)]].vertex_index}
            ei = mesh.loops[li].edge_index
            if not 0 <= ei < len(mesh.edges) or expected != set(mesh.edges[ei].vertices):
                bad.append(li)
    assert not bad, ('Invalid loop edge endpoint references', bad[:12])


def start_bmesh(mesh):
    assert FACE_LAYER not in mesh.attributes and LOOP_LAYER not in mesh.attributes
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.verts.index_update()
    face_layer = bm.faces.layers.int.new(FACE_LAYER)
    loop_layer = bm.loops.layers.int.new(LOOP_LAYER)
    for face in bm.faces:
        face[face_layer] = face.index
        for loop, index in zip(face.loops, mesh.polygons[face.index].loop_indices):
            loop[loop_layer] = index
    return bm, face_layer, loop_layer


def copy_layers(target, source, access):
    # Blender 4.3.2's generic BMElem.copy_from also invalidates its Python
    # destination wrapper. Copy named layers explicitly instead; this preserves
    # their values without invoking that broad operation.
    for kind in ('int', 'float', 'string', 'float_vector', 'color', 'float_color'):
        collection = getattr(access, kind, None)
        if collection is None:
            continue
        for layer in collection.values():
            value = source[layer]
            target[layer] = value.copy() if hasattr(value, 'copy') else value
    if hasattr(access, 'uv'):
        for layer in access.uv.values():
            dst, src = target[layer], source[layer]
            dst.uv = src.uv.copy()
            dst.pin_uv, dst.select, dst.select_edge = src.pin_uv, src.select, src.select_edge


def copy_face(target, source, bm):
    target.material_index = source.material_index
    target.smooth = source.smooth
    target.select = source.select
    target.hide = source.hide
    copy_layers(target, source, bm.faces.layers)


def finish_bmesh(obj, bm, before_protected, before_geometry, declared_faces=None):
    mesh = obj.data
    bm.to_mesh(mesh)
    bm.free()
    mesh.update(calc_edges=True, calc_edges_loose=True)
    face_ids = values(mesh.attributes[FACE_LAYER].data, 'value', dtype=np.int32)
    loop_ids = values(mesh.attributes[LOOP_LAYER].data, 'value', dtype=np.int32)
    mesh.attributes.remove(mesh.attributes[FACE_LAYER])
    mesh.attributes.remove(mesh.attributes[LOOP_LAYER])
    expected_points = before_geometry['pointAttributes']
    for attr in list(mesh.attributes):
        if attr.domain == 'POINT' and attr.name not in expected_points:
            assert attr.name == '.select_vert' and not np.any(attribute_values(attr)), (obj.name, 'Unexpected point layer', attr.name)
            mesh.attributes.remove(attr)
    for name, record in expected_points.items():
        if mesh.attributes.get(name) is None:
            assert name != 'position', 'Coordinate storage must already exist'
            attr = mesh.attributes.new(name, record['type'], 'POINT')
            prop, width, dtype = FIELDS[record['type']]
            attr.data.foreach_set(prop, np.asarray(record['values'], dtype=dtype).ravel())
    # BMesh elides optional all-default layers such as all-false sharp_face.
    # Recreate their exact original presence and mapped values explicitly.
    for domain, field, mapping in [('FACE', 'faceAttributes', face_ids),
                                   ('CORNER', 'cornerAttributes', loop_ids)]:
        expected = before_geometry[field]
        for attr in list(mesh.attributes):
            if attr.domain != domain or attr.name in {'.corner_vert', '.corner_edge'}:
                continue
            if attr.name not in expected:
                assert attr.name in {'sharp_face', 'material_index', '.select_poly'}, (obj.name, 'Unexpected generated layer', attr.name)
                assert not np.any(attribute_values(attr)), (obj.name, 'Nondefault unexpected layer', attr.name)
                mesh.attributes.remove(attr)
        for name, record in expected.items():
            attr = mesh.attributes.get(name)
            if attr is None:
                attr = mesh.attributes.new(name, record['type'], domain)
            assert attr.data_type == record['type'] and attr.domain == domain
            prop, width, dtype = FIELDS[record['type']]
            attr.data.foreach_set(prop, np.asarray(record['values'][mapping], dtype=dtype).ravel())
    check_edges(mesh)
    after_protected = protected(obj)
    assert before_protected == after_protected, (obj.name, 'Protected data changed',
        [key for key in before_protected if before_protected[key] != after_protected[key]])
    after = geometry(mesh)
    assert before_geometry['faceAttributes'].keys() == after['faceAttributes'].keys(), (obj.name, 'Face layer names changed', list(before_geometry['faceAttributes']), list(after['faceAttributes']))
    assert before_geometry['cornerAttributes'].keys() == after['cornerAttributes'].keys(), (obj.name, 'Corner layer names changed')
    for name, attr in before_geometry['faceAttributes'].items():
        assert attr['type'] == after['faceAttributes'][name]['type']
        assert np.array_equal(attr['values'][face_ids], after['faceAttributes'][name]['values']), (obj.name, 'Face attribute lineage', name)
    for name, attr in before_geometry['cornerAttributes'].items():
        assert attr['type'] == after['cornerAttributes'][name]['type']
        assert np.array_equal(attr['values'][loop_ids], after['cornerAttributes'][name]['values']), (obj.name, 'Corner attribute lineage', name)
    assert np.array_equal(np.asarray(before_geometry['faceMaterials'])[face_ids], after['faceMaterials'])
    assert np.array_equal(np.asarray(before_geometry['faceSmooth'])[face_ids], after['faceSmooth'])
    if declared_faces is not None:
        assert Counter(map(oriented_key, after['faces'])) == Counter(map(oriented_key, declared_faces)), (obj.name, 'Declared face topology mismatch')
    bpy.context.view_layer.update()
    return {'sourceFaceByOutputFace': face_ids.tolist(), 'sourceLoopByOutputLoop': loop_ids.tolist(),
            'protectedDataUnchanged': True, 'faceAttributesPreserved': True,
            'cornerAttributesPreserved': True, 'loopEdgeEndpointsCorrect': True,
            'protectedFingerprints': after_protected}


def repair_strip(obj, section, strip, shift):
    mesh = obj.data
    before_protected, before_geometry = protected(obj), geometry(mesh)
    before_eval = evaluated(obj)
    assert before_eval['faces'] == before_geometry['faces'], (obj.name, 'Modifier changed vertex/polygon correspondence')
    lower = list(range(strip*section, (strip+1)*section))
    upper = list(range((strip+1)*section, (strip+2)*section))
    affected = [i for i, face in enumerate(before_geometry['faces'])
                if set(face) <= set(lower+upper) and set(face)&set(lower) and set(face)&set(upper)]
    assert len(affected) == section, (obj.name, affected)
    bm, face_layer, loop_layer = start_bmesh(mesh)
    old_faces = [bm.faces[i] for i in affected]
    old_edges = {edge for face in old_faces for edge in face.edges}
    declared = list(before_geometry['faces'])
    changed = []
    # Preserve a matching-vertex corner from the same strip. On the retained
    # three piping sources there are no UV/color/custom corner values to invent.
    by_vertex = {}
    for face in old_faces:
        for loop in face.loops:
            by_vertex.setdefault(loop.vert.index, []).append(loop)
    for i in range(section):
        matches = [f for f in old_faces if lower[i] in [v.index for v in f.verts]
                   and lower[(i+1)%section] in [v.index for v in f.verts]]
        assert len(matches) == 1
        old = matches[0]
        source_id = old[face_layer]
        original = [v.index for v in old.verts]
        j = original.index(lower[i])
        forward = original[(j+1)%len(original)] == lower[(i+1)%section]
        expected_original = [lower[i], lower[(i+1)%section], upper[(i+1)%section], upper[i]]
        if not forward:
            expected_original.reverse()
        assert oriented_key(tuple(original)) == oriented_key(tuple(expected_original)), (obj.name, 'Input is not the original strip', source_id)
        ids = [lower[i], lower[(i+1)%section], upper[(i+1+shift)%section], upper[(i+shift)%section]]
        if not forward:
            ids.reverse()
        new = bm.faces.new([bm.verts[index] for index in ids])
        copy_face(new, old, bm)
        old_by_vertex = {loop.vert.index: loop for loop in old.loops}
        for loop in new.loops:
            donor = old_by_vertex.get(loop.vert.index)
            if donor is None:
                donor = min(by_vertex[loop.vert.index], key=lambda item: item[loop_layer])
            copy_layers(loop, donor, bm.loops.layers)
        declared[source_id] = tuple(ids)
        changed.append({'sourceFace': source_id, 'beforeVertices': original, 'afterVertices': ids,
                        'sourceLoops': [loop[loop_layer] for loop in new.loops]})
    bmesh.ops.delete(bm, geom=old_faces, context='FACES_ONLY')
    orphaned = [edge for edge in old_edges if edge.is_valid and not edge.link_faces]
    if orphaned:
        bmesh.ops.delete(bm, geom=orphaned, context='EDGES')
    result = finish_bmesh(obj, bm, before_protected, before_geometry, declared)
    after_eval = evaluated(obj)
    assert np.array_equal(before_eval['vertices'], after_eval['vertices']), (obj.name, 'Evaluated coordinates changed')
    result.update({'object': obj.name, 'section': section, 'strip': strip, 'phaseShift': shift,
                   'declaredChangedFaces': changed, 'evaluatedRestPositionsIdentical': True})
    return result


def freeze_triangles(obj):
    mesh = obj.data
    before_protected, before_geometry = protected(obj), geometry(mesh)
    rest = evaluated(obj)
    assert before_geometry['faces'] == rest['faces'], (obj.name, 'Modifier changed polygon correspondence')
    if all(len(face) == 3 for face in before_geometry['faces']):
        check_edges(mesh)
        return {'object': obj.name, 'unchangedAlreadyTriangular': True, 'triangles': len(rest['triangles']),
                'protectedDataUnchanged': True, 'loopEdgeEndpointsCorrect': True}
    bm, face_layer, loop_layer = start_bmesh(mesh)
    original_faces = list(bm.faces)
    old_loops = {loop[loop_layer]: loop for face in original_faces for loop in face.loops}
    replaced = []
    for vertices, loops, polygon_id in zip(rest['triangles'], rest['triangleLoops'], rest['trianglePolygons']):
        source = original_faces[polygon_id]
        if len(source.verts) == 3:
            continue
        new = bm.faces.new([bm.verts[index] for index in vertices])
        copy_face(new, source, bm)
        donor_by_vertex = {mesh.loops[index].vertex_index: old_loops[index] for index in loops}
        for loop in new.loops:
            copy_layers(loop, donor_by_vertex[loop.vert.index], bm.loops.layers)
    replaced = [face for face in original_faces if len(face.verts) != 3]
    bmesh.ops.delete(bm, geom=replaced, context='FACES_ONLY')
    result = finish_bmesh(obj, bm, before_protected, before_geometry, rest['triangles'])
    after_eval = evaluated(obj)
    assert np.array_equal(rest['vertices'], after_eval['vertices']), (obj.name, 'Evaluated coordinates changed')
    assert Counter(map(oriented_key, rest['triangles'])) == Counter(map(oriented_key, after_eval['triangles']))
    assert all(len(face) == 3 for face in after_eval['faces'])
    result.update({'object': obj.name, 'beforePolygons': len(before_geometry['faces']),
        'triangles': len(rest['triangles']), 'evaluatedRestPositionsIdentical': True,
        'evaluatedRestOrientedTrianglesIdentical': True,
        'frozenTriangleSource': 'Evaluated Blender mesh.calc_loop_triangles at frame 1; no alternate triangulator'})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--skip-piping-repair', action='store_true')
    parser.add_argument('--include-back-seam', action='store_true',
                        help='Also repair both inherited twists in the new body-following back seam.')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    source = Path(bpy.data.filepath).resolve()
    assert source.is_file()
    args.out.mkdir(parents=True, exist_ok=True)
    repaired_path = args.out/'wearable-piping-repaired.blend'
    fixed_path = args.out/'wearable-fixed-triangles.blend'
    report_path = args.out/'topology-preservation.json'
    assert not any(path.exists() for path in (repaired_path, fixed_path, report_path)), 'New output directory required'
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    report = {'schema': 'refas.evaluated-rest-topology-repair/v1', 'source': str(source),
              'sourceSha256': source_sha, 'blenderVersion': bpy.app.version_string,
              'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'repair': [], 'triangulation': []}
    if not args.skip_piping_repair:
        for name, params in REPAIRS.items():
            row = repair_strip(bpy.data.objects[name], *params)
            report['repair'].append(row)
            print('REPAIRED', name, row['phaseShift'], flush=True)
        if args.include_back_seam:
            name = 'Back | centre tailoring seam'
            for strip in (43, 83):
                row = repair_strip(bpy.data.objects[name], 4, strip, 1)
                report['repair'].append(row)
                print('REPAIRED', name, strip, row['phaseShift'], flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(repaired_path))
    report['repairedNative'] = {'path': str(repaired_path), 'sha256': hashlib.sha256(repaired_path.read_bytes()).hexdigest()}
    objects = sorted((o for o in bpy.context.scene.objects if o.type == 'MESH' and o.get('wearable_source_name')),
                     key=lambda o:o.name)
    for obj in objects:
        row = freeze_triangles(obj)
        report['triangulation'].append(row)
        print('FROZEN', obj.name, row['triangles'], flush=True)
    report['selectedMeshes'] = len(objects)
    report['garmentTriangles'] = sum(row['triangles'] for row in report['triangulation'])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_sha, 'Input file changed'
    bpy.ops.wm.save_as_mainfile(filepath=str(fixed_path))
    report['fixedNative'] = {'path': str(fixed_path), 'sha256': hashlib.sha256(fixed_path.read_bytes()).hexdigest()}
    report['sourceBytesUnchanged'] = True
    report['passed'] = True
    report_path.write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
    print('TOPOLOGY_COMPLETE', json.dumps({'meshes':len(objects), 'triangles':report['garmentTriangles']}), flush=True)


if __name__ == '__main__':
    main()
