# Articulated hard-surface assemblies

Use this guide for segmented mechanisms, armor and manufactured parts with
visible joints. Begin with the reference's complete assembly and proportions.

Sections: scale and hierarchy; motion hierarchy; surface attachments; useful
poses; delivered animation; local component revisions.

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
