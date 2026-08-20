# Public schemas

These Draft 2020-12 schemas describe the immutable artifacts emitted by the canonical runtime in `skills/refas/scripts/lib/`. Constructor input templates live in `skills/refas/assets/templates/`; constructors normalize those inputs and add digests, policies, metrics, and derived fields before an artifact conforms to its public schema.

Runtime validators remain authoritative for semantic invariants that JSON Schema cannot express compactly, including hierarchy ancestry, digest recomputation, registration invertibility, unique shared adjacency, acyclic occlusion, capability lineage, exact artifact-byte recovery, independent-reference certification, complete view and gate sets, blocking-finding refusal, and renderer material support.
