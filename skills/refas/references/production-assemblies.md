# Articulated hard-surface assemblies

Use this guide for segmented mechanisms, armor and manufactured parts with
visible joints. Begin with the reference's complete assembly and proportions.

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
