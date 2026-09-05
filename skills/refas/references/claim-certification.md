# Claim certification reference

Use claim certification only after the candidate bytes, checkpoint, renders, comparisons, structural evidence, and review artifacts are stable.

## Runtime contracts

- `refas.candidate-transaction/v1` proves that evidence belongs to one exact candidate/checkpoint provenance chain.
- `refas.certification-policy/v1` declares claims and the evidence roles/schemas each claim requires.
- `refas.claim-certification-decision/v1` records per-claim obligation checks, blocking vetoes, disclosed non-blocking findings, and the final authorization decision.
- `refas.whole-object-certificate/v1` remains the release certificate and records the transaction/policy/decision binding.

## Rules

- Transaction validity alone never authorizes a claim.
- Required claim obligations are conjunctive: missing evidence fails the claim.
- A policy may inspect declared finding arrays through evidence JSON Pointers.
- Major, critical, explicit blocking, or policy-listed severities veto the affected claim.
- Non-blocking evidence boundaries are disclosed but may coexist with certification.
- The claim layer never mutates geometry, evidence, checkpoints, or rollback state.
- Existing visual-review, registered-comparison, realized-projection, renderer, and closure gates remain authoritative and are not replaced by claim policy.

The runtime accepts checkpoint-bound transaction/policy/decision artifacts when provided. For compatibility, it can deterministically synthesize the default whole-object visual claim transaction and policy from the exact current checkpoint evidence, then records their digests in the final certificate. Explicit artifacts remain preferable when an external dogfood or review bundle already sealed them.
