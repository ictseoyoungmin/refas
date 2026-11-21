"""Second and final geometry correction: shoulder / elbow width relationships.

Front-sheet comparison shows broad shoulder armor above a noticeably narrower
elbow. The first candidate's cylindrical elbow read too wide, while its shoulder
was too narrow. Change only the responsible armor and X-axis bearing widths.
These are source interpretations, not calibrated dimensional measurements.
"""
import bpy,json
from pathlib import Path
from mathutils import Matrix

changed={}
for o in bpy.context.scene.objects:
    if o.type!='MESH' or not o.get('aurix_asset'):continue
    n=o.name;sx=None
    if n.startswith(('Shoulder_','Crown_','Upper_crown_')):sx=1.20
    elif n.startswith(('Upper_sculpted_blade_','Upper_outer_wrap_','Upper_gold_conduit_')):sx=1.10
    elif n.startswith('Elbow_'):sx=.78
    elif n.startswith(('Forearm_swept_front_armor_','Forearm_lateral_blade_','Forearm_gold_outer_reveal_')):sx=1.06
    if sx:
        o.matrix_world=Matrix.Diagonal((sx,1,1,1))@o.matrix_world
        changed[n]=sx
bpy.context.view_layer.update()
Path(REFAS_OUTPUT_DIR,'proportion-correction.json').write_text(json.dumps({
 'observed_problem':'Shoulder-to-elbow width contrast weaker than in source front view; first elbow read as an over-wide crossbar.',
 'operations_world_x_scale':changed,
 'unchanged':'Pivot centers, actuator rods, wrist, all hand/digit parts and service cover.',
 'interpretation_limit':'Image-derived silhouette judgement; the reference panels have no calibrated cameras.'
},indent=2))
