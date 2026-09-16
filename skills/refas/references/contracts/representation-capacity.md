# Representation capacity

Load this contract when a closed `refas.physical-asset-bundle/v1` must be evaluated for projection into a concrete backend representation.

## Ownership boundary

P11 reuses and strengthens `refas.representation-capacity/v1`.

The profile is **backend preflight**, not another physical truth object. Canonical physical meaning remains in P01–P10. P11 does not export files, normalize backend outputs, authorize divergence, or certify readiness.

Keep these identities separate:

```text
canonical physical bundle
  != representation-capacity profile
  != exported backend artifact
  != normalized backend view
  != cross-representation finding
  != physical claim
```

## Exact P10 binding

A capacity profile binds the exact P10 bundle digest, root module closure, root module identity, and scoped P01 identity-projection digest. If that bundle changes, the profile is stale and must be rebuilt.

Do not key semantic obligations by backend array positions, node indices, motor indices, or traversal order.

## Complete obligation inventory

Do not hand-author a partial list of backend obligations. Use the runtime derivation from the current P10 bundle and its live component payloads.

Each obligation has a canonical ID derived from:

- exact identity/component source digest,
- canonical semantic field path,
- stable semantic subject IDs.

This makes omission detectable. An unsupported semantic field cannot disappear merely because a backend lacks a matching field.

## Classification

Every derived obligation must appear in exactly one classification:

- `supported` — the backend can represent the obligation without declared semantic loss;
- `approximated` — the backend can carry a declared approximation;
- `unsupported` — the backend cannot represent the obligation.

Approximation is not exact support. Every approximation must declare:

- strategy,
- reason,
- retained semantics,
- lost semantics.

The same semantic may not be declared both retained and lost.

Unsupported obligations remain explicit even when they are not blockers.

## Blockers and exportability

A blocker is a separate decision stating that one or more approximated/unsupported obligations make export unacceptable for this target use. A blocker may not target an exactly supported obligation.

`exportable` is derived only from blocker presence:

```text
blockers.length == 0  -> exportable
blockers.length > 0   -> not exportable
```

This flag authorizes only progression to P12 export work. It does not authorize physical claims or whole-object closure.

## Canonical orientation and coordinates

Rigid orientation remains quaternion-canonical. Backend Euler/RPY forms, if needed, are later P12 projections and must not become P11 truth.

Likewise, revolute/prismatic generalized coordinates, transmission coordinates, controller commands, and runtime calibration remain the semantics owned by P04–P09. P11 only states backend representational capacity for those semantics.

## Fail closed

Reject the profile when:

- the P10 bundle binding is stale;
- the derived obligation inventory is incomplete or stale;
- an obligation is unclassified or multiply classified;
- an approximation lacks explicit retained/lost semantics;
- a blocker references an unknown or exactly supported obligation;
- backend ordering or indices are used as semantic identity;
- the profile digest does not reproduce.

## Downstream boundary

P12 consumes only an exportable P11 profile and performs canonical-to-backend projection. P13 normalizes realized backend semantics, P14 compares representations, P15 records intentional divergence, and P16 owns physical readiness claims. None of those authorities belong to P11.
