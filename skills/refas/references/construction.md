# Shape and surface construction

## Shape reconstruction owns

- dominant silhouette;
- mass distribution and proportions;
- principal curvature and thickness;
- coarse negative spaces;
- watertight, finite, non-degenerate geometry.

Build these before seams, panels, fasteners, engravings, or material polish. A detailed wrong silhouette is still wrong.

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

## Compound shells and conforming parts

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
