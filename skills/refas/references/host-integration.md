# Host integration

Use this leaf only when RefAs is embedded in an external application, agent harness, editor, service, or process supervisor. Host integration is an additive facade over RefAs authority. It does not change reconstruction, checkpoint, finding, candidate, review, or certification semantics.

## Authority boundary

The external host may open or inspect a session, observe durable events, own host-operation lifecycle, request a review bundle, obtain an artifact handoff, or delegate bounded computation to an external worker. The host must not read or mutate `.refas/` directly. Use the public library APIs or `scripts/refas-host.mjs`.

RefAs remains authoritative for:

- project and checkpoint state;
- source and evidence provenance;
- bounded-edit rollback and restore;
- typed finding ownership and reopening;
- candidate transactions and current-candidate identity;
- visual-review authority;
- claim and whole-object certification.

A host facade may project those facts but cannot pass a gate, resolve a finding, certify an object, rewrite a checkpoint, or invent a product-specific state.

## Public contracts

### `refas.host-session/v1`

`openHostSession(root, {sessionId, projectId})` creates or resumes one stable host identity for a RefAs project. `loadHostSession()` is read-only. Session status is a projection of existing RefAs state plus the current host operation; it is not a second project-state machine.

A current GLB candidate is exposed only when the current checkpoint has exactly one `kind: "glb"` reference whose real path remains inside the project and whose size and SHA-256 still match exact bytes.

### `refas.host-event/v1`

Host events are durable, monotonic, replayable facts. Use `getHostEvents(root, {afterSequence})` for cursor-based replay. A consumer must persist the last accepted sequence and resume from that sequence after reconnect or restart.

`subscribeHostEvents()` provides same-process live delivery after replay. Cross-process consumers should poll `getHostEvents()` by sequence or use the `refas-host events --follow` polling command. Never infer authority from a missing transient notification; persisted sequence is authoritative.

Worker lifecycle events require both `operationId` and `workerRunId`. Non-worker events cannot carry `workerRunId`.

### `refas.host-operation/v1`

`executeHostOperation()` binds one stable operation identity to one request digest. One nonterminal mutating host operation may own a project at a time. Read-only operations do not acquire reconstruction authority.

Pause and cancel are distinct:

- pause stops at a safe boundary and preserves the operation for resume;
- cancel abandons the in-flight bounded edit through existing `abortEdit()` authority when needed;
- late executor success cannot override a durable pause or cancellation request.

On process restart, interrupted mutating work is recovered to a safe paused or cancelled state rather than silently resumed.

### `refas.host-review-bundle/v1`

`getHostReviewBundle()` is a read-only presentation envelope over the exact current checkpoint, source, candidate, checkpoint artifacts, existing gates/claims, and existing visual-review evidence. It cannot create review authority, resolve findings, or certify.

`publishHostReviewBundle()` writes deterministic bundle bytes and emits `review-bundle-ready`. Existing bytes at the deterministic path must match exactly or publication fails closed.

### `refas.artifact-handoff/v1`

`getArtifactHandoff()` returns a deterministic transfer descriptor for exactly one current GLB candidate. It binds session/project identity, checkpoint ID/content digest, exact artifact bytes, valid candidate-transaction digest when present, and the current certification projection.

Certification status is one of `uncertified`, `ready`, or `certified`. The handoff cannot promote a candidate. `ready` requires existing valid candidate-transaction authority. `certified` additionally requires the current certificate and project audit to remain valid for the same candidate/checkpoint/transaction.

Use `assertArtifactHandoffCurrent()` immediately before transfer or downstream consumption when stale handoffs must be rejected.

### External worker protocol

`refas.worker-request/v1` and `refas.worker-response/v1` define a narrow child-process protocol. `runExternalWorker()` launches argv with `shell:false` from the project root.

Protocol rules:

- parent writes one digest-bound JSON request to stdin;
- worker writes exactly one JSON completion object on stdout;
- stderr is bounded diagnostics only and never authority;
- worker response status is only `completed`;
- parent verifies every returned artifact path, realpath containment, size, and SHA-256 before emitting `worker-completed`;
- `.refas/`, parent traversal, noncanonical paths, symlink escape, stale bytes, malformed JSON, extra stdout, abnormal exit, and binding mismatches fail closed;
- timeout, host cancellation, host pause, and process failure remain distinct outcomes;
- only the parent host emits durable worker lifecycle events or finalizes the owning host operation.

Workers never receive checkpoint, certification, or event-sequencing authority from this protocol.

## Companion CLI

The distributable package exposes `refas-host` in addition to the reconstruction-oriented `refas` CLI.

```bash
refas-host open --root <project-dir> --session <session-id> --project <project-id>
refas-host status --root <project-dir>
refas-host events --root <project-dir> --after 0 --jsonl
refas-host events --root <project-dir> --after <sequence> --follow
refas-host review-bundle --root <project-dir>
refas-host handoff --root <project-dir>
refas-host validate-worker --request <worker-request.json> [--response <worker-response.json>]
```

`events --follow` polls durable event history by sequence; it does not depend on in-process listeners. JSONL consumers should checkpoint the last accepted `sequence` and resume with `--after`.

`review-bundle --publish` performs the explicit deterministic publication step. `handoff --assert <handoff.json>` validates both intrinsic structure and currentness against live RefAs state.

## Integration rules

1. Keep product vocabulary outside RefAs contracts. Map product UI states to RefAs public facts in the host application.
2. Do not expose hidden reasoning. Public messages are bounded facts or diagnostics.
3. Treat paths as references, never authority. Reverify exact bytes through RefAs public APIs before downstream use.
4. Keep execution timing separate from reconstruction truth. A worker timeout or host cancellation cannot rewrite checkpoint or certification facts.
5. Persist event sequence and stable operation IDs in the host if recovery across process restarts matters.
6. Re-read the current handoff or review bundle after any checkpoint, candidate, transaction, review, or certification change.
7. Ordinary reconstruction does not require host integration. This leaf is conditional and must not become a prerequisite for the reconstruction/certification graph.
