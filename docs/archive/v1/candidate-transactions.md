# Candidate provenance transactions

A candidate transaction seals the evidence graph for one exact realized candidate without turning that graph into a new modeling authority. It answers one question: do the checkpoint and all evidence used by a decision belong to one content-addressed provenance chain?

The public artifact is `refas.candidate-transaction/v1`.

## Root and checkpoint binding

The constructor receives the exact candidate bytes and a `refas.checkpoint/v1` record. It recomputes the checkpoint content digest and checkpoint ID, then requires that the checkpoint contain an artifact whose SHA-256 is the candidate SHA-256. The transaction stores only that exact candidate digest/size and checkpoint identity/content digest.

Changing candidate bytes or checkpoint content makes the old transaction stale. A transaction does not edit or replace a checkpoint and does not change checkpoint rollback semantics.

## Generic evidence graph

Evidence is represented as an acyclic graph rather than fixed fields for particular reconstruction stages. Each node records:

- a semantic node ID and evidence role;
- an optional public artifact schema;
- the exact artifact-byte SHA-256 and size;
- either a direct root-candidate JSON Pointer or a derived subject binding;
- content-bound dependency edges.

A direct binding points into the actual JSON artifact bytes, for example `/assetSha256` or `/candidateAssetSha256`. The pointer must resolve to the exact root candidate digest. This avoids schema-specific candidate-field logic in the transaction runtime.

A dependency edge is stronger than a caller-declared relationship. Every edge carries `json-pointer-artifact-sha256` proof. The proof identifies whether the pointer lives in the current node (`holder: self`) or dependency node (`holder: dependency`), and the pointer must resolve to the exact byte digest of the other artifact. Substituting a different dependency therefore fails even when both artifacts are otherwise valid.

Binary artifacts can participate without inventing embedded metadata. A JSON manifest/report can bind their exact SHA-256 and depend on them. Candidate anchoring propagates across those proven edges, so every node must be provenance-connected to at least one direct root-candidate binding.

## Decision reachability and obligations

`decisionNodeIds` identify the terminal evidence actually used by the decision. Every evidence node must be reachable by following dependencies from at least one decision node; unattached evidence is rejected rather than being counted as persuasive volume.

Callers may declare generic obligations by role and/or schema with a minimum count. Obligations are transaction-admission requirements only. They do not mean that the evidence passed a domain policy and they do not authorize certification. A static single-mesh project can declare a different evidence set from an articulated assembly without changing the transaction schema.

## Validation authority

`validateCandidateTransaction` always checks canonical ordering, graph acyclicity, root anchoring, decision reachability, obligations, transaction digest, and policy invariants. When exact candidate bytes, checkpoint record, and evidence bytes are supplied as validation context, it also recomputes every external byte digest, direct subject JSON Pointer, and dependency proof.

A later certification layer must provide that exact-byte context and then apply schema/domain-specific validators and claim policy. A sealed provenance transaction is necessary evidence integrity, not a visual, structural, or release PASS.

## Recovery

A failed transaction is repaired upstream:

- candidate mismatch: rebuild or select the intended candidate;
- stale checkpoint: return to the correct checkpoint state;
- evidence-byte mismatch: regenerate that evidence;
- dependency mismatch: regenerate the holder artifact from the intended dependency;
- missing obligation: produce the policy-requested evidence;
- cycle/orphan: correct the provenance graph.

The transaction runtime never modifies candidate geometry, evidence bytes, or checkpoint state.
