# Shape and surface construction

## Shape reconstruction owns

- dominant silhouette;
- mass distribution and proportions;
- principal curvature and thickness;
- coarse negative spaces;
- watertight, finite, non-degenerate geometry.

Build these before seams, panels, fasteners, engravings, or material polish. A detailed wrong silhouette is still wrong.

## Blockout and identity-bearing geometry

A blockout establishes camera, pose, broad mass, and candidate negative space.
Generic primitives and generic profiles are appropriate here. They are not
identity-bearing merely because they are smooth, dense, watertight, rigged, or
renderable.

Identity-bearing geometry explains the reference-specific visible form through
observed landmarks, silhouette inflections, principal sections, curvature
transitions, openings, and plane changes. Before closing shape reconstruction:

- render the exact candidate in the registered source camera;
- compare the whole silhouette and declared landmarks in source coordinates;
- cite evidence for principal longitudinal and transverse sections;
- inspect side, top, grazing, and normal views for the selected depth hypothesis;
- record coarse negative spaces and visible attachment cutaways;
- validate `refas.construction-quality/v1` with an `identity-bearing` claim.

A generic-primitive-only record must fail identity-bearing closure even if its
triangle count, watertightness, and render integrity pass. Validation volume is
not construction quality.

## Surface topology owns

- projection-anchored boundary networks;
- cells, panels, seams, ribs, relief, and recesses;
- junction continuity and shared adjacency;
- topology that remains coherent in oblique and grazing views.

Represent shared boundaries once when possible. Adjacent cells should consume the same boundary data instead of maintaining nearly matching copies.

`createSurfaceNetwork` records observed cells and unique adjacency centerlines in reference space. `createSurfaceNetworkParts` maps them to the selected support surface and enforces:

```text
every observed shared adjacency has one owning centerline
```

Panel meshes are per observed cell; boundary data are owned per shared adjacency, never per cell. A downstream network compiler may merge collinear centerline fragments into fewer physical sweeps only when it records complete adjacency coverage. Junction geometry may connect three or more shared boundaries but does not duplicate them.

## Open-frame mounts and structural negative space

An **open-frame mount** is one connected structural frame whose members surround
real negative spaces and provide a traceable support path between attachment
lands. Think of the opening and its surrounding frame as a paired topology: the
void is designed geometry, not missing decoration, and the frame is not a pile
of bars that happens to resemble the reference from one camera.

Observe and name the construction before choosing primitives:

- the outer silhouette and each **void silhouette**;
- frame members and the bridges that connect them;
- junctions, gussets, shoulders, and changes in member section;
- mounting feet or lands where loads can enter the parent;
- wall thickness, inner walls, and bevel, chamfer, or fillet treatment;
- visible contact, clearance, and occlusion at every attachment.

The topology contract is one coherent load-bearing frame with true apertures,
continuous member junctions, and consistent wall ownership. Adjacent members
meet through shared or deliberately joined geometry; they do not terminate as
floating struts or hide coplanar overlaps inside one another. A dark inset plate
does not count as an opening, and a collection of independent prisms does not
count as a frame merely because its hero projection looks correct.

Treat structural interpretation with the same evidence discipline as shape.
A visible sequence from one mounting land, through members and junctions, to
another land may support a load-path hypothesis. Hidden continuity, internal
reinforcement, fastener preload, and engineering capacity remain hypotheses
unless the source or downstream specification attests them. Record ambiguity
instead of inventing a mechanically authoritative interior.

Validate an open frame in hero, reverse, side, top, grazing, normal, and
object-ID views. The apertures must remain open, member thickness must remain
coherent, junctions must not split or self-intersect, and mounting lands must
remain attached. If a frame reads as a cage of separate sticks, a painted-on
hole, or a solid slab outside the hero view, route the defect to
`surface-topology`; route incorrect parent contact or penetration to `assembly`.

## Compound shells and conforming parts

