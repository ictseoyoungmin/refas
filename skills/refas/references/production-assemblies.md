# Articulated hard-surface assemblies

Use this guide for segmented mechanisms, armor and manufactured parts with
visible joints. Begin with the reference's complete assembly and proportions.

Sections: scale and hierarchy; editable cutters; editable cables and trim; lattice deformation;
motion hierarchy; surface attachments; useful poses; delivered animation;
local component revisions.

## Establish scale and hierarchy before detail

Choose world units and a repeatable front/up convention. Resolve overall
length and major segment lengths together, distinguishing a connector's
diameter from a segment's length. Record conflicting dimensions and inferred
depth. Perspective and differently posed views may not share a projection.

Separate the load-bearing skeleton, moving joint housings, removable panels
and decorative hardware. Build readable primary masses, spaces between parts
and joint centers before screws, cables or labels. Use a few purposeful panel
profiles with thickness and bevels rather than a stack of boxes that only
matches one silhouette. Follow the reference's asymmetry where visible.

Vary a shell's section width, depth, center and tilt along its length. Shape
the broad face, returning side wall and free edge together, then inspect the
gap to the next layer from a side or grazing view. A seam line on a broad flat
plate does not demonstrate overlapping armor. Keep exposed mechanisms visible
while giving each outer plate enough volume to read under the fixed lights.

## Keep openings editable with construction meshes

Use Blender's Boolean modifier for a real socket, service recess or through-hole
when moving the cutter will make subsequent revisions easier. Keep a clear
wall thickness and inspect the opening from an oblique view; a dark mark on a
solid plate does not form a cavity. Use suitable closed cutter geometry and
inspect the resulting edges before adding bevels or optimizing the shell.

For an existing host and cutter, declare the cutter's purpose explicitly:

```python
housing = bpy.data.objects["Housing"]
cutter = bpy.data.objects["SocketCutter"]
cutter["refas_role"] = "construction"
cutter.hide_render = True
cutter.display_type = "WIRE"
socket = housing.modifiers.new("Socket", "BOOLEAN")
socket.operation = "DIFFERENCE"
socket.solver = "EXACT"
socket.object = cutter
```

Reuse the saved modifier and edit its cutter on subsequent runs. Keep sources
linked to the current scene and enabled in its active view layer; do not disable
or exclude their collection. Each source needs its own `hide_render` flag, even
inside a hidden collection, so diagnostic views preserve the same separation.
Only meshes can carry the construction role. Unmarked hidden asset geometry
still fails rather than disappearing from delivery. Do not use a construction
mesh as the parent of deliverable objects.

Protect neighboring components and unchanged sources by exact name. A host's
evaluated shape changes when its cutter changes, so do not protect the intended
host against that edit. Native `.blend` revisions keep source meshes and their
dependencies; `inspect --object SocketCutter` can still observe the source.
Asset surface counts and automatic framing exclude construction surfaces.

For a static delivery, the existing exporter evaluates all final meshes before
changing its temporary export state, then omits construction meshes from GLB.
The saved `.blend` remains editable. Animated source-driven deformation needs
deliberate baking or rebuilding and consumer playback verification; exporting
one evaluated frame does not bake that motion. Use fixed front/oblique views
to compare the opening and its surrounding wall before and after the edit.

## Shape cables and trim with native curves

Use classic Blender `CURVE` objects when a routed centerline and cross-section
make the next edit simpler. Keep Bezier handles or POLY/NURBS controls, point
radius and tilt editable in native revisions. Adjust only the responsible span;
preserve connection endpoints and inspect the evaluated surface at bends and
near neighboring parts. More spline samples do not correct a poorly routed path.

