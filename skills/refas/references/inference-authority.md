# Inference and engineering authority

RefAs must distinguish lack of observation from prohibition. A single image is incomplete; an incomplete source does not imply that unseen structure may not exist or may not be constructed.

The Core rule is:

```text
UNKNOWN != FORBIDDEN
UNOBSERVED != FORBIDDEN
ENGINEERED != OBSERVED
INFERRED != OBSERVED
```

Use `refas.semantic-authority-set/v1` to classify the authority of a semantic relation, entity, property, or construction proposition without changing what the source actually shows.

## Authority classes

- `observed` — directly supported by source evidence. This is the only class that can assert a source fact.
- `inferred` — a testable explanation supported by source evidence, relational constraints, a structural prior, or an external specification. It may guide construction but remains an inference.
- `engineered` — deliberately chosen to satisfy an explicit functional or downstream requirement. It may be instantiated in the model but is not a claim about what the source or original manufacturer contains.
- `unknown` — unresolved. It is neither evidence for existence nor evidence for absence. It may remain a competing hypothesis or later transition to inferred/engineered/forbidden when new basis appears.
- `forbidden` — explicitly contradicted by source evidence or blocked by a hard constraint. This is the only authority class that positively prohibits construction.

## Positive hidden-form reasoning

Do not stop at `unknown` merely because a surface, continuation, support, or internal relation is invisible. Ask what the coherent 3D system requires.

1. If visible evidence plus relational structure constrain a continuation, record it as `inferred`.
2. If a declared functional/downstream requirement needs a construction that the source does not resolve, record it as `engineered`.
3. If the source does not decide and no structural/functional basis is strong enough, keep `unknown`.
4. Use `forbidden` only when a contradiction or hard constraint exists.

Examples are intentionally domain-neutral. A concealed brace, internal support, rear surface continuation, anatomical volume, or linkage support can all be inferred or engineered under the same Core policy. Domain packs may provide stronger priors and validators later, but they do not change the authority classes.

## Basis kinds

Every non-unknown positive authority must carry typed basis:

- `source-evidence`
- `relation`
- `structural-prior`
- `external-spec`
- `functional-requirement`
- `downstream-requirement`

`observed` requires direct `source-evidence`. `engineered` requires a functional or downstream requirement. `forbidden` requires `source-contradiction` or `hard-constraint`.

A requirement can justify construction but cannot masquerade as source evidence. Re-digesting an engineered record after changing its label to `observed` must still fail validation when direct source evidence is absent.

## Authority capability boundary

The runtime derives capability flags rather than trusting caller declarations:

- `canAssertSourceFact`
- `canInstantiateConstruction`
- `canServeAsHypothesis`
- `requiresResolutionBeforePositiveClaim`
- `prohibitsConstruction`

The crucial distinction is that both `unknown` and `forbidden` currently block positive construction, but only `forbidden` asserts that construction is prohibited. `unknown` remains reopenable without contradicting prior evidence.

## Transitions

Authority transitions are explicit semantic changes. Keep the same `subjectId`, provide a new basis, and revalidate.

- `unknown -> inferred` needs inference basis.
- `unknown -> engineered` needs an explicit functional/downstream requirement.
- `inferred/engineered -> observed` needs direct source evidence.
- leaving `forbidden` requires new rebutting evidence/spec/constraint basis rather than merely deleting the old contradiction.

Checkpoints and provenance retain the old state; never rewrite history to make an inference look as though it had always been observed.

## Relation coverage and closure

When an authority set targets `refas.relational-structure/v1`, bind its exact structure digest. `validateRelationalAuthorityCoverage()` checks source identity, exact target digest, missing whole-system relations, and authority entries that refer outside the relational graph.

Authority coverage alone does not certify a relation. Feed the exact relation graph plus authority set into `createWholeSystemRelationalBarrier()` with current relation checks. The barrier authorizes lower-scope hardening only when every macro/identity whole-system relation both passes current evidence and carries `observed`, `inferred`, or `engineered` authority.

This is deliberately asymmetric:

- `unknown` means **do not positively construct yet; gather evidence or choose an explicit engineered/inferred basis**;
- `forbidden` means **do not construct under the current contradiction/constraint**;
- `inferred` and `engineered` may support construction but still cannot assert source truth.

When the barrier is blocked, use `routeRelationalBarrier()` rather than manually preserving downstream CLOSED states. See `references/whole-system-relational-barrier.md`.
