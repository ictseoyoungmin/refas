"""Raise only the tip enamel panel; preserve its mesh and every neighbor."""
import bpy
from mathutils import Vector

panel = bpy.data.objects.get("panel:cell-00")
assert panel is not None and panel.type == "MESH"
assert panel.parent is None and not panel.children
assert not panel.constraints and not panel.animation_data

# Imported cover lies primarily in X/Z. Its visible face points toward -Y.
# 0.025 scene units is about 0.93% of the full asset height.
panel.matrix_world.translation += Vector((0.0, -0.025, 0.0))

