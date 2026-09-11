# RefAs 1.0.3 release criteria

RefAs 1.0.3 is releasable only when the current exact head satisfies the gates below without relying on historical CI, stale evidence, or undocumented runtime behavior.

## Runtime and recovery

- Public schemas and executable validators agree.
- Checkpoints preserve exact artifact bytes and restore them without leaving the project root.
- A failed edit restores the baseline artifact, not only a state pointer.
- Typed findings name one owner, invalidated dependents, and a safe recovery checkpoint; unroutable blockers fail closed.
- Reference registration remains a placement/projection hypothesis rather than shape truth.
- Closed-child composition preserves original child binary payloads.
- Attachment, support, clearance, contact, articulation, and fusion evidence cannot be replaced by proximity guesses.
- Portable and independent render reports bind exact candidate bytes, renderer configuration, frames, and declared feature support.

## Orientation correctness

- A primary axis alone never implies resolved roll; a full local frame requires facing/lateral evidence or an explicit justified parent-frame inheritance policy.
- Terminal facing and twist remain explicit evidence, so candidates with the same projected endpoint or primary axis can still fail orientation comparison.
- Parent-child orientation propagates through declared relative frames rather than independent terminal Euler edits.
- A terminal orientation finding reopens the smallest evidence-cited responsible chain and may evaluate coordinated or mixed-sign parent/child parent-local corrections.
- Orientation pose fitting preserves mesh/accessor bytes and structural eligibility remains a hard candidate-admission barrier.
- `orientation-loss` is derived only from a validated orientation discrepancy bound to the exact candidate SHA-256, source digest, and orientation-evidence digest.

## Relational structure and inference authority

- `refas.relational-structure/v1` expresses domain-neutral ratios, alignments, ordering, plane chains, volume ratios, relation dependencies, and explicit whole-system/local importance without asset-specific vocabulary in Core.
- Validators reject dangling entity/relation references, unsupported relation kinds, duplicate identity, invalid thresholds, and cyclic relation dependencies.
- `refas.semantic-authority-set/v1` preserves `observed`, `inferred`, `engineered`, `unknown`, and `forbidden` as distinct authorities. `UNKNOWN != FORBIDDEN`, `UNOBSERVED != FORBIDDEN`, `ENGINEERED != OBSERVED`, and `INFERRED != OBSERVED` remain enforced by executable validation.
- Positive hidden construction requires valid observed/inferred/engineered authority; unknown remains unresolved and only forbidden positively prohibits construction.
- Whole-system authority coverage binds the exact relation graph and cannot be satisfied by unrelated local-detail authority.
- `refas.whole-system-relational-barrier/v1` exactly covers every macro/identity whole-system obligation with current evidence and exact structure/authority digests before lower-scope geometry hardening.
- A local-detail relation, good raster result, or lower visual score cannot substitute for a failed/unresolved whole-system obligation.

## Relation-aware fitting

- `refas.relational-discrepancy/v1` binds one exact candidate SHA-256 and one exact relational graph, with exact coverage of required macro/identity relations.
- Missing quantitative evidence remains unresolved; resolved pass/fail checks cite evidence.
- Parameter fitting treats relational invalidity as candidate ineligibility beside structural eligibility, never as a tunable score penalty.
- A lower-loss candidate cannot win if a required relation fails or remains unresolved.
- Fit-plan/report validation rejects relational evidence bound to another candidate or relation-graph digest.

## Candidate and claim authority

- A whole-object candidate is represented by one sealed candidate transaction that binds the exact candidate, current checkpoint, evidence DAG, dependency proofs, decision nodes, and declared obligations.
- Every evidence node used by certification reproduces from its exact bytes; metadata-only substitution is insufficient.
- Certification policy declares explicit per-claim evidence role/schema obligations and blocking-finding semantics.
- Transaction validity alone never authorizes a claim.
- Claim decisions reproduce from the exact transaction, policy, and evidence bytes.
- For real sources, `refas.certification-relational-evidence/v1` binds the exact candidate plus exact relational-structure, semantic-authority, whole-system-barrier, and candidate-discrepancy bytes and logical digests.
- Relational certification revalidates common source/scope, authority coverage, passing barrier/discrepancy state, and barrier checks reproduced from candidate-bound discrepancy evidence.
- The mandatory real-source authority floor contains `whole-system-relational-fidelity`; a custom policy may strengthen but cannot delete, make optional, or weaken that claim after receiving a fresh valid digest.
- Whole-object certificates and audits bind the exact relational certification digest in addition to transaction, policy, claim decision, source, checkpoint, candidate, visual comparison and required PBR evidence.
- Candidate/evidence substitution, stale checkpoint replay, forged decisions, cross-claim contamination, relational replay, re-signed relational substitution, and weaker policies fail closed.

