# Known limitations in RefAs 1.0

RefAs 1.0 is deliberately conservative about what it can certify from reference evidence. The limits below are product boundaries, not hidden claims.

## Ambiguous full 3D orientation

A single image can strongly constrain position, projected direction, overlap and visible planes while still leaving rotation about a part's primary axis ambiguous. RefAs 1.0 can fit parent-local pose variables, but its general evidence contract does not yet make full local frames, terminal facing normals and parent-child twist first-class observations for every asset class.

A correct projected endpoint or primary axis therefore does not by itself prove a correct full 3D orientation. Hands, feet, end effectors, tools, gears and other direction-sensitive parts may require additional views or explicit review.

## Hidden physical mechanisms

RefAs separates source-supported observations from hypotheses. It does not claim that unseen shafts, bearings, reducers, actuators, wiring, internal supports or other manufacturer-specific mechanisms match a photographed product unless independent evidence supports those claims.

The 1.0 workflow may preserve hidden-form ambiguity or bounded structural hypotheses, but a plausible internal design is not automatically source truth.

## Simulation-ready physical truth

Mass, center of mass, inertia, collision geometry, actuator dynamics, friction, contact parameters and physically calibrated joint limits are outside the general 1.0 certified capability set unless a project supplies its own evidence and validators.

A GLB that is visually and structurally useful is not automatically a calibrated simulation model.

## Absolute scale and calibration

Single-view imagery does not establish physical dimensions by itself. Real-world scale, camera intrinsics and lens distortion require calibration evidence when they matter to a claim.

## Material identity

PBR rendering can validate that a declared appearance is rendered reproducibly, but appearance similarity does not identify an unknown real material composition. Unsupported material identity remains a hypothesis.

## Metrics and automated fitting

Projection, silhouette, landmark and discrepancy metrics are diagnostic/ranking evidence. They do not own repair decisions or visual certification. A lower numeric loss cannot override a contradictory visual or structural finding.

## Release boundary

These limitations describe the 1.0 release as shipped. Future work may add stronger orientation-frame, engineering-inference and physical-assembly contracts, but those are not retroactive 1.0 guarantees.
