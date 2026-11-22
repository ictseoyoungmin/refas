# Continuous garments and folded collars

Use this guide when a garment's silhouette, seams or folded edges are the
current modeling problem. Work from the whole reference before adding trim.

## Establish the shape

Choose a common coordinate frame and scale from clearly labelled dimensions.
Distinguish circumference, flat width and surface length; do not force
conflicting labels into the same measurement. Compare front, side and back
landmarks together. A fitted torso has changing cross-sections and a sleeve has
an elbow and taper; independently scaled cylinders rarely express both.

Block the garment's open volume first: neckline, chest, waist, hem, armholes
and wrist openings. Match its negative spaces as well as its outer silhouette.
Keep intentional openings open. Treat the unseen body or lining as an inferred
fit aid, not additional reference evidence.

## Make a seam continue in position and direction

For a continuous cloth shell, construct both sides of a seam from the same
boundary vertices, with consistent winding. Give the adjoining rows enough
space to turn gradually into each surface. Welding coincident vertices closes
a gap but does not repair a sharp tangent change, collapsed faces or a badly
placed high-valence pole.

At an armhole, shape a sleeve cap into the torso rather than attaching a flat
tube end. Distribute the turn across several well-spaced rows and inspect the
underarm from front and rear oblique views. Avoid concentrating many edges at
the deepest concavity. Preserve sleeve length and wrist placement while
adjusting the transition.

Review the evaluated subdivision and thickness result, not only the cage.
Separately subdivided boundaries can pull apart; tight support loops can pinch
even a welded seam. Change the cage or representation before increasing
subdivision to hide the defect. Keep a recoverable version of the previous
shape, especially when joining objects changes later edit selection.

## Build the fold, then its outline

A collar stand wraps the neck opening; the turned collar rolls outward from
it. A lapel turns out from the front opening along a roll line. Establish that
relationship with connected or deliberately overlapping cloth strips, then
shape the notch and tips. A flat polygon floating over the chest can match a
front outline while failing in depth.

Control section width, depth and turning height independently. Trace a section
from the neck attachment over the roll to the free leaf, then compare its
clearance with the shoulder and chest. An over-wide side or back leaf can
become a projecting shelf even when the front notch improves. Inspect that
profile before finalizing the front outline. Give the collar border and lapel
notch one readable edge each; do not accumulate short overlapping trim strokes.

Use controlled thickness and softened fold curvature. Check the neckline,
inside face, lapel-to-body distance and collar-to-shoulder clearance from side
and rear views. Place piping on the final cloth surface after these forms are
stable. Decorative strips must not conceal a structural gap.

## Judge fabric under stable lighting

Separate base colour, roughness and metal response. Convert an sRGB/hex swatch
to linear values when assigning it to a linear shader input. Dark fabric can
still read grey under a bright environment; compare diffuse cloth and metal
hardware in the same fixed review light before changing either material.
Do not darken the entire scene to conceal poor form.

Inspect the largest silhouette or connection defect first, then folds and
trim. A good still image does not establish cloth simulation, UV quality,
skinning or deformation.

## Make the garment wearable

For game or animated clothing, import a copy of the actual target character
and inspect its scale, rest pose, body surface, skeleton and existing weights.
Fit the garment to that body and pose while preserving the design. A jacket
modeled with lowered arms must be repositioned and reshaped for a T-pose rig;
parenting the whole jacket to the chest cannot provide sleeve deformation.
Keep the source character unchanged. Do not shrink the body or hide penetrating
skin to manufacture a successful fit. Any intentional body masking is a
separate declared delivery choice, not evidence of geometric clearance.
Some supplied characters already omit skin under their clothes. Retain the
actual original undershirt when it is the fit target and state the missing
body coverage; do not claim clearance against a surface that is absent.

Build useful edge flow around the shoulder, armhole, elbow, collar and torso
bends. Transfer or author skin weights, normalize them and inspect influences
near the chest/arm boundary. Transfer is a starting point; nearby sleeves and
torso can receive the wrong bone. Keep ornaments and straps attached to the
surface or segment they belong to throughout the motion.

If useful poses still collapse or intersect after correcting fit and weights,
author garment corrective shapes and test their intermediate blends. Preserve
the character body. Bake the corrective weights together with the bone action
when the consumer cannot evaluate authoring drivers. With the tested Blender
glTF NLA export, matching track names combine the involved actions into one
clip; inspect actual clip names and key timestamps after export.

Check rest pose, arm raising, elbow flexion and a useful torso bend or twist,
including intermediate frames. Inspect front, side, back and underarm views
for body penetration, collapsed folds, reversed faces and floating details.
Keep intentional neck/front/hem/cuff openings distinct from accidental tears.
Record the exact character and tested range. A body proxy supports a proxy-fit
claim only; one fitted character does not establish universal sizing.

Read `references/production-topology.md` for rebuilding and reducing the mesh.
Apply required static modifiers before skinning/export, or use a separately
baked delivery mesh while retaining the editable source. Reopen the exported
skin and animation, and play them in the declared consumer. Keep cloth
simulation, baked animation and ordinary skeletal deformation as separate
claims; choose the method needed by the requested use.
