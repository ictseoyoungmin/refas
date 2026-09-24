# Representation normalizer

Load this contract after `references/contracts/backend-export.md` when realized backend bytes must be read into a backend-independent semantic view for later comparison.

## Ownership boundary

P13 owns **representation normalization**, not physical truth and not cross-representation judgment.

Keep these identities separate:

```text
canonical construction state
  != P12 backend export manifest
  != backend artifact bytes
  != P13 normalized representation
  != P14 cross-representation finding
  != P15 declared divergence
  != P16 physical claim
```

A normalized value describes what a verified backend representation says after backend-specific syntax, ordering, units, and orientation encodings are removed. It never overwrites P01–P10 construction state.

## Input boundary

A normalizer receives only:

- the exact intrinsic `refas.backend-export/v1` manifest;
- artifact bytes whose SHA-256/size/path reproduce that P12 manifest;
- exact P11 obligation metadata needed to preserve semantic path and stable subject identity.

Do **not** provide the normalizer a live P10 bundle, P01 identity graph, or P02–P09 canonical component payloads. Those values would let an implementation copy canonical truth instead of reading the backend representation.

P13 verifies before normalizer code runs:

- the P12 manifest is intrinsically valid;
- the exact P11 profile ID/backend/digest matches the P12 capacity binding;
- P11 obligation IDs exactly match P12 disposition IDs;
- artifact bytes reproduce the P12 artifact descriptors;
- the selected normalizer backend matches the P12 backend.

## Normalizer implementation identity

A persisted normalizer descriptor contains:

```text
id
backend
version
implementationDigest
```

`implementationDigest` is registration provenance for the exact normalizer implementation selected by the host/registry. It is not computed from normalizer output and it does not replace replay verification.

When a persisted P13 record is validated against current backend bytes, the supplied runtime normalizer must reproduce the exact persisted descriptor. A different implementation digest fails before its readings are trusted.

The digest alone is not treated as proof of behavior. Even code that presents the same ID/version/digest must replay the verified bytes to the same normalized representation.

## Semantic identity

Backend indices, array order, node order, traversal order, object names, and runtime addresses are not semantic identity.

Each normalized entry inherits from P11:

```text
obligationId
semanticPath
subjectIds
```

A backend-specific normalizer may return only an `obligationId`, normalized value, and one or more P12 source locators. P13 reattaches the P11 semantic path and subject IDs itself.

This prevents a parser from silently replacing a stable RefAs actuator/link/joint/interface identity with `body[3]`, `node 17`, or another backend ordering artifact.

## Normalized representation

Persist `refas.normalized-representation/v1` with:

- normalization identity;
- normalizer identity/backend/version plus `implementationDigest`;
- exact P12 export/canonical-view/P11-capacity/artifact-set binding;
- one entry for every P11 obligation;
- a backend-independent `semanticDigest`;
- a provenance-complete `normalizationDigest`.

### Entry states

For emitted P12 obligations:

```text
EMITTED_EXACT or EMITTED_APPROXIMATION
    -> NORMALIZED
       value = backend reading in normalized semantic form
       sources = exact P12 artifact/locator provenance
```

For unsupported P12 obligations:

```text
OMITTED_UNSUPPORTED
    -> OMITTED_UNSUPPORTED
       value = null
       sources = []
       reason = exact P12 omission reason
```

A normalizer may not fabricate a value for an unsupported omission. An emitted obligation must produce exactly one reading.

`exportDisposition` is preserved as provenance. It is not a P13 equivalence verdict.

## Replay proof for persisted readings

Intrinsic digest reproduction is necessary but not sufficient evidence that a persisted normalized value came from the bound backend artifacts.

`validateNormalizedRepresentationBindings(...)` is therefore asynchronous and requires the exact runtime normalizer in addition to the P11 profile, P12 manifest, and artifact bytes.

Validation proceeds as:

```text
persisted P13 intrinsic validation
  -> exact P11/P12/source binding validation
  -> exact normalizer implementation descriptor match
  -> verify P12 artifact bytes
  -> rerun normalizer over those verified bytes
  -> rebuild canonical P13 entries and digests
  -> exact persisted-vs-replayed record comparison
```

A record whose `entry.value`, `semanticDigest`, and `normalizationDigest` were all recomputed by an editor still fails if the verified backend bytes do not replay to that exact value.

