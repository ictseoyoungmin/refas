# Articulated hard-surface assemblies

Use this guide for segmented mechanisms, armor and manufactured parts with
visible joints. Begin with the reference's complete assembly and proportions.

Sections: scale and hierarchy; connected boundary transitions; rigid surface mounting; flexible surface projection; joint local edits; editable cutters; editable cables and trim; lattice deformation;
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

Treat shell thickness as a design constraint. Where it is fixed, revise
curvature, panel spacing or local shape to resolve interference. Where it may
vary, `grade_thickness` from `thickness_field.py` grades explicit vertex values
along supplied edges while retaining minimums and protected values. All lengths
must share one unit; `max_gradient` is thickness change per edge length. This
helper returns a field without changing geometry or checking collisions.
Requested and minimum thicknesses may be scalars or per-vertex values; optional
`caps` maps vertex indices to upper thickness bounds. Protected indices retain
their requested values. Conflicting bounds return `FAIL` without a field.

For a reviewed mesh, apply non-rigid object/parent transforms first. This
example converts source coordinates and thickness to metres, then maps an
accepted field to a dedicated group on the intended ordinary Solidify modifier.
Use no even-thickness correction, clamping or inverted group influence:

```python
from thickness_field import grade_thickness

scale = bpy.context.scene.unit_settings.scale_length
result = grade_thickness(
    [tuple(c * scale for c in vertex.co) for vertex in obj.data.vertices],
    [tuple(edge.vertices) for edge in obj.data.edges], requested_m,
    minimum=minimum_m, max_gradient=maximum_taper, protected=protected_ids,
)
if result['status'] != 'PASS':
    raise ValueError('No thickness field satisfies the declared bounds')
field = result['vertexThickness']
nominal = max(field)
group = obj.vertex_groups.get('ShellThickness') or obj.vertex_groups.new(name='ShellThickness')
for index, thickness in enumerate(field):
    group.add([index], thickness / nominal, 'REPLACE')
solidify.thickness = nominal / scale
solidify.vertex_group = group.name
solidify.thickness_vertex_group = 0.0
solidify.solidify_mode = 'EXTRUDE'
solidify.use_even_offset = False
solidify.thickness_clamp = 0.0
solidify.invert_vertex_group = False
```

For outward normals and an exterior to preserve, use `solidify.offset = -1`.
Reuse the intended modifier and inspect its actual evaluated interior, rims,
openings and neighboring parts. Subdivision or deformation can change the field
between source vertices; verify the resulting shell in required poses.

## Join existing cage boundaries

Use `bridge_boundaries` from `boundary_bridge.py` to connect two existing open
edge chains or two closed loops in one ordinary mesh. Choose equal-length ordered vertex indices
with explicit `boundary_a[i]` to `boundary_b[i]` correspondence. Each selected
edge must have exactly one adjacent face; the boundaries must be disjoint.
Boundary positions set the transition span. Place them where the source's
fold or panel transition begins and ends before joining.

```python
from boundary_bridge import bridge_boundaries

joined = bridge_boundaries(
    cage, boundary_a, boundary_b,
    cuts=6, interpolation="SURFACE", smoothness=1.0,
    max_bulge=allowed_world_bulge, material_index=patch_material_slot,
)
patch_group = cage.vertex_groups.new(name="TransitionInterior")
patch_group.add(joined["newVertices"], 1.0, "REPLACE")
```

For a complete armhole, collar or other loop, also pass `closed=True`. List at
least three distinct vertices per loop without repeating the first at the end;
the helper includes each last-to-first edge. The chosen starting vertices and
order define the cyclic correspondence, without a nearest-point or twist
guess. Prepare compatible source-face winding before joining; the helper will
not flip existing faces to make an incompatible request pass.

`cuts` sets the number of interior rows. `SURFACE` uses Blender's native
interpolation from adjacent faces in cage-local coordinates. `smoothness`
controls that native blend; it is not a physical radius or prescribed tangent.
Use `LINEAR` for an intentional straight connection. Adjacent faces can make
SURFACE overshoot or fold; revise the source transition or deliberately choose
LINEAR instead of assuming the smoother option is better. `max_bulge`, when given,
limits each new vertex's world distance from its corresponding boundary-to-
boundary segment. It does not certify the entire patch or surrounding scene.

The helper stages the operation on a copy, verifies actual correspondence and
shared-edge winding, rejects degenerate/folded patches and preserves original
cage elements and supported layers. It returns the inserted vertex/face indices,
ordered rows, span range and observed vertex bulge without writing a file.
The original object survives; its mesh datablock is replaced. Keep its previous
native revision for recovery. A failed call retains the original mesh and the
caller's selection/context.

