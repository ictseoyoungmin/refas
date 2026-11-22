import bpy
target = bpy.data.objects['panel:cell-00']
assert target.type == 'MESH'
target.location.z += 0.005