Use native `run`, exact-name `--protect-object` guards and temporary `inspect`
queries as for meshes. Set `render_resolution_u` to `0` to reuse viewport
resolution, or match every non-POLY spline's `resolution_u`. Inspect intermediate poses when controls or shape keys animate;
native preservation does not establish that the motion will survive conversion.
Follow the [topology guide](production-topology.md#keep-curve-controls-until-mesh-delivery)
for explicit mesh conversion and the required motion checks before GLB delivery.

## Sweep explicitly corresponding sampled sections

When native curve bevel controls do not express changing noncircular section
shape or stable seam correspondence, use the optional sampled section sweep.
Supply one ordered profile at every open guide sample, in consistent units;
index j must denote the same feature. Use a nonparallel initial section axis.
Minimum-rotation transport avoids world-axis switches; optional twist is an
absolute angle in radians at each sample.

```python
from section_sweep import sweep_sections

# In the author's ordinary bpy script, guide and profiles are explicit controls.
result = sweep_sections(guide, profiles, initial_u=(0, 0, 1),
                        closed_profile=True, cap_ends=False)
mesh = bpy.data.meshes.new("ProfileSweep")
mesh.from_pydata(result.vertices, [], result.faces)
mesh.update()
obj = bpy.data.objects.new("ProfileSweep", mesh)
bpy.context.collection.objects.link(obj)
```

Closed profiles must be counterclockwise, without a repeated seam vertex;
open profiles are ordered polylines. End caps are optional and strictly convex
only. Retain control data in the captured authoring script and explicitly
rebuild a selected candidate rather than overwriting unrelated geometry.
Do not infer semantic correspondence from vertex count. The helper refuses
invalid local input and folded/degenerate quads but does not guarantee global
intersection clearance, smooth curvature, closed guide twist closure,
attribute transfer or native shape-key/skin reconstruction. Use ordinary
Blender operations when sufficient; inspect the actual candidate and its
connections before selecting or delivering it.

## Shape a region with an editable lattice

Use Blender's native `LATTICE` and Lattice modifier when a small control cage
expresses a broad local shape change. This is useful for adjusting a housing,
belt or collar volume while retaining the host's base mesh. Place and size the
cage around the intended region; use the host modifier's vertex group when the
affected region needs an explicit boundary. Inspect the transition into the
unchanged surface, not only the most displaced controls.

Create and edit the cage through ordinary `bpy`. For an existing cage and host:

```python
host = bpy.data.objects["Housing"]
cage = bpy.data.objects["HousingCage"]
modifier = host.modifiers.new("Local shape", "LATTICE")
modifier.object = cage
```

Reuse that modifier on subsequent edits instead of stacking a fresh deformation.
Link the cage into the current scene and keep it enabled and visible in the
active view layer. Its `hide_render` flag may be set; the cage is a control
object, not rendered geometry. Off-scene lattice dependencies are unsupported
for native submission. Mesh cutters use the separate explicit construction
role described above; that role does not change lattice delivery rules.

Native save/reopen and exact-name object protection record the cage's grid,
interpolation, control positions, group weights, shape keys and animation.
Protect unchanged cages and neighboring objects when revising a host. A cage
edit can intentionally change the host's evaluated surface, so choose protection
names accordingly. `inspect` provides a compact cage summary; select the host
to observe its evaluated geometry or topology. Cage controls do not contribute
surface triangles or the rendered asset bounds. Check useful intermediate poses
when the cage animates; native preservation does not establish collision-free
motion, fitting quality or export readiness.

Every scene lattice must be resolved before delivery. For a static result,
apply the intended deformation at the selected frame through ordinary `bpy`,
remove the cage, and inspect the resulting mesh in a recoverable edit before
exporting. Earlier native revisions retain the editable controls. Required
animated deformation needs deliberate baking or rebuilding into the delivered
mesh/rig; applying a modifier at one frame does not bake that motion.

## Make the motion hierarchy explicit

Place a named pivot at each intended joint center, with its local axis aligned
to the intended motion. Parent the moving segment and its attachments under
that pivot; downstream joints follow their upstream segment. Keep the neutral
world-space placement when assigning parents and verify it afterward. A name
such as `elbow` does not create a joint or establish its axis.

Rigid plates normally follow one segment. A bridge, actuator or cable spanning
two segments needs a separate choice: telescoping parts, an explicit linkage,
deformation, or a clearly declared static approximation. Do not parent both
ends rigidly to one side and claim the mechanism works because the pose changed.

For a hand, distinguish the palm, thumb base and separate finger segments.
Place flexion centers along each digit and keep joint gaps intentional.
Use readable proportions and segment ordering before repeated knuckle detail.
Whether the reference shows a front or palm side must be resolved before
mirroring or assigning a hand's side.

Compare total palm thickness, including both the dorsal shell and grip pads.
Keep the central bed and local thumb-side/outer pads distinct where the source
shows them. Increasing every surface's bulge can close articulation spaces
and produce a swollen hand; inspect the palm and side as well as the back.

## Follow a deforming surface with an attached section

Use Blender parenting or constraints when an existing rigid relationship is
sufficient. For a small badge or a trim cross-section on deforming cloth, use
`scripts/production/surface_binding.py` from a normal production edit script.
Choose the supporting **outer** triangle and barycentric weights explicitly.
Keep that oriented triangle fixed; a nearest-face search at every pose can jump
to a lining, rim or neighboring part.

```python
from surface_binding import (
    surface_sample, bind_surface_points, transport_surface_points,
)

# Coordinates from evaluated geometry, all in the same coordinate space.
# outer_triangle_index and anchor_weights come from the selected attachment.
rest = surface_sample(rest_vertices, triangles)
binding = bind_surface_points(
    rest, outer_triangle_index, section_points, barycentric=anchor_weights,
)
posed = surface_sample(posed_vertices, posed_triangles)
new_section_points = transport_surface_points(binding, posed)
```

Create one sample per host mesh and pose and reuse it for all section bindings.
The sample copies positions and oriented topology; the binding captures the
authored anchor and section offsets. Transport follows the anchor and a proper
orthonormal tangent/normal frame. It preserves distances within that section
instead of stretching it with the host. Applying the same nonlinear displacement
independently to host and ornament does not preserve this relationship.

Supply evaluated host coordinates and attachment points in a shared space.
World space includes parent and object transforms; convert the returned points
back into the edited object's local space before writing mesh or shape-key
coordinates. With existing skinning, solve in the intended pre-skin space or
use the existing inverse/bake procedure; writing already posed world points
directly into a skinned key applies the deformation twice. The helper does not
read Blender objects, write data, set keyframes or install scene handlers.

Freeze the intended triangles before binding, and retain vertex identity across
poses. Nonfinite coordinates, a degenerate selected triangle, invalid weights
and changed topology are rejected. A same-count semantic vertex relabel that
retains the same index arrays cannot be inferred from coordinates. Nonuniform scale changes the host
but does not scale the attached section; reflections follow the supplied
winding. Supply consistent winding and inspect the intended outside.

Write the returned coordinates or derived rigid transform through ordinary
`bpy` operations and save with `run`. Keep only the useful native revision and
views. This is a local attachment construction aid: separate section frames
can still kink or intersect, and a large rigid badge can intersect a curved
host away from its anchor. Check the actual seams, support depth and neighboring
surfaces at useful intermediate poses before delivery.

## Exercise a limited, useful pose

Save the neutral state, then rotate one relevant joint through a declared test
angle. Check the pivot location, which pieces followed, which stayed fixed,
and clearance at nearby panels. Inspect intermediate positions when overlap
could occur between the endpoints. Restore the neutral transform exactly.

Repeat the requested edit in the exported/reopened asset when its hierarchy
or motion is a delivery requirement. A static mesh export can retain shape
while losing the intended editable relationship. Keyframes, parenting and a
visible pose are different claims; report which was actually exercised.
Pose samples are limited observations, not exhaustive collision clearance,
kinematic correctness, load capacity or a physical safety certification.

## Deliver useful animation

For an arm intended for games or 3D animation, define a useful motion range
and a repeatable action such as reach, grip and return. Exercise the assembly
at intermediate frames. Inspect joint housings, fingers, layered armor and
attachments for intersections, detachment or inverted surfaces. An attached
object can still float away from its intended support; measure the actual
named attachment points against the appropriate surfaces.

For an actuator spanning moving segments, define both anchors and update its
axis, extension and overlap throughout the action. Check that its rod remains
inside its housing and that both endpoints stay connected. A cable needs
enough routed length or deformation. Preserve these evaluated motions in the
export, baking them when the consumer cannot reproduce the DCC constraints.
Keyframe a meaningful synchronized action and verify its imported playback;
separate unsynchronized object actions do not prove one working assembly.

Choose a delivery budget and simplify according to part function. Retain joint
centers, moving-part separation, service access and local edit targets. Parts
with the same rigid motion and material can share a delivery mesh when their
source-to-delivery mapping remains clear. Do not merge across moving joints.
Read `references/production-topology.md` for measured topology/optimization
checks. State the tested engine and range without inferring physical load or
manufacturability from a game animation.

## Revise a component without disturbing the assembly

Use meaningful part names and local coordinates. Before moving a panel or
opening a service cover, identify its pivot, attached hardware and protected
neighbors. Compare their geometry, transforms and materials after the edit;
counts alone will not reveal accidental motion. Keep before/after cameras and
lighting fixed, then retain or restore the change based on actual output.

Separate ceramic or painted shells, exposed metal and rubber-like grips with
plausible roughness and metal settings. Convert sRGB swatches before assigning
linear shader inputs. Resolve broad material appearance before luminous strips
and tiny hardware. Concept-sheet claims about power, weight or neural control
describe the fiction unless independently supported by the requested work.
