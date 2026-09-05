# RefAs 1.0 release criteria

RefAs 1.0 is releasable only when the current exact head satisfies the gates below without relying on historical CI, stale evidence, or undocumented runtime behavior.

## Runtime and recovery

- Public schemas and executable validators agree.
- Checkpoints preserve exact artifact bytes and restore them without leaving the project root.
- A failed edit restores the baseline artifact, not only a state pointer.
- Typed findings name one owner, invalidated dependents, and a safe recovery checkpoint; unroutable blockers fail closed.
- Reference registration remains a placement/projection hypothesis rather than shape truth.
- Closed-child composition preserves original child binary payloads.
- Attachment, support, clearance, contact, articulation, and fusion evidence cannot be replaced by proximity guesses.
- Portable and independent render reports bind exact candidate bytes, renderer configuration, frames, and declared feature support.

## Candidate and claim authority

- A whole-object candidate must be represented by one sealed candidate transaction that binds the exact candidate, current checkpoint, evidence DAG, dependency proofs, decision nodes, and declared obligations.
- Every evidence node used by certification reproduces from its exact bytes; metadata-only substitution is insufficient.
- Certification policy declares explicit per-claim evidence role/schema obligations and blocking-finding semantics.
- Transaction validity alone never authorizes a claim.
- Claim decisions reproduce from the exact transaction, policy, and evidence bytes.
- Whole-object certificates bind the exact transaction, policy, claim decision, source, checkpoint, candidate, and required visual/PBR evidence.
- A checkpoint-bound custom policy may be equal to or stricter than the mandatory whole-object authority floor, but may not weaken it even after receiving a fresh valid digest.
- Candidate/evidence substitution, stale checkpoint replay, forged decisions, cross-claim evidence contamination, and weaker re-signed policies fail closed.

## Visual and appearance authority

- Actual GLB geometry produces the required diagnostic views.
- Registered comparison binds the exact source, candidate, hero frame, registration, hierarchy, and compared scopes.
- Independent visual review controls visual certification; raster success or a lower metric cannot override it.
- Self-generated references, non-pass verdicts, unresolved blocking findings, stale comparison evidence, and unsupported appearance claims cannot satisfy a source-fidelity claim.
- Appearance claims that require PBR evidence bind a valid independent renderer report and exact output frame digests.

## Reproducible repository validation

- The end-to-end reconstruction fixture exercises whole-to-feature observation, explicit ambiguity, actual GLB generation, multiview evidence, a deliberately defective candidate, typed routing, exact rollback, and expected certification refusal where the fixture is not eligible for source-fidelity certification.
- Joint parameter-fit dogfood verifies real candidate/render trial bytes and keeps metric ranking outside authority.
- Independent PBR dogfood proves deterministic output digests.
- Hard-surface dogfood proves true apertures, coherent thickness, and semantic topology.
- Modular-assembly dogfood proves local-frame contact/clearance/support behavior and rejects invalid exploded state.
- Articulated and benchmark examples remain reproducible repository evidence rather than opaque release claims.

## Distribution

- `npm test`, `npm run test:python`, `npm run check`, and `npm run release:audit` pass from a clean checkout.
- CI passes on Node 20, 22, and 24; the Node 24 job also runs the full repository dogfood chain and release audit.
- The npm dry-run contains only the intended distributable skill, schemas, package metadata, and Python requirements; it contains no examples, tests, caches, transient project state, development-iteration identity, duplicate runtime, private references, or ZIP artifacts.
- README commands and paths are executable as written.
- The release demo describes only shipped 1.0 behavior and links to reproducible examples.
- `docs/known-limitations.md` states important non-guarantees rather than silently promoting future work into release claims.

## Release cut

The `v1.0.0` tag and GitHub Release must point to the exact `main` commit that passed post-merge CI. Any source change after that CI requires a new exact-head validation before release.
