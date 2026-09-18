# RefAs 1.0.3 architecture

## Architecture contract

The distributable skill at `skills/refas/` is the product boundary and the single runtime authority. Tests, examples, package exports, and repository tools consume that runtime rather than implementing a competing reconstruction engine.

RefAs separates four concerns that must not collapse into one another:

1. **source truth** — what the reference and bound evidence directly support;
2. **construction state** — editable semantic geometry, pose, assembly, appearance, relations, and explicit inference/engineering choices owned by existing capabilities;
3. **realized artifacts** — exact GLB/render/report bytes produced from construction state;
4. **certification authority** — whether a declared claim is allowed for one exact candidate under one exact evidence policy.

## Capability graph

| Order | Capability | Authoritative output |
|---:|---|---|
| 1 | `source-intake` | immutable source identity and acquisition context |
| 2 | `visual-hierarchy` | whole-to-feature scopes with context-preserving ROIs |
| 3 | `visual-observation` | source-cited facts, interpretations, hypotheses, ambiguities |
| 4 | `spatial-hypotheses` | ranked camera/depth/orientation/hidden-form alternatives plus relation/authority hypotheses |
| 5 | `shape-reconstruction` | silhouette, mass, curvature, thickness and current whole-system relation realization |
| 6 | `surface-topology` | projection-anchored cells, seams, ribs, relief and shared boundaries |
| 7 | `assembly` | parent-local placement, attachment relations, articulation and realized structural evidence |
| 8 | `appearance` | evidence-supported color, roughness, metalness and finish |
| 9 | `rendering` | reproducible actual multiview images, camera records and renderer reports |
| 10 | `visual-critique` | typed finding ledger with evidence references |
| 11 | `whole-object-certification` | fail-closed claim authorization over one exact candidate/evidence chain |

Relational structure and semantic authority are cross-cutting Core contracts, not new capability owners. They are authored and revised inside the existing observation/spatial/shape ownership graph so they do not become a parallel runtime architecture.

Each finding is owned by exactly one capability. Reopening an owner invalidates that owner and its transitive dependents while preserving upstream evidence and unrelated scopes.

## Relational structure and inference authority

A coherent model is constrained by relationships as well as visible local features. RefAs 1.0.3 makes that system explicit:

```text
raw source / observations
        ↓
refas.relational-structure/v1
        ↓
refas.semantic-authority-set/v1
        ↓
current whole-system relation checks
        ↓
refas.whole-system-relational-barrier/v1
        ↓
shape realization / lower-scope hardening
        ↓
exact candidate
        ↓
refas.relational-discrepancy/v1
        ↓
fit eligibility + later certification
```

`refas.relational-structure/v1` is domain-neutral. It represents entities such as landmarks, axes, planes, volumes, regions, interfaces and systems, then connects them with distance ratios, alignments, ordering, plane chains and volume ratios. Relations may depend on other relations, but the dependency graph must be acyclic. Every relation declares whole-system/local scope and macro/identity/detail importance.

`refas.semantic-authority-set/v1` states what a proposition is allowed to mean:

```text
observed   = direct source fact
inferred   = evidence/prior/spec-supported hypothesis
engineered = explicit functional/downstream construction choice
unknown    = unresolved; not evidence of absence
forbidden  = source contradiction or hard prohibition
```

Only `observed` can assert source truth. `inferred` and `engineered` can license construction under valid typed basis without becoming source facts. `unknown` blocks positive closure but remains reopenable; only `forbidden` positively prohibits construction.

`refas.whole-system-relational-barrier/v1` binds the exact relation graph and authority set. Every macro/identity whole-system relation must have current passing evidence and construction-capable authority before lower-scope geometry may become trustworthy. Local details and numeric scores cannot satisfy this barrier.

## Candidate-bound relational discrepancy and fitting

After realization, `refas.relational-discrepancy/v1` embeds the exact relation graph, binds one exact candidate SHA-256, and re-evaluates the same whole-system macro/identity obligations against current evidence. Missing measurements remain unresolved.

Parameter fitting keeps objective, structural and relational eligibility separate:

```text
candidate eligible
  = objective eligibility
  AND structural eligibility
  AND relational eligibility
```

A relational failure is not encoded as a large loss, `Infinity`, or another weighted penalty. A lower silhouette/perceptual loss cannot buy permission to violate a required whole-system relation. Discrepancy metrics remain diagnostic/ranking evidence and cannot pass independent visual review.

## Project state and canonical edit boundary

Checkpoint IDs are content-derived. Artifact references are trustworthy only when exact bytes exist in `.refas/objects/` and match their SHA-256.

A GLB is normally a realized artifact, not the default editable source of semantic truth:

