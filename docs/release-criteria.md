# RefAs 1.1 release criteria

These gates were introduced for 1.1.0 and remain mandatory for every 1.1.x release. 1.1.1 adds the spatial volume-closure and metric-authority gates in [`v1.1.1-release-readiness.md`](v1.1.1-release-readiness.md).

RefAs 1.1.0 is releasable only when the current exact head satisfies the gates below without relying on historical CI, stale evidence, or undocumented runtime behavior.

## Runtime and recovery

- Public schemas and executable validators agree.
- Checkpoints preserve exact artifact bytes and restore them without leaving the project root.
- A failed edit restores baseline artifact bytes, not only a state pointer.
- Typed findings name one owner, invalidated dependents, and a safe recovery checkpoint; unroutable blockers fail closed.
- Reference registration remains a placement/projection hypothesis rather than shape truth.
- Closed-child composition preserves original child binary payloads.
- Attachment, support, clearance, contact, articulation, fusion, and physical readiness evidence cannot be replaced by proximity guesses or historical booleans.
- Portable and independent render reports bind exact candidate bytes, renderer configuration, frames, and declared feature support.
- Host-session recovery may repair only the explicitly supported pristine initialization gap; existing event/operation history is never rewritten.

## Orientation and relational correctness

- A primary axis alone never implies resolved roll; a full local frame requires facing/lateral evidence or justified parent-frame inheritance.
- Terminal facing and twist remain explicit evidence, so candidates with the same projected endpoint or primary axis can still fail orientation comparison.
- Parent-child orientation propagates through declared relative frames rather than unrelated terminal Euler edits.
- `refas.relational-structure/v1` expresses domain-neutral ratios, alignments, ordering, plane chains, volume ratios, dependencies, and whole-system/local importance.
- `refas.semantic-authority-set/v1` preserves `observed`, `inferred`, `engineered`, `unknown`, and `forbidden` as distinct states.
- Positive hidden construction requires valid observed/inferred/engineered authority; unknown remains unresolved and only forbidden positively prohibits construction.
- Whole-system barrier/discrepancy evidence cannot be replaced by a lower visual score or unrelated local detail.

## Physical semantic identity and canonical construction

- Physical semantics remain assembly-owned construction contracts rather than a new top-level capability or truth owner.
- Assembly module, attachment interface, physical part, rigid link, virtual joint, mechanism, transmission, actuator, controller, and runtime endpoint remain distinct semantic identities.
- Backend order, array position, runtime index, device index, display name, or serializer position never substitutes for semantic identity.
- Canonical physical/interface transforms persist translation in meters plus normalized canonical quaternion `[x,y,z,w]`; semantic interface frames carry no implicit scale.
- Dynamics, collision, articulation, mechanism, transmission, actuation, control, and runtime state remain independently addressable and preserve their ownership/invalidation boundaries.
- Unknown mass, inertia, collision, limit, calibration, or runtime values remain unresolved rather than receiving fabricated defaults.
- Joint limits and actuator limits cannot silently substitute for each other.
- Controller tuning cannot mutate actuator/joint/source truth. Runtime binding cannot mutate actuator/controller/joint/module identity.
- `refas.physical-asset-bundle/v1` reproduces exact component and child-module closures and rejects stale component substitution.

## Representation closure

- Representation-capacity preflight declares supported, approximated, unsupported, and blocking semantics before export.
- Export adapters consume canonical physical semantics directly; backend-to-backend conversion is never canonical realization.
- Normalizers produce backend-independent semantic views without promoting backend data to canonical truth.
- Equivalent quaternion sign/component order, supported translation-unit conversion, and equivalent transform conventions normalize before comparison and do not create false drift.
- Cross-representation validation emits typed semantic outcomes: `EQUIVALENT`, `LOSSY`, `DRIFT`, `UNRESOLVED`, or `INVALID`.
- A representable altered property is `DRIFT` unless an exact valid declaration applies; unsupported meaning remains explicit rather than silently disappearing.

## Declared divergence authority

- Divergence authorization is backend-, semantic-subject-, and field-path-specific and binds exact canonical and normalized values.
- A declaration must bind an exact current engineered authority entry and the exact current P14 validation/finding it resolves.
- Intrinsic artifact validity is insufficient for downstream trust; live divergence-binding validation against the current P14 chain and current authority set is mandatory.
- Re-signed stale or substituted authority may remain internally canonical but must fail live use.
- Declared divergence changes the effective validation outcome only for the exact authorized drift and never mutates canonical construction state or unrelated P14 findings.

## Scoped physical readiness

- `articulated-ready`, `simulation-ready`, `control-ready`, and `runtime-ready` are opt-in claim levels with claim-specific semantic obligations.
- P16 evidence consumes exact current P10 physical-bundle state and exact current P14 representation validation; any relied-on P15 declaration must pass exact live binding validation.
- `EQUIVALENT` and live `DECLARED_DIVERGENCE` may satisfy required representation obligations. `LOSSY`, undeclared `DRIFT`, `UNRESOLVED`, and `INVALID` block the affected claim.
- Public generic certification cannot directly authorize live-gated physical claim evidence. Typed physical preflight must run before the generic certification evaluator.
- A generic selector that happens to match physical evidence does not bypass the live gate.
- Project-level certification routes cannot bypass typed physical preflight either.
- Higher-level control/runtime requirements do not back-propagate into unrelated lower claims. A control/runtime-only edit must not falsely invalidate an unchanged simulation-ready assessment.
- Physical readiness evidence does not mutate canonical construction, backend state, source truth, visual review, or P14 findings.