Open chains use the native bridge operator. Closed loops first create the
declared cyclic faces, then use native edge-ring subdivision for interior rows.
Both paths retain the same geometry and preservation checks.

The result is an ordinary connected cage: reopen it and edit its new rows using
native Blender tools. This is a one-time topology edit, with no live rebuild
handler. Supported original UV/color/weight/material/crease data stay intact;
inspect and author the new patch's UVs as required. Use a visible, unparented,
static, unshared mesh with supported local modifiers. Shape keys, animation,
custom normals, construction roles and managed fixed-topology sweep outputs
are refused. Explicitly prepare a separate ordinary cage when baking a source
whose topology contract must remain intact.

Changing connectivity can affect existing Solidify/Subdivision normals and the
evaluated neighborhood even when source vertices are unchanged. Inspect actual
thickness, nearby clearance and both sides of the connection. Native blending
does not promise exact G1/G2 continuity or global intersection freedom. Very
distant coordinates or extreme feature-scale differences can fail float checks;
recenter or revise the representation when needed.

## Mount rigid details on the actual surface

Use `place_on_surface` from `surface_mount.py` for a rigid badge, buckle,
bracket or mirror base. Choose the host and a bounded world-space ray from its
intended outside. Supply a world tangent for the part's forward direction.
Keep the host enabled in the active view layer. The first ray hit must face
the approaching ray; the helper does not skip a backface to find another layer.
Use a short search range near the intended feature so a long ray does not
consume the precision needed for a small gap. The helper samples the evaluated
host, aligns the part and applies a rigid transform only when the declared
contact samples meet the gap bounds.

Author the part with local +Z away from its mounting surface and local +X
forward. Select at least three noncollinear contact points in one local XY
plane (constant Z). Include edge and interior samples where the support varies;
the centroid is sampled too. Their centroid maps to the selected host point.
All ray positions and distance parameters use Blender world length units;
convert metres with `metres / scene.unit_settings.scale_length` when needed.

```python
from surface_mount import place_on_surface

# These are task-selected inputs, not camera coordinates or inferred defaults.
placement = place_on_surface(
    badge, shoulder_panel,
    ray_origin=outside_point, ray_direction=toward_shoulder,
    tangent=along_sleeve,
    contact_points=badge_contact_points,
    clearance=minimum_gap, max_distance=search_distance,
    max_gap=largest_acceptable_gap,
)
```

`max_gap` includes the clearance. Gaps are measured along the selected anchor
normal, not as shortest distances to the whole host. The result gives the chosen frame, sample
count, minimum/maximum gap and numeric tolerance. Too much host curvature for
the rigid footprint, no surface hit, reversed support or invalid inputs raises
`ValueError` before moving the part. Change the mount location or construct a
fitting base when needed; do not enlarge the acceptable gap to conceal a visibly
floating attachment. A flexible sewn patch needs a shape that conforms to the
cloth; rotating a flat patch cannot provide that fit. Re-run the same operation after editing the host or mount
parameters. It reads a fresh host each time and does not create a report file.

The part must be an unparented static mesh with positive orientation and no
shear, delta transforms, shape keys, constraints or rigid-body motion. Local
Bevel, Subdivision, Solidify, Triangulate and Weighted Normal modifiers are
supported; position-dependent modifiers are not. Keep the host independent of
the moved part. Mesh coordinates and scale are retained. The samples describe
the chosen support plane, not every point on the part: inspect its side and
contact area for overhang or nearby collisions. This operation does not bind
future animation; use the surface-binding recipe below for deforming trim.

`surface_frame` accepts the same host/ray/tangent selection arguments without
moving anything. Its returned frame is a snapshot; recompute after host edits.

### Keep rigid hardware attached during later edits

Use `bind_on_surface` with the same arguments when the host will change. It
first fits the contact footprint, then creates a three-vertex construction
mesh with native Surface Deform and vertex-parents the part to that frame.
For an open buckle or ring, sample an actual solid mounting bar or foot and
keep the sample centroid on that support; the empty aperture is not a contact.
The frame follows the evaluated host, including Subdivision followed by
Solidify; the part retains its own rigid shape. The frame is object-parented
to the host so ordinary host translation and rotation follow as well. There
is no Python scene handler, external cache or rebuild step after reopening.