Use `createHardSurfaceShell` when a shell, cover, bracket, guard, or mount needs
coherent thickness and true through-openings. Its public input contract is
`refas.hard-surface-spec/v1`: one outer profile, zero or more uniquely named
cutout profiles, thickness, an optional shared surface authority, and explicit
outer/cutout edge treatments. `sharp`, `chamfer`, `fillet`, and `stepped`
treatments change the real front, back, and wall geometry; they are not shading
labels.

The compiler emits one watertight mesh plus
`refas.hard-surface-topology/v1`. Stable face and boundary-edge IDs, triangle
ranges, and local attachment frames are serialized into the GLB mesh extras so
downstream assembly can reference the aperture or outer frame without guessing
from vertex order. Self-intersection, overlapping or exterior cutouts,
degenerate faces, treatment inversion, and excessive treatment depth fail
closed. A dark polygon, alpha mask, or independent lattice does not satisfy a
through-opening requirement.

`createCurvedPlate` must tessellate the polygon interior whenever curvature affects the silhouette, side view, or shading. Set `subdivisions` from a measured fidelity target; do not use triangle count alone as a quality claim. The back face is offset along the local surface normal, not a global axis.

Use one surface authority for the full construction:

- `surfaceFrame` returns a point, normal, and tangents at a reference-space coordinate;
- `createSurfaceRibbon` sweeps rectangular or explicit crowned/beveled profiles over that authority;
- `createSurfaceNetworkParts` makes panels, shared ribs, and junctions consume the same surface;
- normal-oriented fasteners use the returned surface normal as their axis.

For a projection-anchored guided surface, store image bounds, camera pose, at least three transverse cross-sections spanning the normalized surface, and an optional longitudinal guide in the asset-specific model specification. This preserves the attested reference silhouette while allowing a spatially varying fold. Polynomial crown and crease terms remain suitable for simpler evidence, but one shallow scalar crown is not an adequate substitute when side or grazing evidence shows a compound bend.

When a trusted predecessor asset exists, record its byte digest and shape-only regression measurements such as bounds, depth-to-width ratio, curvature samples, and mesh topology. Keep source bytes out of the repository unless redistribution is authorized. A regression target constrains construction; it does not by itself certify visual fidelity.

## Runtime versus model specification

Reusable runtime code may contain:

- deterministic mesh and GLB functions;
- validators and renderers;
- generic surface mappings;
- checkpoint and routing logic.

Asset-specific model specifications contain:

- polygons and observed landmarks;
- proportions and surface parameters;
- selected hypotheses;
- material assignments;
- source registrations.

Never hard-code one benchmark's coordinates or iteration names into reusable runtime code.

## Parameterized render fitting

When a construction backend exposes semantic geometry parameters, use `refas.parameter-fit-plan/v1` and the `fit-parameters` CLI to jointly search coupled proportions, sections, curvature, or thickness. Read `parameter-fitting.md` before starting. Every evaluation must produce exact candidate GLB and render content references; analytic-only proxy tests do not replace the actual-render fixture or final source-bound inspection.

The optimizer ranks trials but does not make generic primitives identity-bearing. If the selected representation still cannot express observed silhouette inflections, principal sections, curvature transitions, or negative spaces, reopen the representation instead of spending a larger evaluation budget.

## Geometry checks

For every closed part, record:

- vertex and triangle counts;
- degenerate triangle count;
- non-manifold edge count;
- watertight status;
- bounding box and coordinate frame;
- GLB SHA-256.

Use `inspect-glb` for container integrity and mesh metadata. Then render actual geometry; structural validity is necessary but not visual proof.

## Detail restraint

Add a feature only when it is:

- visible in primary evidence;
- necessary for silhouette, attachment, or shading behavior;
- an explicitly labeled inferred support; or
- required by the user's downstream use.

Do not spend geometry budget on unsupported microdetail while a whole-object blocker remains.
