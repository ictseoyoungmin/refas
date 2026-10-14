# Production-first modeling guidance A/B evaluation

## Objective

Evaluate whether shorter, constructive agent instructions improve the quality of an actual editable 3D asset. This is an experimental comparison, not a new certification gate.

## Treatments

- **A:** installed skill at `develop/v1.2.1@5172513f335b5c0fec7a400dbb90fcc858047015`
- **B:** installed skill at the reviewed guidance-only candidate PR
- Same permitted reference image, agent/runtime, Blender toolchain, resource and time budgets, geometry-output requirements, and review cameras.
- Fresh isolated worker, project, and installed skill for each condition. Keep source image and baseline GLB out of the public repository unless licensed for distribution.

## Outputs per condition

1. Editable native source project and final GLB, with exact hashes.
2. Source-registered view plus front/side/rear/top/grazing/neutral-clay captures.
3. Per-component closure, wall thickness, intentional connectedness, and assembly/contact findings.
4. Blind human review of source-visible silhouette, repeated structure, distinctive parts, and perceived fidelity.
5. Construction/edit timeline, number of revisions, and actual elapsed time.

## Decision

Compare complete-asset quality and time to a credible whole shape. Report Geometry Valid, Reference Resemblance, and Game Ready separately. A completed A/B run and inspectable real GLB are required before claiming that the instruction change improves modeling quality. Retain existing source-bound verification policies throughout.
