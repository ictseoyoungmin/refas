# RefAs 1.0 architecture

## Architecture contract

The distributable skill at `skills/refas/` is the product boundary and the single runtime authority. Tests, examples, package exports, and repository tools consume that runtime rather than implementing a competing reconstruction engine.

RefAs separates four concerns that are easy to accidentally collapse:

1. **source truth** — what the reference and bound evidence actually support;
2. **construction state** — editable semantic geometry, pose, assembly, and appearance owned by capabilities;
3. **realized artifacts** — exact GLB/render/report bytes produced from construction state;
4. **certification authority** — whether a declared claim is allowed for one exact candidate under one exact evidence policy.

## Capability graph

| Order | Capability | Authoritative output |
|---:|---|---|
| 1 | `source-intake` | immutable source identity and acquisition context |
| 2 | `visual-hierarchy` | whole-to-feature scopes with context-preserving ROIs |
| 3 | `visual-observation` | source-cited facts, interpretations, hypotheses, ambiguities |
| 4 | `spatial-hypotheses` | ranked camera, depth, orientation, and hidden-form alternatives |
| 5 | `shape-reconstruction` | silhouette, mass, curvature, thickness, coarse negative space |
| 6 | `surface-topology` | projection-anchored cells, seams, ribs, relief, and shared boundaries |
| 7 | `assembly` | parent-local placement, attachment relations, articulation and realized structural evidence |
| 8 | `appearance` | evidence-supported color, roughness, metalness, and finish |
| 9 | `rendering` | reproducible actual multiview images, camera records and renderer reports |
| 10 | `visual-critique` | typed finding ledger with evidence references |
| 11 | `whole-object-certification` | fail-closed claim authorization and certificate over one exact candidate/evidence chain |

Each finding is owned by exactly one capability. Reopening an owner invalidates that owner and its transitive dependents while preserving upstream evidence and unrelated scopes.

## Project state

```text
project/
├── source/                 primary images and manifests
├── evidence/               deterministic observation aids
├── model/                  hierarchy, observations, hypotheses, semantic construction state
├── assets/                 realized GLB assets and closed children
├── renders/                actual frames and review boards
├── reviews/                findings, comparison reports, policies and evidence artifacts
└── .refas/
    ├── project.json        active head and recovery state
    ├── checkpoints/        immutable semantic checkpoint records
    ├── objects/            content-addressed artifact bytes
    ├── decisions/          edit and failure-routing decisions
    └── certification.json  current whole-object certificate
```

Checkpoint IDs are content-derived. Timestamps are metadata and do not decide identity. An artifact reference is recoverable only when its exact bytes exist in `.refas/objects/` and match the recorded SHA-256.

## Canonical edit boundary

A GLB is normally a realized artifact, not the default editable source of semantic truth.

- Shape edits update construction state and rebuild geometry.
- Pose edits may update parent-local node or joint transforms while preserving mesh/accessor bytes.
- Appearance edits update material/texture/vertex-color source state before rebaking or rebuilding.
- Finalization may perform controlled fusion, welding, internal-face cleanup, and optimization only after semantic construction is closed and reopen provenance remains available.

`refas.canonical-edit-intent/v1` records the owner, hierarchy scope, edit class, canonical bindings, realization operations, and mutation boundary. See `docs/canonical-edit-boundary.md`.

## Assembly and structural realization

Assembly is explicit construction state rather than a proximity guess.

The reusable structural graph is composed from contracts with separate responsibilities:

- `refas.attachment-semantics/v1` declares ownership modes such as fused, rigid-follow, surface-offset, multi-anchor, articulated, supported-clearance, or free;
- logical fusion groups preserve semantic reopenability before controlled physical fusion;
- surface anchors retain semantic patch identity and bounded rebind rules instead of durable world-space XYZ guesses;
- one-owner follow and multi-anchor solving produce rigid target frames without hidden scale/deformation;
- articulated joints provide bounded owner-local pivots;
- propagation executes the validated attachment graph in deterministic topological order;
- supported-clearance and realized-contact reports prove support, penetration, clearance, and contact only after realization;
- physical-fusion reports bind controlled finalization back to semantic source state.

A missing or stale owner frame, infeasible multi-anchor solve, out-of-limit articulation, unresolved support state, or invalid realized contact blocks the structural path rather than becoming a score penalty.

Detailed contracts live in `docs/attachment-semantics.md`, `docs/surface-anchor-frames.md`, `docs/attachment-follow.md`, `docs/multi-anchor-solver.md`, `docs/articulation-clearance.md`, `docs/attachment-propagation.md`, `docs/realized-contact-support.md`, and `docs/physical-fusion.md`.

## Fitting and discrepancy

High-impact fitting remains owner-local:

- camera candidates belong to `spatial-hypotheses`;
- parent-local pose variables belong to `assembly`;
- geometry parameters belong to `shape-reconstruction`;
- appearance variables belong to `appearance`;
- illumination/background variables belong to `rendering`.

