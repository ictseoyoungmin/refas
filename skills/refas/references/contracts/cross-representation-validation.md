# Cross-representation validation contract

P14 compares current canonical RefAs semantics with one replay-verified normalized backend representation.

It is a validation/evidence layer. It does not own canonical truth, backend-specific divergence authorization, or physical readiness claims.

## Required upstream chain

Use P14 only after:

```text
refas.physical-asset-bundle/v1
  -> refas.representation-capacity/v1
  -> refas.backend-export/v1
  -> refas.normalized-representation/v1
  -> refas.cross-representation-validation/v1
```

Before comparison, the runtime must prove that:

1. the P11 capacity profile is live against the current P10/P01-P09 state;
2. the P12 export binding is live against that same current canonical state;
3. the P12 artifact bytes reproduce the bound artifact descriptors;
4. the P13 normalized representation passes exact normalizer-implementation replay against those verified bytes;
5. the current canonical export view digest equals the canonical-view digest sealed into P13.

If any proof fails, do not emit semantic comparison outcomes from untrusted or stale evidence.

## Comparison identity

Compare exactly one P11 obligation at a time.

The stable identity is:

```text
obligationId
semanticPath
subjectIds
```

Backend array order, traversal order, node index, motor index, runtime address, artifact path, and locator are never comparison identity.

P14 emits one deterministic finding for every P11 obligation. Findings remain owned by the existing `assembly` capability because P14 is cross-cutting validation of physical semantics rather than a new truth owner.

## Outcomes

P14 supports exactly `EQUIVALENT`, `LOSSY`, `DRIFT`, `UNRESOLVED`, and `INVALID`.

### `EQUIVALENT`

The obligation is emitted exactly, canonical authority is sufficiently resolved, normalized semantic structure is valid, and the normalized value equals the current canonical value after representation normalization.

Equivalent rigid transforms must not create false drift. Backend m/cm/mm, Euler conventions, XYZW/WXYZ order, and quaternion `q` versus `-q` are normalized by P13 before P14 comparison.

### `LOSSY`

The P11/P12 representation contract already declares semantic loss through `EMITTED_APPROXIMATION` or `OMITTED_UNSUPPORTED`.

P14 preserves the exact approximation strategy, reason, retained semantics, and lost semantics, or the exact unsupported reason. A value that happens to numerically match the canonical value does not erase declared representation loss.

### `DRIFT`

An `EMITTED_EXACT` obligation is representable and structurally valid, canonical authority is sufficiently resolved, but the normalized semantic value differs from the current canonical value.

P14 produces a typed `DRIFT` finding. It does not replace that finding with a numeric score or weighted average.

### `UNRESOLVED`

The current canonical semantic value contains unresolved state required for positive comparison.

P14 does not fabricate a canonical target and does not convert unresolved authority into drift or equivalence.

### `INVALID`

The replay-verified backend reading cannot satisfy the semantic structure required by the canonical obligation, for example a string in place of a finite physical scalar or an incompatible object shape.

Evidence-integrity failures such as stale P11/P12 bindings, artifact tamper, stale canonical state, or failed P13 replay are rejected before comparison rather than mislabeled as semantic drift.

## No aggregate override

P14 stores typed per-obligation outcomes and deterministic counts only.

There is no aggregate fidelity score. No mean, weighted sum, percentage, or threshold may convert `LOSSY`, `DRIFT`, `UNRESOLVED`, or `INVALID` into `EQUIVALENT`.

## P15 boundary

P14 never consumes or authorizes a backend-specific divergence declaration.

A differing emitted-exact property remains `DRIFT` in P14.

A downstream divergence contract may later bind an explicit declaration to that exact canonical/backend comparison and classify an authorized difference without mutating canonical RefAs state.

## Physical-claims boundary

P14 does not authorize simulation-ready, control-ready, or runtime-ready claims. Claim authorization remains downstream under its own policy.

## Public artifact

Persist `refas.cross-representation-validation/v1` with:

- validation and scope identity;
- exact current canonical-view binding;
- exact P11 capacity binding;
- exact P13 normalization/export/implementation binding;
- one finding per obligation;
- deterministic outcome counts;
- canonical P14 policy;
- `validationDigest`.

`validateCrossRepresentationValidationBindings(...)` recreates the validation from current canonical state and current verified backend evidence. A re-signed stale finding set does not become current evidence.