## Visual and appearance authority

- Actual GLB geometry produces the required diagnostic views.
- Registered comparison binds the exact source, candidate, hero frame, registration, hierarchy, and compared scopes.
- Independent visual review controls visual certification; raster, orientation, or relational metric success cannot override it.
- Self-generated references, non-pass verdicts, unresolved blocking findings, stale comparison evidence, and unsupported appearance claims cannot satisfy a source-fidelity claim.
- Appearance claims that require PBR evidence bind a valid independent renderer report and exact output frame digests.

## Reproducible repository validation

- The end-to-end reconstruction fixture exercises whole-to-feature observation, explicit ambiguity, actual GLB generation, multiview evidence, typed recovery and certification refusal where appropriate.
- Joint parameter-fit dogfood verifies real candidate/render trial bytes and keeps metric ranking outside authority.
- Orientation regressions cover same-axis/wrong-facing terminal cases, large-axis mismatch, mixed-sign chain correction, wrong-candidate evidence and re-signed report tampering.
- Relational regressions cover graph validation, semantic authority separation, whole-system barrier/routing, candidate-bound discrepancy, lower-loss ineligible candidates, relational closure substitution and candidate replay.
- Independent PBR, hard-surface and modular-assembly dogfoods remain reproducible and pass their existing integrity gates.

## Distribution

- `npm test`, `npm run test:python`, `npm run check`, and `npm run release:audit` pass from a clean checkout.
- CI passes on Node 20, 22, and 24; the Node 24 job also runs the full repository dogfood chain and release audit.
- The npm dry-run contains only the intended distributable skill, schemas, package metadata and Python requirements; it contains no examples, tests, caches, transient project state, duplicate runtime, private references, or ZIP artifacts.
- The distributable package includes orientation runtime plus relational structure, semantic authority, relational barrier, relational discrepancy and certification-relational closure runtime/reference/schema contracts.
- README/demo describe only shipped behavior and link to reproducible repository evidence.
- `docs/known-limitations.md` states important non-guarantees rather than promoting future domain-pack or physical-simulation work into release claims.

## Compatibility

- New project state and whole-object certificates identify runtime 1.0.3.
- Public v1 project-state and certificate schemas continue accepting 1.0.0 and 1.0.1 artifacts, and the runtime continues loading existing v1 state without in-place migration.
- This patch does not introduce robotics-specific actuator, collider, mass/inertia, MJCF/URDF, calibrated simulation, or manufacturer-truth claims into Core.

## Release cut

The `v1.0.3` tag and GitHub Release must point to the exact `main` commit that passed post-merge CI. Existing release tags remain immutable. Any source change after exact-head CI requires a new validation before release.

Automated or bot-authored branch mutations are never accepted as release evidence by themselves; the resulting exact head must receive a fresh normal PR CI run before merge.

## Semantic instruction graph

- `skills/refas/references/GRAPH.json` exactly covers every reference leaf and its hard prerequisite DAG is acyclic.
- Every semantic graph owner is either a runtime capability or the control plane, and finding ownership matches `FINDING_OWNERS`.
- `camera-hypothesis-mismatch` belongs to `spatial-hypotheses`; `render-camera-integrity` belongs to `rendering`; legacy `camera-mismatch` is compatibility-only and is not offered for new findings.
- Bare sibling Markdown routes are forbidden; every agent-facing dependency uses a canonical installed-skill path.
- Real-source final authorization requires `refas.certification-relational-evidence/v1` in addition to current visual/projection/provenance evidence.
- Both installation-boundary and semantic-graph verifiers pass after copying only `skills/refas/` into an isolated directory.