The fitters retain every candidate trial, bind exact candidate and render bytes, and separate structural eligibility from numeric objective loss. A structurally invalid candidate is ineligible rather than merely penalized. Metrics and discrepancy maps may rank or localize candidates but cannot choose a repair owner or pass a visual gate.

The macro coordinator may alternate owner-local fitters and record exact digests, but it has no independent gate or finding authority.

See `docs/parameter-fitting.md`, `docs/constraint-aware-fitting.md`, and `docs/fitting-and-discrepancy.md`.

## Rendering and visual evidence

RefAs requires actual realized geometry to produce review evidence.

- Portable rendering provides deterministic integrity views and bounded resource behavior.
- Registered comparison binds the exact source, candidate, hero render, camera/registration hypothesis, hierarchy and compared scopes.
- Independent PBR evidence binds renderer/backend/version, lighting, color pipeline, declared material support and output frame digests.
- Visual review remains a human/agent visual authority rather than a raster-success flag or metric threshold.

A renderer can prove that it rendered exact bytes under a declared configuration; it cannot turn unsupported source or material identity into truth.

## Bounded edit transactions and recovery

A bounded edit contains one baseline checkpoint, one owner capability, one hierarchy scope, one testable intent, protected metrics, and exactly one direct candidate checkpoint.

Possible outcomes include keeping the candidate, rolling back exact baseline bytes, reopening the responsible owner, requesting more review, or allowing local closure when declared gates pass.

Rejected candidates remain in checkpoint history as evidence but do not become trusted head state merely because they scored well.

## Candidate provenance transaction

Before whole-object certification, one exact candidate may be sealed into `refas.candidate-transaction/v1`.

The transaction binds:

- candidate SHA-256 and byte size;
- the exact checkpoint content digest;
- evidence nodes with semantic roles and optional public schemas;
- exact evidence byte digests;
- candidate-subject bindings proved from artifact bytes;
- evidence dependency edges proved by content-addressed references inside the participating artifacts;
- decision nodes and declared evidence obligations.

The evidence graph must be canonical and acyclic. Decision evidence must remain reachable from the candidate provenance chain. Changing candidate bytes, checkpoint content, evidence bytes, dependency proof, subject binding, or obligation changes the transaction identity or makes validation fail.

A valid candidate transaction proves provenance consistency. It does **not** certify a claim. See `docs/candidate-transactions.md`.

## Claim-driven certification

`refas.certification-policy/v1` declares which claims exist and what each claim requires.

For each claim, policy may require:

- specific evidence roles and public schemas;
- minimum evidence counts;
- registered-comparison evidence for source classes that require it;
- finding sources and JSON-pointer locations;
- veto severities;
- required/optional claim status.

The evaluator first revalidates the sealed candidate transaction and exact evidence bytes, then reproduces a `refas.claim-certification-decision/v1`. Transaction validity alone is never authorization.

Whole-object certification additionally preserves a mandatory authority floor. A checkpoint-bound custom policy may add claims or make requirements stricter, but a freshly re-digested policy cannot delete mandatory evidence obligations, finding sources, required status, veto severities, or source-specific registered-comparison requirements.

See `docs/claim-certification.md`.

## Whole-object certificate

A whole-object certificate binds the active head and the exact authority chain that justified it.

Conceptually:

```text
exact source + candidate + checkpoint
              ↓
sealed candidate transaction
              ↓
certification policy
              ↓
reproduced per-claim decision
              ↓
required visual / comparison / PBR / structural gates
              ↓
whole-object certificate
```

The certificate binds candidate/checkpoint/source identity plus transaction, policy and decision digests and the authorized claim set. Audit reproduces those bindings from current evidence rather than trusting a historical boolean.

Substitution, stale-checkpoint replay, decision forgery, cross-claim evidence reuse, weaker policy re-signing, or post-certification divergence fail closed at the appropriate provenance, policy, decision, checkpoint or audit boundary. See `docs/adversarial-certification.md`.

## Runtime boundary

The dependency-light JavaScript core owns semantic contracts, deterministic geometry/GLB construction, attachment and structural validators, owner-local fitting, candidate provenance, claim evaluation, checkpoint storage, recovery, audit and certification.

Python with Pillow and NumPy provides portable evidence generation and software rendering support. External renderers may participate only through digest-bound report contracts. Observation aids and renderer outputs never replace inspection of the raw reference.

## Truth and uncertainty

Single-view depth, hidden topology, symmetry, physical dimensions, full terminal orientation, internal mechanisms and material identity are not facts unless evidence supports them.

RefAs stores plausible alternatives and falsifiers instead of collapsing uncertainty into a convenient mesh. Metrics summarize evidence but do not own truth, repair routing or certification.

Important non-guarantees for the first stable release are listed in `docs/known-limitations.md`.