- shape edits update construction state and rebuild geometry;
- pose edits may update parent-local transforms while preserving mesh/accessor bytes;
- appearance edits update material/texture/vertex-color source state before rebaking/rebuilding;
- controlled finalization may fuse/weld/clean/optimize only after semantic construction closes and reopen provenance remains available.

## Assembly and structural realization

Assembly is explicit construction state rather than a proximity guess. Reusable contracts cover attachment semantics, logical fusion, surface anchors, one-owner follow, multi-anchor solving, bounded articulation, deterministic graph propagation, supported clearance, realized contact/support, and controlled physical fusion.

Missing/stale owner frames, infeasible multi-anchor solves, out-of-limit articulation, unresolved support, invalid contact or stale fusion provenance block the structural path instead of becoming score penalties.

## Rendering and visual evidence

RefAs requires actual realized geometry to produce review evidence.

- Portable rendering provides deterministic integrity views and bounded resource behavior.
- Registered comparison binds the exact source, candidate, hero render, camera/registration hypothesis, hierarchy and scopes.
- Independent PBR evidence binds renderer/backend/version, lighting, color pipeline, declared feature support and output frame digests.
- Independent visual review remains visual authority rather than a raster-success flag or metric threshold.

A renderer can prove it rendered exact bytes under a declared configuration; it cannot turn unsupported source identity, relational assumptions or material identity into truth.

## Candidate provenance transaction

Before whole-object certification, one exact candidate is sealed into `refas.candidate-transaction/v1`. The transaction binds candidate bytes, exact checkpoint content, evidence nodes, evidence byte digests, subject bindings, dependency proofs, decision nodes and declared obligations. The graph must be canonical, acyclic and connected to the candidate.

A valid transaction proves provenance consistency. It does **not** certify a claim.

## Relational certification closure

For real-source certification, `refas.certification-relational-evidence/v1` seals a second, explicit relational authority boundary before claim authorization. It binds:

- exact certification candidate SHA-256;
- exact `refas.relational-structure/v1` bytes + logical digest;
- exact `refas.semantic-authority-set/v1` bytes + logical digest;
- exact `refas.whole-system-relational-barrier/v1` bytes + logical digest;
- exact `refas.relational-discrepancy/v1` bytes + logical digest.

Validation replays the contracts from those exact bytes, verifies common source/whole scope, authority coverage, passing barrier/discrepancy state, common relation graph, and barrier checks reproduced from candidate-bound discrepancy evidence. The closure itself becomes candidate-bound transaction evidence.

This prevents omission, byte substitution, stale candidate replay, contradictory re-signing and policy downgrades from preserving the same relational claim authority. It does not promote inferred/engineered propositions to observed truth.

## Claim-driven certification

`refas.certification-policy/v1` declares claims and their required evidence roles/schemas, counts, finding sources, veto severities and required/optional status. The evaluator revalidates the candidate transaction and exact evidence bytes, then reproduces `refas.claim-certification-decision/v1`.

Real-source default policy contains both visual-source-fidelity obligations and the mandatory `whole-system-relational-fidelity` claim. The whole-object authority floor allows custom policies to add or strengthen requirements, but not remove, make optional, or weaken mandatory claims/evidence even after the custom policy receives a fresh valid digest.

## Whole-object certificate

The current authority chain is:

```text
source + exact candidate + checkpoint
             │
             ├── visual / projection / PBR / structural evidence
             │
             └── relation graph
                  → semantic authority
                  → whole-system barrier
                  → candidate relational discrepancy
                  → sealed relational closure
                             │
                             ▼
                 sealed candidate transaction
                             ↓
                    certification policy
                             ↓
                    reproduced decision
                             ↓
                 whole-object certificate
```

The certificate binds candidate/checkpoint/source identity plus transaction, policy, decision and relational-closure digest when required. Audit reproduces those bindings from current exact evidence rather than trusting a historical boolean.

Substitution, stale-checkpoint or stale-candidate replay, decision forgery, cross-claim contamination, relational evidence replacement, weaker policy re-signing, or post-certification divergence fail closed at the appropriate boundary.

## Runtime boundary and truth policy

The dependency-light JavaScript Core owns semantic contracts, deterministic geometry/GLB construction, structural validators, owner-local fitting, relational authority, candidate provenance, claim evaluation, checkpoint storage, recovery, audit and certification. Python with Pillow and NumPy provides portable evidence generation/software-rendering support. External renderers participate only through digest-bound report contracts.

Single-view depth, hidden topology, symmetry, absolute dimensions, full terminal orientation, internal manufacturer mechanisms and material composition are not facts unless evidence supports them. RefAs may preserve, infer, or engineer hidden construction under explicit authority without confusing that choice with source truth. Important non-guarantees are listed in `docs/known-limitations.md`.
