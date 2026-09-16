# Divergence authorization contract

P15 authorizes an explicit backend-specific construction choice against one exact live P14 cross-representation validation.

It does not mutate canonical RefAs state, rewrite backend artifacts, weaken P14 evidence, or authorize downstream physical-readiness claims.

## Required upstream chain

Use P15 only after:

```text
refas.physical-asset-bundle/v1
  -> refas.representation-capacity/v1
  -> refas.backend-export/v1
  -> refas.normalized-representation/v1
  -> refas.cross-representation-validation/v1
  -> refas.divergence-authorization/v1
```

Before any declaration is accepted, P15 revalidates the exact P14 artifact against the current P11–P13 evidence chain. Stale canonical state, stale capacity/export binding, artifact-byte tamper, normalizer implementation drift, or failed P13 replay stops authorization.

## What may be declared

Only a P14 `DRIFT` finding may become `DECLARED_DIVERGENCE`.

P15 must not relabel:

- `EQUIVALENT`;
- `LOSSY`;
- `UNRESOLVED`;
- `INVALID`.

Those outcomes retain their P14 meaning.

## Declaration identity

A declaration binds all of the following:

```text
exact P14 validation digest
exact P14 finding ID
exact P11 obligation ID
target backend
semantic path
semantic subject IDs
field path
exact canonical value
exact normalized backend override value
authority subject
reason
```

`fieldPath` is an RFC 6901 JSON Pointer relative to the P14 finding's `canonicalValue` / `normalizedValue`. The empty pointer means the entire semantic value.

Declaration IDs and authority-subject IDs are deterministic functions of the exact P14 validation digest, finding ID, and field path. Backend array positions, runtime indices, artifact paths, and display names never become declaration identity.

## Exact coverage rule

A declaration is not a vague waiver.

For each declared P14 finding, RefAs starts from the exact P14 `canonicalValue`, applies the declared field replacements, and requires the result to equal the exact P14 `normalizedValue`.

```text
P14 canonical value
  + exact declared replacement(s)
  == exact P14 normalized backend value
```

If not, authorization fails.

Therefore:

- a declaration cannot silently cover neighboring fields;
- partial declaration of a multi-field drift fails;
- overlapping field paths are rejected;
- an unchanged field cannot be declared as divergence;
- a declaration cannot point at a missing field or array element;
- a declaration whose canonical or override value differs from P14 evidence fails.

A root declaration may authorize the whole exact semantic value. If root is declared, no nested declaration may overlap it.

## Semantic authority

P15 reuses `refas.semantic-authority-set/v1`. It introduces no second provenance or authority vocabulary.

The authority set must:

- bind the exact `refas.cross-representation-validation/v1` digest being authorized;
- match the current source digest and scope;
- cover exactly the active declaration authority subjects;
- use `engineered` authority for every declaration.

The existing semantic-authority contract already requires `engineered` authority to carry a functional or downstream requirement basis and forbids it from ignoring source contradiction.

`DECLARED_DIVERGENCE` and `engineered` are intentionally different concepts:

- `engineered` is the semantic authority licensing an explicit downstream construction choice;
- `DECLARED_DIVERGENCE` is the downstream validation outcome after that exact choice has been bound to P14 evidence.

Observed, inferred, unknown, or forbidden authority does not license a backend-specific override in P15.

## Canonical state is immutable here

P15 never writes back into:

- P01–P10 canonical physical construction contracts;
- P11 capacity classifications;
- P12 backend files or export dispositions;
- P13 normalized readings;
- P14 findings.

The P14 finding remains immutable evidence with source outcome `DRIFT`. P15 emits a separate authorization resolution whose downstream outcome is `DECLARED_DIVERGENCE`.

## Resolution view

The P15 artifact carries one resolution per P14 finding.

Without a declaration, the P14 outcome is preserved exactly.

With complete valid declarations for one `DRIFT` finding:

```text
sourceOutcome: DRIFT
outcome: DECLARED_DIVERGENCE
```

Other findings remain unchanged. One authorized divergence never suppresses another unaddressed `DRIFT`, `LOSSY`, `UNRESOLVED`, or `INVALID` finding.

## No aggregate override

P15 stores deterministic outcome counts only. There is no scalar fidelity score, weighted sum, or threshold that can erase a typed finding.

`DECLARED_DIVERGENCE` means the exact difference is explicitly authorized for the exact backend/evidence binding. It does not mean the backend is generally equivalent to canonical RefAs semantics.

## Public artifact

Persist `refas.divergence-authorization/v1` with:

- authorization and scope identity;
- exact P14/canonical/capacity/normalization/backend binding;
- exact semantic-authority binding;
- deterministic declarations;
- one resolution per P14 finding;
- deterministic outcome counts;
- canonical P15 policy;
- `authorizationDigest`.

`validateDivergenceAuthorizationBindings(...)` recreates the authorization from the current P14 evidence chain and exact semantic-authority set. Re-signed stale declarations do not become current evidence.

## P16 boundary

P15 does not authorize `articulated-ready`, `simulation-ready`, `control-ready`, or `runtime-ready` claims.

P16 may consume current P14/P15 evidence under claim-specific policy, but a declared divergence alone is never a readiness certificate.
