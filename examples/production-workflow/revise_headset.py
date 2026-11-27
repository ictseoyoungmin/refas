"""Locally widen the headband comfort pad while preserving every other part.

The existing native scene is opened by the production worker before this script
runs. No fixture-specific reconstruction DSL or imported creation module is used.
"""
import bpy

pad = bpy.data.objects.get("HeadbandComfortPad")
if pad is None or pad.type != "MESH":
    raise ValueError("This revision requires the create_headset.py native scene")
for vertex in pad.data.vertices:
    vertex.co.y *= 1.18
pad.data.update()
bpy.context.view_layer.update()
print("Widened HeadbandComfortPad by 18%; other mesh data and transforms were not edited")