```python
from surface_mount import bind_on_surface, check_surface_mount

mount = bind_on_surface(
    button, collar, ray_origin=outside_point, ray_direction=toward_collar,
    tangent=along_collar, contact_points=button_contact_points,
    clearance=minimum_gap, max_distance=search_distance, max_gap=maximum_gap,
)
# Later: edit the collar cage or its thickness using ordinary bpy.
check_surface_mount(button)
```

Production checks the saved relationship and footprint before saving/output.
An infeasible gap or changed evaluated polygon topology fails; it never picks
a new nearest layer or silently rebinds. Keep the carrier enabled, with its
construction role and `hide_render=True`; do not repurpose or edit its triangle.
This explicit mount is the supported construction-parent exception. Static
delivery captures the evaluated part transform and omits the carrier. Native
source keeps the relationship. Apply intended object scale before binding:
subsequent host scale changes or shear that stretch the rigid part are refused.
Changing subdivision levels, connectivity or topology-producing settings needs
a deliberate new mount. Detach the part with its evaluated world transform,
remove that part's obsolete carrier, and call `bind_on_surface` again.

Surface Deform has native target restrictions, so a failed bind restores the
part and removes the failed carrier. Its target must be independent of the
part; node-tree dependencies are not supported here. A large rigid footprint
still cannot follow arbitrary cloth curvature. Reinspect support after major
edits and provide a fitting base when needed. These are finite contact samples,
not a guarantee of full-part collision clearance. Animated target deformation
requires deliberate baking and playback checks for delivery; this operation
does not bake it. Flexible piping needs deformation of its own sections or
mesh, rather than one rigid parent frame for an entire long trim.

## Fit prepared flexible surface layers

Use `project_region` from `surface_project.py` for a thin surface cage whose
existing mask identifies complete connected components. Prepare its outline,
sampling density and layer relief first. A cloth badge backing, raised border
and emblem can use separate disjoint masks and offsets, with Solidify after
projection. Preserve the intended thickness and visible design while preparing
these layers; the helper changes only the native projection modifier.

```python
from surface_project import project_region

fitted = project_region(
    patch, sleeve,
    name="Backing fit", group="Backing",
    axis="Z", direction=-1,
    offset=surface_clearance, max_distance=search_distance,
    max_displacement=allowed_movement, tolerance=fit_tolerance,
)
```

Choose one local axis and direction (`-1` or `1`). Distance inputs use world
units. The source needs a positive, unsheared transform with unit world length
along that axis. The static target needs a rigid transform (rotation and
translation, with unit scale). Use an existing binary mask: zero-weight
vertices stay outside the edit, and a face cannot straddle the
selected and fixed regions. The supported source stack is compatible native
Project modifiers on disjoint masks followed by the supported Solidify/Bevel
suffix. The function refuses unsupported dependencies, transforms and stacks
instead of applying transforms or rebuilding the cage. Requested distances
and tolerances must remain representable at the source and world coordinates.

Each selected input ray must reach its first geometric intersection within
`max_distance`, and that face must face the ray. A nearer backface cannot be
skipped for a farther front surface. The actual evaluated projection is checked
against the expected offset, including transverse drift. `max_displacement`
bounds movement from the cage entering that modifier; later edit-to-edit
movement is a separate observation. Native Project can silently leave a missed
vertex in place, so a successful modifier creation alone is insufficient.

The result reports vertex and triangle-interior observations with sample
coverage. `tolerance` is the requested residual bound. Coarse faces that bridge
too far from the target fail; refine the source deliberately when needed.
Finite samples do not certify every surface point or global collision freedom.
Projection-axis clearance differs from shortest or normal distance on a
sloping target. Check the final layered shell and its visible support too.

The existing source mesh, masks and other layers remain available. A matching
named modifier is revised in place and must keep its target, mask, axis and
direction. A failed call restores its prior settings, order and active modifier,
or removes only a newly created failed modifier. Ordinary native offset/mask/cage
edits remain possible after reopening. Recheck after such edits
or target changes. This fits static surface layers; the separate surface-binding
recipe handles authored sections following a deforming triangle.

## Edit several local targets with a fixed surrounding cage

Use `edit_region` from `local_edit.py` when several different target positions
must shape one local region together. Supply existing vertex indices or a binary
vertex group, and absolute world-space target positions for the handle vertices.
Keep attachment rows, intended crease lines and protected outline vertices out
of the region. Every outside coordinate stays unchanged; this does not freeze
the evaluated shell normals or margins at its boundary.