## Candidate, visual, and claim authority

- A candidate transaction binds the exact candidate, current checkpoint, evidence DAG, dependency proofs, decision nodes, and declared obligations.
- Transaction validity alone never authorizes a claim.
- Claim decisions reproduce from exact transaction, policy, and evidence bytes.
- For real sources, the relational certification authority floor remains mandatory and cannot be weakened by re-signing a custom policy.
- Actual GLB geometry produces required diagnostic views; registered comparison binds exact source/candidate/render/registration/hierarchy state.
- Independent visual review controls visual/source-fidelity certification; physical readiness does not override visible failure.
- Self-generated references, non-pass verdicts, unresolved blocking findings, stale comparison evidence, and unsupported appearance claims cannot satisfy source-fidelity claims.

## Integrated physical closure

- The P17 domain-neutral coupled parallel 2-DOF fixture composes at least two reusable modules through explicit fixed attachment interfaces while preserving distinct virtual-joint identity.
- The fixture includes rigid dynamics, collision proxies, mechanism topology, nonlinear transmission, two actuators, control profiles, and runtime bindings.
- Two independent backend projections normalize to equivalent semantics despite representation-specific quaternion sign/order, unit, or Euler convention differences.
- A deliberate representable mass change produces P14 `DRIFT` and blocks the affected physical claim before authorization.
- The final positive path reproduces `P14 DRIFT → exact live P15 DECLARED_DIVERGENCE → P16 runtime-ready → certification`.
- Substituted/stale P15 authority fails closed.
- Control/runtime-only edits preserve an unchanged lower simulation claim when its claim-scoped inputs remain current.
- Repeated fixture runs reproduce the same exact P15-bound integration closure evidence.

## Host integration authority

- Host Integration remains additive facade infrastructure and is not a prerequisite for reconstruction, physical semantics, visual closure, or certification.
- Durable events remain monotonic/replayable; pause and cancel remain distinct; cancellation reuses bounded-edit rollback authority.
- Review bundles cannot pass review, resolve findings, or certify. Artifact handoff cannot promote certification.
- External workers cannot own checkpoint state, event sequencing, operation finalization, candidate authority, physical truth, rollback, or certification.

## Reproducible repository validation

The exact release candidate must pass:

- `npm test`
- `npm run test:python`
- `npm run check`
- `npm run dogfood`
- `npm run dogfood:parameter-fit`
- `npm run dogfood:pbr`
- `npm run dogfood:hard-surface`
- `npm run dogfood:assembly`
- `node --test tests/integrated-physical-fixture.test.mjs`
- `npm run release:audit`

CI must pass on Node 20, 22, and 24. The protected Node 24 path runs the complete dogfood/release-audit chain.

## Distribution

- `npm pack --dry-run` contains only intended package metadata, the distributable skill, public schemas, and Python requirements; it contains no tests, examples, caches, transient project state, duplicate runtime, private references, or ZIP artifacts.
- The package includes both `refas` and `refas-host` CLI entry points.
- The package includes P01–P16 physical runtime modules, the public physical schemas, and all agent-facing physical contract leaves routed by `references/INDEX.md`.
- The release audit explicitly checks physical identity/dynamics/collision/articulation/mechanism/transmission/actuation/control/runtime, physical bundle, representation capacity/export/normalization/validation, divergence authorization, and physical readiness packaging.
- README/demo describe shipped 1.1.0 behavior and do not present future calibration or manufacturer truth as current capability.

## Compatibility

- New project state and whole-object certificates identify runtime 1.1.0.
- Public v1 project-state and certificate schemas continue accepting 1.0.0 through 1.0.4 artifacts; existing state does not require in-place migration solely because of the minor release.
- Existing public `.../v1` namespaces remain stable. Package minor version 1.1.0 does not rename them.
- Physical semantics are additive and opt-in by asset/claim. Ordinary visual reconstruction does not require runtime binding or a physical readiness claim.
- 1.1.0 does not promote inferred/engineered physical values into observed manufacturer truth or claim calibrated real-world physics without evidence.

## Release cut

The `v1.1.0` tag and GitHub Release must point to the exact `main` commit that passed post-merge RefAs CI. Existing release tags remain immutable. Any source change after verified CI requires fresh validation before release.

The release workflow is the publication authority for the Git tag/GitHub Release boundary: it runs only from a successful `main` push CI conclusion, reads the package version from that exact commit, and creates or verifies the immutable matching release identity. The release-prep PR itself must not fabricate a release result before that post-merge workflow succeeds.

Automated or bot-authored mutations are not release evidence by themselves; the resulting exact head must receive the normal PR CI and post-merge main CI required above.

## Semantic instruction graph

- `skills/refas/references/GRAPH.json` exactly covers every reference leaf and its hard prerequisite DAG is acyclic.
- Every semantic graph owner is a runtime capability or the control plane, and finding ownership matches runtime `FINDING_OWNERS`.
- Bare sibling Markdown routes are forbidden; every agent-facing dependency uses a canonical installed-skill path.
- Host Integration is reachable but no reconstruction/certification path depends on it unless the host boundary is explicitly used.
- Physical contract leaves are loaded progressively from the assembly/representation/readiness path; they do not become always-load prerequisites for ordinary visual work.
- Both installation-boundary and semantic-graph verifiers pass after copying only `skills/refas/` into an isolated directory.
