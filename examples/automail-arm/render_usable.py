"""Actual diagnostic images from a disposable opened native or GLB scene."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector

repo=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(repo/'skills/refas/scripts/production'))
from blender_worker import inventory,render_views

p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True)
p.add_argument('--review-spec',type=Path,required=True);p.add_argument('--frame',type=int,default=1)
p.add_argument('--views',default='front,side,hero,hand-front,hand-palm,elbow-detail')
p.add_argument('--style',choices=['material','wire','inside'],default='material')
p.add_argument('--glb',type=Path)
p.add_argument('--size',type=int,default=512);p.add_argument('--samples',type=int,default=16)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=False)
if a.glb:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps=30
    bpy.context.scene.render.fps_base=1
    bpy.ops.import_scene.gltf(filepath=str(a.glb.resolve()),disable_bone_shape=True)
bpy.context.scene.frame_set(a.frame);bpy.context.view_layer.update()
spec=json.loads(a.review_spec.read_text())
spec['views'].append({'name':'lettering-detail','position':[0,-1,.709],
                      'target':[0,-.0655,.709],'orthoScale':.025})
if 'presentation-' in a.views:
    def framed_view(name,objects,direction):
        points=[]
        for obj in objects:
            if obj.type!='MESH':continue
            ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
            points.extend(ev.matrix_world@vertex.co for vertex in mesh.vertices);ev.to_mesh_clear()
        center=Vector([(min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)])
        direction=direction.normalized();rotation=(-direction).to_track_quat('-Z','Y')
        right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0))
        x=[(p-center).dot(right) for p in points];y=[(p-center).dot(up) for p in points]
        center+=right*((min(x)+max(x))/2)+up*((min(y)+max(y))/2)
        scale=max(max(x)-min(x),max(y)-min(y))*1.13
        return {'name':name,'position':list(center+direction*1.8),'target':list(center),'orthoScale':scale}
    wrist_obj=bpy.data.objects['WRIST_PIVOT']
    spec['views'].append(framed_view('presentation-whole',bpy.context.scene.objects,Vector((.9,-.83,.35))))
    spec['views'].append(framed_view('presentation-hand',wrist_obj.children_recursive,
        wrist_obj.matrix_world.to_3x3()@Vector((-.75,-1,.35))))
if a.frame!=1:
    spec['views'].append({'name':'motion','position':[.9,-.7,.75],'target':[0,.13,.4],'orthoScale':.84})
    wrist=bpy.data.objects['WRIST_PIVOT'].matrix_world
    for name,center,direction,scale in [
        ('grip-front',(0,0,-.075),(0,-1,.05),.21),
        ('grip-palm',(0,0,-.075),(0,1,.05),.21),
        ('grip-thumb',(-.041,.005,-.05),(-.8,.6,.25),.10)]:
        target=wrist@Vector(center);position=target+wrist.to_3x3()@Vector(direction)
        spec['views'].append({'name':name,'position':list(position),'target':list(target),'orthoScale':scale})
if a.style!='material':
    material=bpy.data.materials.new('Diagnostic_'+a.style);material.use_nodes=True
    nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission')
    mix=nodes.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.55,.67,.78,1);mix.inputs[2].default_value=(.015,.02,.03,1)
    if a.style=='wire':
        wire=nodes.new('ShaderNodeWireframe');wire.use_pixel_size=True;wire.inputs['Size'].default_value=.65
        links.new(wire.outputs[0],mix.inputs[0])
    else:
        geo=nodes.new('ShaderNodeNewGeometry');mix.inputs[1].default_value=(.2,.55,.8,1);mix.inputs[2].default_value=(.9,.15,.08,1)
        links.new(geo.outputs['Backfacing'],mix.inputs[0])
        # The inside camera is a declared shell-only diagnostic. Remove the
        # graphite core only from this unsaved observation scene.
        obj=bpy.data.objects.get('Palm_graphite_body')
        if obj:bpy.data.objects.remove(obj,do_unlink=True)
        spec['views'].append({'name':'inside','position':[0,.002,.136],'target':[0,-.02,.136],'orthoScale':.085})
    links.new(mix.outputs[0],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs[0])
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            for i in range(len(obj.data.materials)):obj.data.materials[i]=material
    spec['background']=[.08,.09,.11]
result=render_views(a.out,a.views.split(','),{'size':a.size,'samples':a.samples},inventory(),spec)
(a.out/'render-observation.json').write_text(json.dumps({'frame':a.frame,'style':a.style,
    'input':str(a.glb) if a.glb else bpy.data.filepath,
    'inputSha256':hashlib.sha256((a.glb if a.glb else Path(bpy.data.filepath)).read_bytes()).hexdigest(),
    'fps':bpy.context.scene.render.fps,'fpsBase':bpy.context.scene.render.fps_base,
    'intendedSeconds':a.frame*bpy.context.scene.render.fps_base/bpy.context.scene.render.fps,
    'glbImportFps':30 if a.glb else None,
    'presentationScope':'Additional camera fitted to actual evaluated mesh bounds; not a source-matched comparison.' if 'presentation-' in a.views else None,
    'observations':result,
    'insideScope':'unsaved graphite-core removal only for inside view; selected asset is unchanged' if a.style=='inside' else None},indent=2)+'\n')