```python
from local_edit import edit_region

result = edit_region(
    panel, region="LocalFold", handles=world_targets,
    max_displacement=0.008, tolerance=0.00005,
    distances=[{"name": "opening_width", "vertices": (left, right),
                "min": 0.098, "max": 0.104}],
    shell_pairs=[{"name": "fold_shell", "vertex": fold_vertex,
                  "min": 0.0025, "max": 0.0035}],
    obstacles=[{"name": "inner_layer", "object": inner_layer,
                "vertices": [contact_vertex], "direction": inward,
                "min": 0.029, "max": 0.040}],
)
```

The example uses metre world units. Choose the region, handle mapping, sample
indices, directions and bounds from the actual feature. Omit optional bounds
that do not express a requirement; the returned record identifies what was
observed. A directional ray must hit the first front-facing surface within its
declared range; a miss or back-facing first hit is a conflict, not a skipped
sample. Ray distance is not shortest clearance, and these cage-origin samples
do not measure the entire final shell against the obstacle.

The helper fairs the **displacement**, keeping a zero-move rest pose unchanged,
and applies all handles as hard targets. It has no per-handle falloff radius or
persistent control objects. It checks both hard targets and the realized free
displacement after native float storage. An unresolved coordinate precision or
near-grazing ray is rejected instead of reporting a precise fit.
Size bounds measure declared cage vertex pairs. Shell-pair bounds measure the
distance between verified corresponding sides of one supported simple Solidify
at the selected source vertices; they are not normal thickness or a global
minimum wall guarantee. The source may have no modifiers or that supported
Solidify alone. Shape keys, shared mesh data, animation, parent/constraint
dependencies and other modifier stacks are outside this operation.

If a bound, target, numerical solve or supported-state check fails, the call
raises `ValueError` and retains its input coordinates and native data. A conflict
means this proposed displacement failed; it does not prove no other shape can
satisfy the requirements. The operation does not trade away a handle target to
make another bound pass. Change the target, region or construction deliberately
and try again from the retained source.

On success, the same ordinary mesh and its per-element data remain. Reopen the
native and call with new absolute targets, or use ordinary mesh editing without
this module. Later edits need fresh observations. Inspect garment layers from
the side and the hard-surface crease in context: smoother displacement is not
automatically better source geometry. Use native proportional editing or a
lattice directly when those controls suit the correction. Large rotations,
rigid-detail preservation and continuous collision avoidance are not promised.

## Keep openings editable with construction meshes

### Cut a blind recess from a surface outline

Use `cut_recess` from `recess.py` for a static solid with a convex pocket or
socket. It constructs and aligns the cutter, keeps an Exact Difference Boolean
and checks actual evaluated floor/wall geometry. The outline is an ordered,
strictly convex polygon in the selected tangent/bitangent plane; it closes
implicitly and must enclose the selected origin `(0, 0)`. Supply its coordinates
and all distances in Blender world units.
The floor is at `-depth` from the selected tangent plane, not at a constant
distance below every point of a curved exterior.

```python
from recess import cut_recess

recess = cut_recess(
    housing, "IntakeRecess",
    ray_origin=outside_point, ray_direction=toward_housing,
    tangent=along_intake,
    outline=opening_outline, depth=recess_depth,
    min_floor=remaining_floor, min_wall=remaining_side_wall,
    max_distance=search_distance,
)
```

Use the same host/name with revised outline or depth to edit that feature.
Selection excludes only its own previous Boolean, so repeated edits measure
from the original opening surface and do not accumulate depth. Keep the managed
Boolean last in the supported modifier stack. The ordinary cutter remains in
the native scene; its mesh outline and the Boolean stay editable. The helper
rebuilds its mesh from the explicit arguments, so reapply cutter-specific face
materials or manual edge edits afterward. It has no radius/bevel parameter and
does not infer changed parameters from arbitrary manual cutter edits.

The host must be an enabled static closed mesh with consistent winding. The
operation rejects invalid outlines, an unsupported scene state, a missed
surface, or insufficient sampled floor/wall material. A failed operation keeps
the accepted cutter and host state. The remaining-material limits describe the
declared axial and side probes; they do not certify a global minimum thickness
between samples. The origin, centroid and rim-derived samples are automatic;
`floor_samples` can add important interior UV points. Inspect the actual opening, side wall and floor from an
oblique or section view. Thin cloth pockets and folded openings need their
own shell construction rather than this solid subtraction.

### Use a native cutter for other Boolean constructions

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
still fails rather than disappearing from delivery. A construction mesh may
parent a deliverable only through the explicit native surface mount above.

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
