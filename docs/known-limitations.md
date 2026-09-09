# Known limitations in RefAs 1.0.2

RefAs 1.0.2 is deliberately conservative about what it can certify from reference evidence. The limits below are product boundaries, not hidden claims.

## Ambiguous full 3D orientation

A single image can strongly constrain position, projected direction, overlap and visible planes while still leaving rotation about a part's primary axis ambiguous. RefAs makes camera-relative orientation cues, full local frames, terminal facing and parent-child twist explicit when evidence supports them, and it refuses to treat a primary axis alone as a complete orientation.

This does not make genuinely ambiguous roll observable. When facing/lateral evidence is absent, roll remains unresolved unless an explicit parent-frame inheritance policy is justified. A correct projected endpoint or primary axis therefore does not by itself prove a correct full 3D orientation. Hands, feet, tools, gears and other direction-sensitive parts may still require additional views or explicit review.

## Hidden form and manufacturer truth

RefAs 1.0.2 no longer treats unobserved structure as prohibited by default. `refas.semantic-authority-set/v1` distinguishes `observed`, `inferred`, `engineered`, `unknown`, and `forbidden` propositions. A hidden continuation or support may be constructed as `inferred` when evidence, relational constraints, structural priors, or external specifications justify it, or as `engineered` when an explicit functional/downstream requirement justifies it.

That permission is not manufacturer truth. Only `observed` authority can assert a source fact. An inferred shaft, concealed brace, rear surface, internal support, or engineered linkage remains an inference/design choice unless independent evidence promotes the specific proposition. `unknown` remains unresolved; only `forbidden` asserts a contradiction or hard prohibition.

## Simulation-ready physical truth

Mass, center of mass, inertia, collision geometry, actuator dynamics, friction, contact parameters and physically calibrated joint limits are outside the general 1.0.x certified capability set unless a project supplies its own evidence and validators.

A GLB that is visually and structurally useful is not automatically a calibrated simulation model. Robotics-specific physical assembly, MJCF/URDF export and simulation validation are not part of the 1.0.2 Core release. Optional domain packs may add these semantics later without changing the general evidence/authority contract.

## Absolute scale and calibration

Single-view imagery does not establish physical dimensions by itself. Real-world scale, camera intrinsics and lens distortion require calibration evidence when they matter to a claim.

## Material identity

PBR rendering can validate that a declared appearance is rendered reproducibly, but appearance similarity does not identify an unknown real material composition. Unsupported material identity remains a hypothesis.

## Relational structure is only as strong as its basis

A relational graph can express proportions, alignments, ordering, plane chains and volume relationships that are not well represented by independent local features. It does not make an unsupported relationship true. Every whole-system relation still needs semantic authority and current evidence before it can pass the relational barrier.

`inferred` and `engineered` authority can license construction but cannot be silently promoted to `observed`. A passing relational barrier proves that the declared current relation obligations are satisfied under their declared authority; it does not prove that every hidden part or physical mechanism matches the photographed object.

## Metrics and automated fitting

Projection, silhouette, landmark, orientation and perceptual metrics are diagnostic/ranking evidence. Relational discrepancy is stricter: when a fit plan requests relational eligibility, failed or unresolved whole-system relations make a candidate ineligible rather than adding a tunable loss penalty. A lower numeric loss therefore cannot trade away a required relation.

These metrics still do not own repair routing or visual certification. Independent visual evidence and the existing structural/projection gates retain their authority.

## Certification scope

For real-source whole-object certification, RefAs 1.0.2 seals the exact candidate together with exact relational-structure, semantic-authority, whole-system-barrier and candidate-bound relational-discrepancy bytes. This protects provenance and authority from omission, substitution, replay and policy downgrade; it does not expand what those evidence artifacts are semantically entitled to claim.

## Release boundary

These limitations describe the 1.0.2 release as shipped. The patch adds domain-neutral relational structure, explicit inference/engineering authority, hard relational fitting eligibility and sealed relational certification. It does not introduce robotics-specific actuator/collider/mass/inertia/simulation vocabulary into Core. Calibrated multi-representation physical validation and optional domain packs remain later capabilities rather than retroactive 1.0.2 guarantees.
