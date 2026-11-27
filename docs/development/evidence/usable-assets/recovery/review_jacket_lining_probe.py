"""Independent closed-sheet topology/contact and cloth-only silhouette review.

Only the two garment meshes are linked. No avatar geometry is loaded for render.
Input native files remain unchanged.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

repo = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(repo/'skills/refas/scripts/production'))
from mesh_audit import audit_mesh

p = argparse.ArgumentParser()
p.add_argument('--high', type=Path, required=True)
p.add_argument('--low', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--render', action='store_true')
a = p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
names = ['Body | continuous open front and shoulder yoke', 'Collar | standing back and neck facing']
sets = {}
for label, path in [('high', a.high), ('low', a.low)]:
    with bpy.data.libraries.load(str(path), link=False) as (data_from, data_to):
        data_to.objects = [name for name in data_from.objects
                           if name in names or name in ['Optimized '+n for n in names]]
    sets[label] = data_to.objects
    for obj in sets[label]:
        bpy.context.scene.collection.objects.link(obj)
        obj.name = label+' '+obj.name
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()


def segment_contacts(one, two):
    points = []
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
                    points.append(point)
    return points


results = []
for label, objects in sets.items():
    for obj in objects:
        ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        me.calc_loop_triangles()
        vertices = [ev.matrix_world@v.co for v in me.vertices]
        half = len(vertices)//2
        outer = [tuple(t.vertices) for t in me.loop_triangles if max(t.vertices)<half]
        inner = [tuple(t.vertices) for t in me.loop_triangles if min(t.vertices)>=half]
        rims = [tuple(t.vertices) for t in me.loop_triangles if min(t.vertices)<half<=max(t.vertices)]
        assert len(vertices) == 2*half and outer and inner
        outer_tree = BVHTree.FromPolygons(vertices, outer, all_triangles=True)
        inner_tree = BVHTree.FromPolygons(vertices, inner, all_triangles=True)
        candidates = outer_tree.overlap(inner_tree)
        crossings, point_examples = [], []
        for oi, ii in candidates:
            contacts = segment_contacts([vertices[i] for i in outer[oi]],
                                        [vertices[i] for i in inner[ii]])
            if contacts:
                crossings.append((oi, ii))
                if len(point_examples)<12:
                    point_examples.append({'outerTriangle': oi, 'innerTriangle': ii,
                                           'pointsM': [list(p) for p in contacts[:4]]})
        signed_thickness = []
        inverted = []
        for index, face in enumerate(outer):
            va, vb, vc = [vertices[i] for i in face]
            normal = (vb-va).cross(vc-va).normalized()
            delta = sum((vertices[i+half]-vertices[i] for i in face), Vector())/3
            thickness = -normal.dot(delta)
            signed_thickness.append(thickness)
            if thickness <= 0:
                inverted.append({'outerTriangle': index, 'signedInteriorThicknessM': thickness,
                                 'centroidM': list((va+vb+vc)/3)})
        ev.to_mesh_clear()
        audit = audit_mesh(obj, meters_per_unit=1, max_details=8)
        row = {'variant': label, 'object': obj.name, 'statistics': audit['statistics'],
               'outerTriangles': len(outer), 'innerTriangles': len(inner), 'rimTriangles': len(rims),
               'outerInnerBvhCandidates': len(candidates), 'verifiedOuterInnerCrossingPairs': len(crossings),
               'outerInnerCrossingExamples': point_examples,
               'signedInteriorThicknessMinM': min(signed_thickness),
               'signedInteriorThicknessMaxM': max(signed_thickness),
               'nonpositiveInteriorThicknessTriangles': len(inverted),
               'nonpositiveInteriorThicknessExamples': inverted[:12],
               'negativeClosedComponents': audit['negativeClosedComponents'],
               'degenerateTriangles': audit['degenerateTriangles'],
               'inconsistentWindingEdges': audit['inconsistentWindingEdges'],
               'boundsM': audit['boundsM']}
        results.append(row)
        (a.out/'report.json').write_text(json.dumps({'inputs': {'high': str(a.high), 'low': str(a.low)},
                                                   'objects': results}, indent=2)+'\n')
        print(json.dumps({k:v for k,v in row.items() if not isinstance(v, (dict, list))}), flush=True)

if a.render:
    scene = bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=16
    scene.cycles.use_denoising=False
    scene.render.threads_mode='FIXED'
    scene.render.threads=2
    scene.render.resolution_x=640
    scene.render.resolution_y=480
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('Independent cloth review world')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.3,.32,.36,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    mats=[]
    for name,color in [('Outer cloth',(.22,.4,.6,1)),('Lining and rim',(.65,.2,.09,1))]:
        mat=bpy.data.materials.new(name)
        mat.use_nodes=True
        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color
        mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.75
        mats.append(mat)
    for objects in sets.values():
        for obj in objects:
            obj.data=obj.data.copy()
            for i in range(len(obj.data.materials)):
                obj.data.materials[i]=mats[min(i,1)]
    for pos,power,size in [((1,-2,3),500,3),((-2,-.5,2),300,2),((0,2,2.5),350,2)]:
        data=bpy.data.lights.new('Cloth review area','AREA')
        data.energy=power;data.shape='DISK';data.size=size
        light=bpy.data.objects.new('Cloth review area',data)
        scene.collection.objects.link(light)
        light.location=pos
        light.rotation_euler=(Vector((0,0,1.3))-light.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Cloth review camera')
    camera=bpy.data.objects.new('Cloth review camera',data)
    scene.collection.objects.link(camera)
    scene.camera=camera
    data.type='ORTHO'
    top=max(r['boundsM']['max'][2] for r in results if 'Collar' in r['object'])
    views=[('whole-front',(0,-3,1.25),(0,0,1.23),1.2),
           ('nape',(0,2,top+.3),(0,0,top-.055),.32),
           ('collar-front',(0,-2,top+.15),(0,0,top-.055),.38)]
    for label in sets:
        for group,objects in sets.items():
            for obj in objects:obj.hide_render=group!=label
        for name,position,target,scale in views:
            camera.location=position
            camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
            data.ortho_scale=scale
            scene.render.filepath=str(a.out/(label+'-'+name+'.png'))
            bpy.ops.render.render(write_still=True)

result={'scope':'Two garment meshes only; no avatar geometry linked or rendered. Source comparison and transferred-lining geometry; not a final wearable motion/export verdict.',
        'inputs':{label:{'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                  for label,path in [('high',a.high),('low',a.low)]},
        'objects':results, 'renders':a.render,
        'renderColors':'blue outer cloth; rust lining/rims; diagnostic override only' if a.render else None}
(a.out/'report.json').write_text(json.dumps(result,indent=2)+'\n')
