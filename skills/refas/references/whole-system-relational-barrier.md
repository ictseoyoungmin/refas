# Whole-system relational barrier

Use `refas.whole-system-relational-barrier/v1` after the whole-system relation graph and its semantic authority are current, and before lower-scope geometry hardening that depends on those relations.

The barrier exists because correct local endpoints, contours, or feature shapes do not prove that the reconstructed object has the correct global proportions, plane transitions, volume relations, or structural ordering.

## Applicability

The relational barrier is a hard gate **when macro or identity `whole-system` relational obligations are declared or otherwise material to the active construction decision**. It is not a requirement to invent placeholder relations merely because shape construction is active.

If the current construction scope has no applicable whole-system relational obligation, continue under the normal observation, spatial-hypothesis, canonical-edit, construction-quality, projection, and visual-review gates. If such an obligation becomes material later, establish its relational structure, authority, current check, and passing barrier before hardening lower-scope geometry that depends on it.

Parameter fitting follows the same rule. A fit that sets `relationalEligibilityRequired: true`, or that can alter an applicable macro/identity whole-system relation, must consume the current barrier and candidate-bound relational evidence. A fit that has no such relational dependency must not fabricate one solely to satisfy the instruction graph.

Real-source whole-object certification has a separate mandatory relational authority floor. Before that certification, a meaningful current relational structure, semantic-authority set, passing barrier, and candidate-bound discrepancy must exist and be sealed into `refas.certification-relational-evidence/v1`. Do not satisfy the certification floor with a synthetic no-op relation.

## Required order

When the barrier is applicable, preserve this order:

```text
source evidence
  -> relational structure
  -> semantic authority
  -> current relation checks
  -> whole-system relational barrier
  -> dependent lower-scope geometry hardening
```

Do not reverse this order by polishing a local feature and then treating the polished result as evidence that its upstream relations were correct.

## What the barrier checks

The runtime takes the macro and identity `whole-system` obligations from `refas.relational-structure/v1`. Every required relation must have exactly one current check and an authority entry bound to the exact structure digest.

A relation check has one of three states:

- `pass` — current evidence supports the relation; at least one evidence reference is required;
- `fail` — current evidence contradicts the candidate relation;
- `unresolved` — current evidence cannot yet decide the relation.

The barrier passes only when every required relation check is `pass` and every relation has authority that can license positive construction: `observed`, `inferred`, or `engineered`.

`unknown` blocks positive local hardening that depends on the declared proposition but is not a prohibition. `forbidden` is an explicit construction blocker. A local detail relation never satisfies a macro or identity whole-system obligation.

## Repair routing

Use `routeRelationalBarrier()` when an applicable barrier is blocked.

- missing, unknown, or invalid authority reopens `spatial-hypotheses`;
- explicit forbidden/constraint conflict reopens `spatial-hypotheses`;
- a failed whole-system relation reopens `shape-reconstruction`;
- an unresolved relation requests more evidence instead of inventing a rollback owner.

The route uses the existing checkpoint lineage and invalidation graph. Do not manually keep downstream topology, assembly, appearance, or rendering closed after an upstream relational premise fails.

## Evidence classes

Relation checks may cite registered comparison, source-space measurements, projection evidence, section/plane review, negative-space review, or another current digest-bound artifact appropriate to the relation. A visual score alone is not enough. The check must say which semantic relation the evidence evaluates.

A relation may be inferred or engineered and still pass the barrier; that does not promote it to source truth. The barrier authorizes bounded construction under current authority, not a historical/manufacturer claim.

## What the barrier does not do

A passing barrier does not certify visual fidelity, topology, assembly, materials, rendering, or the whole object. It only establishes that lower-scope hardening is no longer proceeding on unresolved applicable macro/identity relational premises.

If a later render disproves a previously passing relation, reopen the relation owner and invalidate downstream work. Do not preserve a CLOSED label after premise failure.
