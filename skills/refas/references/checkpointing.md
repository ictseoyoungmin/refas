# Checkpoints and bounded edits

## Checkpoint meaning

A checkpoint is an immutable, content-addressed record of a trustworthy state. It contains:

- semantic capability and hierarchy scope;
- parent checkpoint;
- reason the state is trustworthy;
- artifact paths, sizes, and SHA-256 values;
- accepted claims and **runtime-derived gate verdicts**;
- optional owner metadata.

Checkpoint files live under `.refas/checkpoints/`. Exact artifact bytes live in the content-addressed `.refas/objects/` store. Restoring materializes those bytes at their recorded project-relative paths, changes the active head, invalidates semantic dependents, and preserves all history.

A checkpoint is rejected when an artifact is missing, its size or SHA-256 does not match, its real path escapes the project through traversal or a symlink, a prerequisite capability is absent, or any runtime-evaluated gate is not `pass`.

## Gate authority

Checkpoint callers submit **gate requests**, never gate verdicts:

```json
{"id":"assembly-gate","evidenceRefs":["model/assembly.json"]}
```

Do not send `status`, evaluator IDs, policy digests, or decision digests. Those fields are runtime-authoritative and caller-supplied values are rejected.

The canonical policy set is exported as `CHECKPOINT_GATE_POLICIES`; `CHECKPOINT_GATE_POLICY_DIGEST` is a discovery/versioning digest for that whole set and is **not** persisted as gate authority. Each persisted verdict instead binds to `checkpointGatePolicyDigest(capability, gateId)`, which hashes only the executable policy identity for that gate: capability, gate ID, evaluator, and evaluator-specific parameters. Descriptive prose and unrelated capability policies are excluded, so adding or documenting another gate does not invalidate untouched checkpoints.

Local capability gates use the runtime `bound-evidence` evaluator and pass only when every cited reference is the bound primary source or a current candidate artifact. Whole-object closure gates use specialized evaluators for source integrity, trusted lineage coverage, the exact digest-bound visual review, and precommit project integrity.

Newly persisted checkpoint gates are `refas.checkpoint-gate-verdict/v1` records. They include the runtime evaluator, scoped policy digest, and decision digest. `audit` validates that authority and rechecks the evidence binding; rewriting a verdict and re-signing only the checkpoint content digest does not make it trustworthy.

### Legacy `refas.checkpoint/v1` read compatibility

Pre-AD04 checkpoints may contain legacy gate records shaped only as `{id,status,evidenceRefs}`. They remain readable under the same checkpoint v1 container. RefAs does **not** trust the stored legacy `status` as authority: on audit, prerequisite admission, or downstream gate evaluation, the current runtime re-evaluates the legacy gate against the bound source, stored artifacts, trustworthy lineage, visual review, or project-integrity policy as applicable. A legacy self-PASS whose evidence no longer satisfies the runtime policy fails closed. New checkpoint writes never emit the legacy gate shape.

## When to checkpoint

Commit after a capability passes its local gates and before:

- changing a closed silhouette or surface network;
- re-registering a child;
- replacing a model specification;
- tuning camera and geometry together;
- changing a source or evidence recipe;
- starting a risky appearance or topology pass.

Do not checkpoint every keystroke. Checkpoint states worth returning to.

## Early resemblance admission

For a real source, shape reconstruction may checkpoint a candidate even when its early resemblance result is `HOLD` or `REWORK`; this preserves the attempted candidate and evidence. However, `surface-topology` and every downstream capability are refused until the current shape-reconstruction checkpoint contains a canonical `refas.early-resemblance-barrier/v1` bound to:

- the current primary source SHA-256;
- the current visual-hierarchy digest;
- exactly one candidate GLB in that shape checkpoint;
- current R03 perceptual-signature evidence;
- the canonical neutral-clay render report for that same candidate;

and the runtime-derived barrier verdict is `PROCEED`.

This is an admission rule, not certification. A later mismatch can still reopen shape reconstruction, and final visual review/certification remain independently authoritative.

Synthetic/test acquisition kinds are contract-only exceptions. They may retain an intentional `HOLD` barrier while continuing downstream API dogfoods, because those fixtures do not claim source resemblance or production readiness.

## Bounded edit transaction

One transaction has:

1. a baseline checkpoint;
2. one owner capability and one scope;
3. one testable intent;
4. protected metrics;
5. exactly one direct candidate checkpoint;
6. before/after evidence and findings;
7. a deterministic decision.

## Decision semantics

| Decision | Meaning | Active head |
|---|---|---|
| `KEEP_EDIT` | objective improved without protected regression | candidate |
| `ROLLBACK_EDIT` | new hard failure, protected regression, or introduced blocker | baseline |
| `REOPEN_OWNER` | existing blocker is localized and routable | route-selected pre-owner checkpoint |
| `REQUEST_REVIEW` | evidence is insufficient or utility is tied | baseline |
| `MAY_CLOSE` | every declared closure gate passes | candidate |

Never delete a rejected candidate. It is evidence of what was tried.

## Explicit restore

Use `restore --checkpoint <id> --reason <reason>` when the desired trustworthy state is already known. The runtime restores the target checkpoint's exact artifact bytes and identifies the first invalidated capability.

A repair route may instead identify the nearest checkpoint before the finding owner. Use `report-finding` to apply that route and artifact restore to project state; `route` alone is a non-mutating preview.

Use `abort-edit` when an edit cannot be evaluated. It restores the baseline even if no candidate checkpoint exists. Use `resume` at every handoff or fresh turn. Its answer is authoritative for the next safe capability, scope, and action.

## Candidate provenance transaction

A bounded edit transaction and a candidate provenance transaction have different responsibilities. The edit transaction controls one mutation attempt and rollback decision. `refas.candidate-transaction/v1` is created after evidence exists and seals the exact candidate, checkpoint, and evidence graph used by a later decision.

The candidate transaction recomputes the checkpoint content digest and requires that the checkpoint artifact set contain the exact root candidate SHA-256. It then content-addresses every evidence node and requires every dependency edge to prove the exact bytes of the related artifact through a JSON Pointer stored in one of the two artifacts. Binary evidence therefore needs a digest-bearing JSON report or manifest rather than a bare caller assertion.

Evidence roles and schemas are generic policy inputs. Do not hard-code a reconstruction-stage list into the transaction. A static mesh, articulated assembly, material review, animation, or another future asset class may declare different obligations while using the same graph contract.

Before a later certification step consumes a transaction, call `validateCandidateTransaction` with the current candidate bytes, checkpoint record, and exact evidence bytes. A transaction that validates without external context proves only internal canonical structure and digest integrity; final use must recheck the external bytes.

Read `references/candidate-transactions.md` for construction and dependency-proof rules. A sealed candidate transaction does not modify checkpoint state, does not replace rollback, and does not authorize certification.

## Audit

`audit` verifies checkpoint content digests, parent lineage, content objects, active-head artifact bytes, source identity, transaction structure, and certificate binding. An invalid audit is a closure blocker.
