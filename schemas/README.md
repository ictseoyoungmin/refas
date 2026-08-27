# Public schemas

These Draft 2020-12 schemas describe the immutable artifacts emitted by the canonical runtime in `skills/refas/scripts/lib/`. Constructor input templates live in `skills/refas/assets/templates/`; constructors normalize those inputs and add digests, policies, metrics, and derived fields before an artifact conforms to its public schema.

Runtime validators remain authoritative for semantic invariants that JSON Schema cannot express compactly, including hierarchy ancestry, digest recomputation, registration invertibility, source-space reference-geometry link integrity, observed-segment/interface integrity, unique shared adjacency, acyclic occlusion, capability lineage, exact artifact-byte recovery, independent-reference certification, complete view and gate sets, blocking-finding refusal, independent PBR report binding, and renderer material support.

`reference-geometry.schema.json` documents observed 2D reconstruction obligations before model-space reconstruction: structural anchors, chains, axes, source-visible segments and interfaces, contacts, occlusions, negative spaces, contours, and dimensions. It deliberately excludes reconstructed depth and model transforms. `reference-registration.schema.json` remains framing/placement evidence and cannot substitute for source-shape agreement.

`canonical-object-frame.schema.json` also documents the editable frame input consumed directly by the renderer. The renderer remains authoritative for orthonormality, handedness, finite coordinates, exact GLB part-name resolution, and the canonical frame digest.
