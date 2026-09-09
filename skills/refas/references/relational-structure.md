# Relational structure before local detail

RefAs reconstructs a coherent 3D system, not a bag of independently matched visible parts. Visible evidence constrains that system but does not define the whole model.

Use `refas.relational-structure/v1` when identity or function depends on the relationship between entities: proportions, alignments, ordered landmarks, plane transitions, or volume balance. Keep the contract domain-neutral; face-specific, robotics-specific, architectural, or product-specific names belong in the project specification, not Core runtime.

## What belongs here

Represent semantic entities such as landmarks, axes, planes, volumes, regions, interfaces, and systems. Then declare relations between them. The initial Core relation kinds are:

- `distance-ratio` — ratio between two semantic spans, useful for proportions without assuming absolute units;
- `alignment` — collinear, parallel, perpendicular, coplanar, centered, or symmetric relationships;
- `ordering` — semantic order along the declared reference right/up/forward axes;
- `plane-chain` — ordered coarse surface-plane transitions without hard-coding any asset class;
- `volume-ratio` — relative volume/mass-envelope relationship between two semantic volumes or systems.

Every relation declares whether it is `whole-system` or `local` and whether its importance is `macro`, `identity`, or `detail`. Local feature work never substitutes for unresolved whole-system relations.

## Relation graph

Relations may depend on other relations. Dependencies must be acyclic and every referenced entity/relation must exist. Use the canonical dependency order produced by the runtime; do not hand-order relations differently in separate agents.

A whole-system relation is a reconstruction dependency, not automatically a source fact. `basisRefs` name the evidence, prior, requirement, or other basis that motivated the relation. Classify what that basis is allowed to claim with `refas.semantic-authority-set/v1`; relation basis alone never upgrades a hypothesis to source truth.

## Ratio before coordinates

Prefer normalized or relational quantities when absolute dimensions are unavailable. A face-like project may care about paired-feature spacing relative to total height; a machine may care about shaft spacing relative to housing width; furniture may care about leg spread relative to seat width. These are the same Core relation type.

Do not inject population-average, manufacturer, anatomical, or category priors as if they were source measurements. Record the relation and its basis; semantic authority decides what the basis is allowed to claim.

## Plane and volume reasoning

A correct collection of landmarks can still produce a wrong 3D form when the planes and volumes connecting them are wrong. Declare important plane chains and volume ratios before polishing local features. If the large relational system is wrong, reopen the responsible structure instead of adding local geometry until one view looks plausible.

## Whole-system barrier

`wholeSystemRelationalObligations()` returns the macro/identity whole-system relation IDs that must be resolved before lower-scope geometry hardening. Evaluate those obligations with current evidence and create `refas.whole-system-relational-barrier/v1`.

The barrier binds the exact relational-structure digest and semantic-authority-set digest. It passes only when every required relation has current passing evidence and authority that can license positive construction. `unknown` blocks the barrier without becoming `forbidden`; explicit `forbidden` authority is a construction conflict.

Use `routeRelationalBarrier()` when blocked. Failed whole-system geometry routes to `shape-reconstruction`; missing/unknown/forbidden authority routes upstream to `spatial-hypotheses`; genuinely unresolved evidence requests review instead of inventing a repair owner. See `references/whole-system-relational-barrier.md`.