This replay requirement is the evidence bridge between P12 artifact integrity and P13 semantic readings. P14 may consume a persisted P13 record as backend evidence only after this binding validation succeeds.

## Two digests

`semanticDigest` covers only backend-independent normalized semantic entries. It intentionally excludes export IDs, artifact hashes, locators, normalizer identity, and P12 exact-vs-approximation provenance.

Therefore two independently realized backends may have different P12/P13 provenance digests while sharing the same `semanticDigest` when their normalized semantics are equal.

`normalizationDigest` seals the complete P13 record including source binding and provenance. Neither digest replaces replay proof against verified backend bytes.

## Rigid transform normalization

Normalized rigid transforms use:

```text
translation_m: [x, y, z]
rotation_quat_xyzw: [x, y, z, w]
```

Use `canonicalizeBackendRigidTransform(...)` for backend transform encodings. It supports:

- translation units: `m`, `cm`, `mm`;
- quaternion order: `XYZW`, `WXYZ`;
- Euler orders: `XYZ`, `XZY`, `YXZ`, `YZX`, `ZXY`, `ZYX`;
- Euler angle units: `rad`, `deg`;
- Euler conventions: `INTRINSIC`, `EXTRINSIC`.

Equivalent quaternion signs normalize to one canonical sign. Equivalent intrinsic/extrinsic Euler encodings normalize to one quaternion. Small floating differences introduced only by unit/orientation conversion are stabilized before the final canonical quaternion normalization.

A backend adapter/normalizer must explicitly declare its Euler order/convention. P13 does not guess.

## Backend ordering

The P13 entry inventory is sorted by stable P11 obligation ID, not backend order.

Backend parsers must reconstruct any semantically meaningful order from explicit backend semantics. For example, P06 coordinate order is semantic state and must be preserved; arbitrary JSON/XML/scene-node ordering is not.

Shuffling non-semantic backend record order must not change `semanticDigest`.

## Source locator binding

Each normalized reading cites one or more `{artifactId, locator}` pairs.

Every cited pair must be one of the exact targets declared by that obligation's P12 disposition. A normalizer may not cite an unrelated artifact or locator merely because the bytes are available in the same export.

Locators remain provenance metadata only and are excluded from `semanticDigest`.

## Reference semantic JSON normalizer

P13 includes `createSemanticJsonRepresentationNormalizer()` for the P12 `refas-semantic-json` backend.

It carries a deterministic built-in implementation registration digest and parses the realized semantic JSON bytes to derive normalized values for the P11 semantic paths currently emitted by P01–P09, including:

- identities, relations, interfaces, compatibility families, and frames;
- rigid-body dynamics;
- collision frame/geometry/filter semantics;
- articulation topology, frames, reference configuration, and typed joint limits;
- mechanism topology;
- transmission spaces/mappings and external implementation references;
- actuation capability;
- control profile semantics;
- runtime endpoint, locator, index, calibration, and transport-delay semantics.

The reference normalizer reads those values from the **backend artifact bytes**, including P12-carried dependency payloads. It does not consult current canonical construction objects.

## Fail closed

Reject normalization or persisted binding validation when:

- P11/P12 profile binding differs;
- P12 artifact bytes fail hash/size/path reproduction;
- normalizer backend differs from P12 backend;
- the runtime normalizer descriptor or `implementationDigest` differs from the persisted P13 descriptor;
- verified backend bytes replay to entries or digests different from the persisted P13 record;
- a normalizer returns an unknown or duplicate obligation ID;
- an emitted obligation lacks a reading;
- an unsupported omission receives a fabricated reading;
- a reading cites an artifact/locator outside that obligation's P12 targets;
- normalized transforms contain invalid/non-finite values or undeclared rotation conventions;
- persisted semantic or normalization digests do not reproduce.

## Downstream boundary

P13 does not compare normalized values with canonical construction values and does not emit:

- `EQUIVALENT`
- `LOSSY`
- `DRIFT`
- `DECLARED_DIVERGENCE`
- `UNRESOLVED`
- `INVALID`

Those outcomes begin in P14/P15. P13 also does not authorize articulated-, simulation-, control-, or runtime-ready claims; P16 remains downstream.
