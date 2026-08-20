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

`createSurfaceNetwork` records observed cells and unique adjacency polylines in reference space. `createSurfaceNetworkParts` maps them to the selected support surface and enforces:

```text
physical shared boundaries = observed shared adjacencies
```

Panel meshes are per observed cell; boundary meshes are per shared adjacency, never per cell. Junction geometry may connect three or more shared boundaries but does not duplicate them.

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
