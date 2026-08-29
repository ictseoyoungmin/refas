# Public schemas

These Draft 2020-12 schemas describe the immutable artifacts emitted by the canonical runtime in `skills/refas/scripts/lib/`. Constructor input templates live in `skills/refas/assets/templates/`; constructors normalize those inputs and add digests, policies, metrics, and derived fields before an artifact conforms to its public schema.

Runtime validators remain authoritative for semantic invariants that JSON Schema cannot express compactly, including hierarchy ancestry, digest recomputation, registration invertibility, unique shared adjacency, acyclic occlusion, capability lineage, exact artifact-byte recovery, independent-reference certification, complete view and gate sets, blocking-finding refusal, independent PBR report binding, and renderer material support.

`canonical-object-frame.schema.json` also documents the editable frame input consumed directly by the renderer. The renderer remains authoritative for orthonormality, handedness, finite coordinates, exact GLB part-name resolution, and the canonical frame digest.

`parameter-fit-plan.schema.json` and `parameter-fit-report.schema.json` define owner-local joint geometry search. The runtime additionally enforces bounds, protected-regression semantics, deterministic trial order, exact plan/report digests, and candidate/render byte verification.

The optional shape-repair backend consumes those same plan/report contracts and derives its objective measurements from digest-bound realized projection proofs; it does not introduce a second evidence schema or mix material appearance terms into geometric segment IoU.
