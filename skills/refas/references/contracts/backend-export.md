# Backend export adapters

Load this contract after `references/contracts/representation-capacity.md` when an exportable P11 profile must be realized into a concrete backend representation.

## Ownership boundary

P12 owns **one-way canonical-to-backend realization**. It does not own canonical physical meaning and does not decide whether realized backend semantics are equivalent to canonical semantics.

Keep these identities separate:

```text
canonical P10 bundle
  != canonical export view
  != P11 capacity profile
  != P12 backend export manifest
  != backend artifact bytes
  != P13 normalized backend view
  != P14 comparison finding
```

The governing flow is:

```text
canonical RefAs construction state
        +--> backend A adapter --> backend A artifacts
        +--> backend B adapter --> backend B artifacts
        +--> backend C adapter --> backend C artifacts
```

Do not use:

```text
backend A -> backend B -> backend C
```

as a canonical realization chain. A backend artifact is never promoted into RefAs construction truth merely because another exporter can consume it.

## Required preflight

Before invoking an adapter:

1. validate the exact current P10 physical asset bundle and its live P01-P09 inputs;
2. validate the exact current P11 representation-capacity profile;
3. require the P11 profile backend to match the adapter backend;
4. require `exportable == true` through the live P11 binding check.

A blocked or stale P11 profile must stop **before adapter code runs**.

## Canonical export view

Build `refas.canonical-export-view/v1` directly from current canonical construction state.

The view contains:

- exact P10 bundle/root closure binding;
- scoped P01 identity projection for the root module;
- exact live P02-P09 component payloads keyed by stable component identity;
- explicit digest-bound canonical dependencies that are referenced by a component but not embedded in that component payload;
- a deterministic `canonicalViewDigest`.

The view is immutable adapter input. It contains no previous backend artifact, backend parse result, normalized backend view, or backend-derived replacement value.

### Canonical dependency closure

Do not copy an opaque validation context into the export view. Only promote dependencies that a canonical component explicitly references and whose live payload is required to realize the declared semantics.

For P04 articulation, the articulation graph intentionally keeps typed joints authoritative by digest reference. Therefore its canonical export component must include:

```text
articulation component
  +-- ATTACHMENT_SEMANTICS dependency
  +-- ARTICULATED_JOINT dependency for every referenced virtual joint
```

The attachment dependency must reproduce `attachmentSemanticsRef`. Every typed-joint dependency must validate against that exact attachment contract and match the joint reference ID/schema/digest in the articulation graph. Extra validation-context material is not exported by implication.

This closes an important distinction:

```text
P04 graph joint reference
    !=
full typed-joint semantic payload
```

For example, `articulation.joint-limit` cannot be realized from a joint digest alone. The exact typed-joint dependency carries the authoritative limit, axis convention, and owner/subject joint frames into P12 without making validation context itself canonical state.

## Adapter surface

A P12 adapter declares:

```text
id
backend
version
project({ canonicalView, capacityProfile })
```

The runtime supplies only the immutable canonical export view and the exact immutable P11 profile.

Adapter output is intentionally narrow:

```text
artifacts[]
  path
  mediaType
  content bytes

bindings[]
  obligationId
  targets[]
    path
    locator
```

The adapter does **not** provide trusted SHA-256 digests. RefAs hashes emitted bytes after the adapter returns.

Backend locators may describe backend-specific node paths, XML/JSON locations, indices, names, or other realized addresses. They are locator metadata only. They never replace P01-P09 semantic IDs.

## P11 obligation disposition

Every P11 obligation receives exactly one P12 disposition.

```text
P11 SUPPORTED
    -> P12 EMITTED_EXACT

P11 APPROXIMATED
    -> P12 EMITTED_APPROXIMATION
       with the exact P11 strategy/reason/retained/lost semantics

P11 UNSUPPORTED
    -> P12 OMITTED_UNSUPPORTED
       with the exact P11 reason and no artifact target
```

A supported or approximated obligation must have at least one emitted backend target. An unsupported obligation must not be silently emitted under an untracked interpretation and must not disappear from the export manifest.

These are **export dispositions**, not equivalence verdicts. `EMITTED_EXACT` means the adapter emitted the field under a P11 exact-capacity declaration; P13/P14 still determine whether the realized representation actually normalizes and compares correctly.

## Artifact integrity

Persist `refas.backend-export/v1` with:

- export identity;
- adapter identity/backend/version;
- exact canonical-view binding;
- exact P11 capacity binding;
- RefAs-computed artifact path/media type/SHA-256/size;
- complete obligation dispositions;
- deterministic export digest.

Reject absolute paths, `..` traversal, backslashes, empty path segments, duplicate artifact paths, and disposition targets that reference missing artifacts.

When artifact bytes are available again, re-hash them and require the artifact set to reproduce the manifest exactly.

## Reference semantic JSON adapter

P12 includes a deterministic `refas-semantic-json` reference adapter. It serializes the canonical export view directly and therefore requires a P11 profile that marks every obligation exactly supported.

Its purpose is to exercise the one-way adapter contract and provide a lossless reference representation for later normalization work. It is not canonical truth merely because it contains canonical data.

## Fail closed

Reject export when:

- P10 or P11 live bindings are stale;
- P11 is blocked;
- adapter backend and P11 backend differ;
- adapter input/output violates the narrow contract;
- a canonical component dependency is missing, stale, unreferenced, or digest-mismatched;
- a supported/approximated obligation lacks an emitted target;
- an unsupported obligation is emitted;
- approximation metadata differs from P11;
- artifact paths escape the export root;
- adapter bindings reference unknown artifacts or obligations;
- artifact bytes do not reproduce the manifest hashes;
- canonical/capacity/export digests do not reproduce.

## Downstream boundary

P12 does not parse backend files back into semantic views. P13 owns normalization.

P12 does not decide `EQUIVALENT`, `LOSSY`, `DRIFT`, `UNRESOLVED`, or `INVALID`. P14 owns cross-representation validation.

P12 does not authorize backend-specific divergence. P15 owns declared divergence.

P12 does not authorize articulated/simulation/control/runtime readiness. P16 owns physical claims.
