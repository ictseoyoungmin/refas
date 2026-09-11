# Claim certification reference

Use claim certification only after the candidate bytes, checkpoint, renders, comparisons, structural evidence, review artifacts, and every applicable semantic prerequisite in `references/GRAPH.json` are stable.

## Runtime contracts

- `refas.candidate-transaction/v1` proves that evidence belongs to one exact candidate/checkpoint provenance chain.
- `refas.certification-policy/v1` declares claims and the evidence roles/schemas each claim requires.
- `refas.claim-certification-decision/v1` records per-claim obligation checks, blocking vetoes, disclosed non-blocking findings, and the final authorization decision.
- `refas.whole-object-certificate/v1` remains the release certificate and records the transaction/policy/decision binding.

## Real-source relational authority floor

A real-source whole-object certification must include a current `refas.certification-relational-evidence/v1` artifact for the exact candidate. Build it only from the exact current:

- `refas.relational-structure/v1` bytes;
- `refas.semantic-authority-set/v1` bytes;
- passing `refas.whole-system-relational-barrier/v1` bytes;
- passing candidate-bound `refas.relational-discrepancy/v1` bytes;
- certification candidate SHA-256.

The relational closure is a mandatory authority floor, not optional supporting evidence. Missing, stale, candidate-mismatched, substituted, replayed, or internally contradictory relational closure refuses real-source certification. It does not promote `inferred` or `engineered` propositions to `observed` source facts.

Synthetic/test fixture compatibility may omit this real-source floor only where the runtime explicitly permits that acquisition class. Such fixtures cannot use the compatibility path to make a real-source fidelity claim.

## Rules

- Transaction validity alone never authorizes a claim.
- Required claim obligations are conjunctive: missing evidence fails the claim.
- A policy may inspect declared finding arrays through evidence JSON Pointers.
- Major, critical, explicit blocking, or policy-listed severities veto the affected claim.
- Non-blocking evidence boundaries are disclosed but may coexist with certification.
- The claim layer never mutates geometry, evidence, checkpoints, or rollback state.
- Existing relational closure, realized-contact/support, visual-review, registered-comparison, realized-projection, renderer, and closure gates remain authoritative and are not replaced by claim policy.

The runtime accepts checkpoint-bound transaction/policy/decision artifacts when provided. For compatibility, it can deterministically synthesize the default whole-object visual claim transaction and policy from the exact current checkpoint evidence, then records their digests in the final certificate. Explicit artifacts remain preferable when an external dogfood or review bundle already sealed them. Deterministic synthesis never waives the real-source relational authority floor or another mandatory upstream gate.
