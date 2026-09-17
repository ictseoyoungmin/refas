# Organic and articulated manufactured forms

Use this recipe for drawing mannequins, dolls, robots, prosthetic forms,
segmented creatures, and manufactured products whose identity depends on
organic section changes and movable joints. It supplements the general shape,
surface, and assembly contracts. Source evidence constrains what may be
reported as observed, but lack of observation is not a default prohibition on
constructing the rest of the 3D form. Where the source does not determine a
shape, continuation, or mechanism, use an explicit hypothesis, structural
prior, or downstream requirement and keep that choice distinct from source
fact.

## Whole-shape authority

Establish the posed whole before constructing separate parts:

1. register the reference camera and image bounds;
2. mark the head, ribcage, pelvis, hands, feet, and every visible joint center;
3. record longitudinal axes through the torso and each limb chain;
4. record the outer silhouette and important negative spaces on both sides of
   every axis;
5. fit principal transverse sections where width, depth, or plane direction
   changes;
6. render the complete blockout in the registered hero camera.

Do not advance to fingers, joint hardware, seams, or materials while a whole
silhouette, landmark, pose, or major negative-space finding remains open.

## Identity-bearing surfaces

A sphere, ellipsoid, capsule, cone, cylinder, or uniform revolution is a useful
blockout primitive. It is not identity-bearing geometry merely because it has
many subdivisions. Graduate it by replacing generic profiles with
evidence-fitted construction:

- a landmark cage that fixes observed extrema and plane changes;
- a longitudinal guide aligned with the observed part axis;
- multiple transverse sections that encode asymmetric width and depth;
- transition surfaces whose tangents preserve or deliberately break continuity;
- projection anchors for visible cut lines, ridges, hollows, and silhouette
  inflections.

Spend triangles where these constraints vary. Subdivision that only smooths an
unchanged generic primitive adds density, not observed information.

## Articulation topology

Treat each physical joint as a relation among bodies, not as a sphere merged
into a limb:

- name proximal shell, distal shell, joint center, rotation axis, and any ball,
  pin, socket, opening, clearance, stop, or occlusion element that belongs to
  the selected construction hypothesis; keep observed, inferred, and engineered
  elements distinguishable;
- model a socket/opening as real negative space when source evidence requires
  that opening;
- preserve the selected shell-thickness hypothesis and the silhouette of any
  visible cutaway around the joint;
- keep the moving child in a local frame whose origin is the joint center;
- store inferred or engineered limits separately from observed pose;
- test at least the reference pose and one materially different pose without
  changing part-local geometry.

Use rigid node hierarchy for a segmented physical mannequin. Use skinning only
when the source or selected construction hypothesis requires deformable material
spanning a joint.

## Observed obligations and completion hypotheses

A visible contour, cut line, opening, overlap, proportion, highlight break, or
curvature transition is a source-backed obligation when the evidence supports
it. Geometry not determined by the current views—such as depth continuation,
rear surfaces, internal joint structure, or manufacturer-specific limits—may be
completed by a bounded inferred or engineered hypothesis when needed for a
coherent 3D asset or downstream function. Do not report that completion as
observed merely because it was instantiated.

Do not create authority entries for every geometric degree of freedom. Use the
semantic-authority contract when a proposition is explicitly tracked or later
claims depend on its provenance. If new evidence contradicts a completion
hypothesis, reopen its owner and revise it rather than preserving the old
construction as source truth.

## Closure evidence

Before claiming identity-bearing shape closure, create and validate
`refas.construction-quality/v1`. The record must cover the whole silhouette,
major landmarks, principal sections, curvature transitions, coarse negative
space, and a registered source-to-render comparison. A generic-primitive-only
record cannot make an identity-bearing claim even when every mesh is valid and
every render completes.

After the whole barrier passes, repeat the same evidence pattern for any child
whose visible shape materially affects identity. Only then may the child become
immutable for parent assembly.
