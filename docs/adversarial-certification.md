# Adversarial certification hardening

A13 treats the A11 candidate transaction and A12 claim policy as an authority chain that must remain fail-closed under hostile substitution, replay, mutation, and re-signing.

## Attack boundaries

| Attack | Required rejecting boundary |
| --- | --- |
| candidate/evidence byte substitution | candidate transaction validation, before claim evaluation |
| stale checkpoint transaction replay | candidate transaction checkpoint binding |
| policy obligation deletion with a new valid policy digest | whole-object policy authority floor |
| blocking-severity downgrade with a new valid policy digest | whole-object policy authority floor |
| authorized-claim injection with a recomputed decision digest | claim decision reproduction |
| old decision paired with another valid policy | claim decision reproduction |
| visual evidence reused for a typed structural obligation | per-claim role/schema obligation evaluation |
| post-certification edit/reopen | checkpoint-store certification invalidation and audit |

## Minimum whole-object authority

A checkpoint-bound custom certification policy may add claims, evidence obligations, finding sources, or stricter veto rules, but it may not weaken the mandatory whole-object `visual-source-fidelity` floor. The floor is derived from the current runtime default for the source class.

For the mandatory claim, an explicit policy must preserve:

- required status;
- every mandatory evidence role/schema obligation with at least the same `minCount`;
- every mandatory finding source and JSON Pointer;
- every mandatory veto severity;
- registered-comparison evidence when the source class requires it.

A structurally valid and freshly re-digested policy that removes any of these is still refused by whole-object certification. This keeps policy extensibility without allowing policy substitution to erase the authority RefAs already required before A12.

## Non-goals

A13 does not add geometry repair, mutate checkpoint evidence, or make policy evaluation a visual judge. Evidence truth remains owned by its producer and existing visual/reprojection/PBR gates. A13 only ensures that later provenance, policy, decision, and certificate layers cannot weaken or replay those upstream authorities.
