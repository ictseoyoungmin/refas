# RefAs 1.1.0 architecture

## Architecture contract

The distributable skill at `skills/refas/` is the product boundary and the single runtime authority. Tests, examples, package exports, repository tools, host facades, and release verification consume that runtime rather than implementing a competing reconstruction engine.

RefAs separates concerns that must not collapse into one another:

1. **source truth** — what the reference and bound evidence directly support;
2. **construction state** — editable semantic geometry, pose, assembly, relations, appearance, and explicit inference/engineering choices;
3. **physical construction semantics** — assembly-owned identities and physical contracts used only when required by the asset or claim;
4. **realized representations** — exact GLB/render/backend/report bytes projected from canonical construction state;
5. **certification authority** — whether a declared claim is allowed for one exact candidate under one exact evidence policy.

## Top-level capability graph remains stable

RefAs 1.1.0 does not create a parallel robotics capability hierarchy. The eleven top-level reconstruction owners remain:

| Order | Capability | Authoritative output |
|---:|---|---|
| 1 | `source-intake` | immutable source identity and acquisition context |
| 2 | `visual-hierarchy` | whole-to-feature scopes with context-preserving ROIs |
| 3 | `visual-observation` | source-cited facts, interpretations, hypotheses, ambiguities |
| 4 | `spatial-hypotheses` | ranked camera/depth/orientation/hidden-form alternatives plus relation/authority hypotheses |
| 5 | `shape-reconstruction` | silhouette, mass, curvature, thickness and current whole-system relation realization |
| 6 | `surface-topology` | projection-anchored cells, seams, ribs, relief and shared boundaries |
| 7 | `assembly` | parent-local placement, composition, physical construction semantics, articulation and realized structural evidence |
| 8 | `appearance` | evidence-supported color, roughness, metalness and finish |
| 9 | `rendering` | reproducible actual multiview images, camera records and renderer reports |
| 10 | `visual-critique` | typed finding ledger with evidence references |
| 11 | `whole-object-certification` | fail-closed claim authorization over one exact candidate/evidence chain |

Physical semantics use scoped subdomains inside `assembly`: composition, articulation, dynamics, collision, mechanism, transmission, actuation, control, and runtime. This granularity drives dependency and invalidation without creating new top-level truth owners.

## Source, relation, and authority boundary

Relational structure and semantic authority remain cross-cutting contracts. `refas.semantic-authority-set/v1` preserves five meanings:

```text
observed   = direct source fact
inferred   = evidence/prior/spec-supported hypothesis
engineered = explicit functional/downstream construction choice
unknown    = unresolved; not evidence of absence
forbidden  = source contradiction or hard prohibition
```

Only `observed` asserts source truth. `inferred` and `engineered` may license construction when their typed basis is valid. `unknown` blocks positive closure but remains reopenable. Downstream physical readiness cannot silently promote an inference or engineering choice into observation.

## Canonical physical identity

Physical identity is semantic and stable. These identities do not collapse because a backend happens to serialize them in the same order:

```text
assembly module
    != attachment interface
    != physical part
    != rigid link
    != virtual joint
    != mechanism
    != transmission
    != actuator
    != controller
    != runtime endpoint
```

Runtime indices, backend array order, display names, and serializer positions are configuration, not identity.

Canonical interface/physical transforms use:

```text
translation_m: [x, y, z]
rotation_quat_xyzw: [x, y, z, w]
```

Translation is in meters. Persisted orientation is a normalized canonical quaternion. Interface scale is not part of the semantic frame. Representation-specific Euler conventions, quaternion component order/sign, and unit encodings are normalized before semantic comparison.

## P01–P10: canonical physical construction

The physical construction chain is additive and evidence-bound:

```text
P01 semantic identity graph
  ├─ P02 rigid-body dynamics
  ├─ P03 collision semantics
  ├─ P04 articulation graph
  ├─ P05 mechanism graph
  ├─ P06 transmission model
  ├─ P07 actuation model
  ├─ P08 control profile
  └─ P09 runtime binding
          ↓
     P10 physical asset bundle
```

The P10 bundle is a digest-bound manifest over exact component closures. It preserves reusable module identity and child closure instead of becoming a monolithic second truth object.

Unknown physical values remain unknown. RefAs does not fill missing mass, inertia, limits, calibration, or collision properties merely because a downstream simulator prefers defaults.

## P11–P15: representation closure

Backend representations are projections from canonical construction state:

```text
canonical P10 construction
      ↓
P11 representation capacity
      ↓
P12 one-way export adapter
      ↓
backend artifact
      ↓
P13 normalized semantic view
      ↓
P14 canonical-versus-normalized validation
      ↓
optional P15 exact declared divergence
```

