# Known limitations in RefAs 1.0.1

RefAs 1.0.1 is deliberately conservative about what it can certify from reference evidence. The limits below are product boundaries, not hidden claims.

## Ambiguous full 3D orientation

A single image can strongly constrain position, projected direction, overlap and visible planes while still leaving rotation about a part's primary axis ambiguous. RefAs 1.0.1 makes camera-relative orientation cues, full local frames, terminal facing and parent-child twist explicit when evidence supports them, and it refuses to treat a primary axis alone as a complete orientation.

This does not make genuinely ambiguous roll observable. When facing/lateral evidence is absent, roll remains unresolved unless an explicit parent-frame inheritance policy is justified. A correct projected endpoint or primary axis therefore does not by itself prove a correct full 3D orientation. Hands, feet, tools, gears and other direction-sensitive parts may still require additional views or explicit review.

## Hidden physical mechanisms

RefAs separates source-supported observations from hypotheses. It does not claim that unseen shafts, bearings, reducers, actuators, wiring, internal supports or other manufacturer-specific mechanisms match a photographed product unless independent evidence supports those claims.

The 1.0.x workflow may preserve hidden-form ambiguity or bounded structural hypotheses, but a plausible internal design is not automatically source truth. A dedicated engineering-inference authority model remains future work.

## Simulation-ready physical truth

Mass, center of mass, inertia, collision geometry, actuator dynamics, friction, contact parameters and physically calibrated joint limits are outside the general 1.0.x certified capability set unless a project supplies its own evidence and validators.

A GLB that is visually and structurally useful is not automatically a calibrated simulation model. Robotics-specific physical assembly, MJCF/URDF export and simulation validation are not part of the 1.0.1 Core release.

## Absolute scale and calibration

Single-view imagery does not establish physical dimensions by itself. Real-world scale, camera intrinsics and lens distortion require calibration evidence when they matter to a claim.

## Material identity

PBR rendering can validate that a declared appearance is rendered reproducibly, but appearance similarity does not identify an unknown real material composition. Unsupported material identity remains a hypothesis.

## Metrics and automated fitting

Projection, silhouette, landmark and discrepancy metrics are diagnostic/ranking evidence. Orientation fitting additionally requires a validated discrepancy artifact bound to the exact candidate, source and orientation evidence before its loss may rank a candidate. These metrics do not own repair decisions or visual certification. A lower numeric loss cannot override a contradictory visual or structural finding.

## Release boundary

These limitations describe the 1.0.1 release as shipped. The patch adds general orientation correctness without introducing robotics-specific actuator, collider, mass/inertia, simulation or domain vocabulary into Core. Engineering-inference authority, canonical multi-representation integrity and optional domain packs remain later milestones rather than retroactive 1.0.1 guarantees.
