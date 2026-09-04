# Claim-driven certification

Whole-object certification is the final authority boundary. It does not infer geometry, repair evidence, or mutate checkpoints. It consumes evidence that is already current and decides which claims the exact candidate is allowed to carry.

The certification path is:

1. identify the exact whole-object candidate from the current certification checkpoint;
2. require a sealed candidate provenance transaction, either supplied as a checkpoint artifact or deterministically synthesized from the current digest-bound review chain;
3. validate the transaction against exact candidate bytes, checkpoint content, and evidence bytes;
4. apply a canonical `refas.certification-policy/v1` policy whose claims declare evidence-role/schema obligations and optional finding sources;
5. evaluate every required claim into `refas.claim-certification-decision/v1`;
6. preserve the existing independent visual review, registered comparison, realized projection, PBR, and closure-gate checks;
7. issue the whole-object certificate only when both legacy safety gates and all required claim decisions pass.

A sealed provenance transaction is necessary evidence integrity, but it is not certification authority. A claim passes only when its own policy obligations are satisfied and no blocking finding vetoes it.

Minor or explicitly non-blocking evidence boundaries remain disclosed in the claim decision without forcing unrelated claims to fail. Major, critical, explicitly blocking, or policy-listed finding severities veto the affected claim.

The certificate records a claim-certification binding containing the transaction digest, policy digest, decision digest, and authorized/refused claim IDs. The project state also records the claim-certification digest. Project audit recomputes the current transaction, policy, and decision and rejects stale or mutated bindings.

Checkpoint storage and rollback semantics are unchanged. If evidence becomes stale, route repair to the original owner and rebuild the transaction/policy decision; never repair geometry inside certification.