There is no canonical backend-to-backend conversion chain. A backend file never becomes authoritative construction state merely because another backend can import it.

P14 outcomes are semantic:

- `EQUIVALENT` — required meaning is preserved;
- `LOSSY` — a declared semantic cannot be preserved by the representation;
- `DRIFT` — a representable semantic differs without authorization;
- `UNRESOLVED` — canonical authority is insufficient for a positive comparison;
- `INVALID` — identity, topology, references, or another hard invariant is broken.

A valid P15 authorization can resolve only the exact current drift it binds. It stores exact backend, semantic subject/path, canonical value, normalized override, reason, and engineered authority entry. Intrinsic artifact integrity is not enough for downstream trust: live binding validation against the current P14 chain and current authority set is mandatory.

## P16: physical readiness as typed evidence

Physical readiness is opt-in and claim-specific:

```text
articulated-ready
simulation-ready
control-ready
runtime-ready
```

Each claim derives only the obligations applicable to the selected semantic scope. Higher claim levels add downstream obligations; they do not retroactively become prerequisites for lower unrelated claims.

The trust boundary is deliberate:

```text
current P10 bundle
 + current P14 representation findings
 + current live P15 divergence authority when used
          ↓
refas.physical-claim-evidence/v1
          ↓
typed live physical preflight
          ↓
generic certification evaluator
```

The public generic certification route cannot directly authorize live-gated P16 evidence. A stale/re-signed P16 artifact may be internally canonical yet still fail because its current P10–P15 bindings no longer reproduce.

## P17: integrated physical closure

The integrated fixture exercises the full physical stack on a reusable coupled parallel 2-DOF construction. Two independent backend projections encode equivalent transforms differently; normalization proves equivalent quaternion sign/order, translation units, and Euler convention/order do not create false drift.

The final positive path deliberately includes one representable mass drift:

```text
P14 DRIFT
  → exact live P15 DECLARED_DIVERGENCE
  → P16 runtime-ready
  → certification
```

Substituted authority fails. Control/runtime-only edits remain downstream-scoped. Repeated runs reproduce deterministic closure evidence. The fixture envelope `refas.p17-integration-evidence/v1` is integration-test evidence only, not a public canonical construction schema.

## Project state and recovery

Checkpoint IDs are content-derived. Artifact references are trustworthy only when exact bytes exist in the object store and match their SHA-256.

A GLB or backend export is normally a realized artifact, not the default editable source of semantic truth. Reopening an owner invalidates the dependent closure that consumes it while preserving upstream evidence and unrelated scopes. Failed bounded edits restore the baseline bytes, not merely a pointer.

Physical invalidation is similarly scoped: an actuator-capability edit can invalidate dependent control/runtime claims without invalidating unrelated visual shape evidence; a runtime-index edit does not mutate actuator/joint/module identity; an upstream joint-frame or interface edit may invalidate dependent articulation, mechanism, collision, representation, and readiness evidence.

## Rendering and visual authority remain independent

Physical readiness does not weaken the visual reconstruction path. Actual geometry must still produce current review evidence. Registered comparison, independent PBR evidence, and visual review retain their own authority for visual/source-fidelity claims.

A physically well-typed asset may still be visually wrong. A visually excellent asset may still lack the evidence required for a physical-readiness claim.

## Candidate provenance and certification

`refas.candidate-transaction/v1` seals exact candidate bytes, checkpoint content, evidence nodes, dependencies, decisions, and declared obligations. A valid transaction proves provenance consistency, not claim validity.

`refas.certification-policy/v1` selects required claims and evidence. For real-source visual certification, the relational authority floor remains mandatory. For P16 physical claims, typed live physical preflight is mandatory before generic claim evaluation.

The result is one certification architecture with multiple evidence types, not multiple competing certification engines.

## Runtime and host boundary

The dependency-light JavaScript Core owns semantic contracts, geometry/GLB construction, physical semantics, representation normalization/validation, fitting, candidate provenance, checkpoints, recovery, audit, and certification. Python with Pillow and NumPy provides portable evidence-generation/software-rendering support. External renderers and workers participate only through exact digest-bound contracts.

Host Integration remains a conditional facade. It can expose sessions, events, operations, review bundles, handoff, and worker framing, but it cannot own checkpoint state, rollback, candidate authority, physical truth, or certification.

Important non-guarantees are documented in `docs/known-limitations.md`; the exact release gates are documented in `docs/release-criteria.md` and `docs/v1.1.0-release-readiness.md`.
