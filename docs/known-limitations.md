# Known limitations in RefAs 1.1.0

RefAs 1.1.0 can represent and validate explicit physical construction semantics, but it remains conservative about what those semantics are entitled to claim. The limits below are product boundaries, not hidden guarantees.

## Single-view observation remains incomplete

A single image can strongly constrain projected shape, overlap, visible planes, relative proportions, and some orientation cues while still leaving depth, scale, roll, hidden topology, and internal construction ambiguous.

RefAs preserves that ambiguity. A correct projected endpoint or primary axis does not prove a complete 3D frame. Additional views, calibration evidence, specifications, or explicit engineering authority may be required for a physically useful result.

## Physical semantics do not create manufacturer truth

RefAs 1.1.0 adds typed identities and contracts for modules, interfaces, rigid links, joints, dynamics, collision, mechanisms, transmissions, actuators, controllers, and runtime endpoints. Those contracts say **what a current construction means**; they do not prove that an unseen real product was manufactured the same way.

`refas.semantic-authority-set/v1` remains decisive:

- `observed` — directly supported source fact;
- `inferred` — evidence/prior/specification-supported hypothesis;
- `engineered` — explicit functional or downstream construction choice;
- `unknown` — unresolved;
- `forbidden` — contradicted or prohibited.

An inferred shaft, engineered linkage, estimated inertia, or designed collision proxy remains inferred/engineered unless independent evidence supports promotion of that exact proposition. Unknown values remain unresolved rather than receiving simulator-friendly defaults.

## Readiness is scoped, not universal calibration

`articulated-ready`, `simulation-ready`, `control-ready`, and `runtime-ready` are scoped evidence claims over the current semantic selection. They do not mean that every physical quantity has been measured from a real object.

For example, a `simulation-ready` claim may be valid when its required dynamics, collision, articulation, mechanism, transmission, and actuation obligations are present and supported under their declared authority. That does not turn an engineered mass or collision approximation into an observed measurement.

Likewise, `runtime-ready` means the applicable control/runtime obligations and exact current bindings close. It does not guarantee compatibility with every external runtime, robot, simulator, controller implementation, or hardware revision.

## Calibration quality depends on evidence

Mass, center of mass, inertia, friction, damping, stiffness, effort/velocity limits, actuator response, controller gains, latency, sensor offsets, runtime sign/zero/scale, and collision geometry can be represented explicitly. Their real-world accuracy is only as strong as their basis.

A model built from a single photograph usually does not have enough evidence to certify calibrated physical truth. Measurements, datasheets, system identification, calibration captures, or other independent evidence may be necessary.

## Collision is semantic realization, not contact truth by itself

RefAs separates collision geometry from render geometry and can require explicit reuse/approximation declarations. A valid collision model still does not prove a particular physics engine will reproduce real contact behavior without suitable solver, friction, restitution, timestep, and material parameters.

## Backend equivalence has a declared scope

Representation normalization removes differences that are semantically equivalent under the supported contract, including canonical quaternion sign/component handling, supported unit conversions, and equivalent transform conventions.

That does not make every backend feature equivalent. If a backend cannot represent a required semantic, the result is explicitly lossy. If it can represent the semantic but differs without authorization, the result is drift. If the canonical authority is insufficient, comparison remains unresolved.

## Declared divergence is not silent permission

P15 divergence authorization is exact and field-scoped. It must bind the current P14 drift, backend, semantic subject/path, canonical value, normalized override, and current engineered authority. A stale or substituted authority set fails live validation even if the persisted artifact is internally well formed.

A declared divergence does not mutate canonical construction state and does not justify unrelated backend differences.

## Higher-level state remains downstream

Controller tuning and runtime binding/calibration are intentionally downstream-scoped. Editing those values does not promote them into joint, actuator, module, geometry, or source identity and does not automatically invalidate unrelated lower-level physical or visual evidence.

Conversely, an upstream joint frame, mechanism, dynamics, or module-interface change may invalidate the downstream physical claims and backend projections that depend on it.

## Absolute scale still requires calibration

Single-view imagery does not establish physical dimensions by itself. Real-world scale, camera intrinsics, and lens distortion require calibration evidence when they matter to a claim.

## Material identity remains epistemically limited

PBR rendering can prove that a declared appearance was rendered reproducibly under an exact configuration. Appearance similarity does not identify unknown real material composition, internal layers, coatings, or manufacturing process without supporting evidence.

## Metrics do not own truth

Projection, silhouette, landmark, orientation, perceptual, relational, and representation-comparison metrics remain diagnostic or eligibility evidence under their contracts. They cannot override visible failure, source authority, typed physical blockers, live divergence validation, or claim-specific certification requirements.

## Integrated fixture proves contract integration, not every asset class

The P17 coupled parallel 2-DOF fixture exercises the complete physical-semantic chain, including reusable modules, articulation, dynamics, collision, nonlinear transmission, actuation, control, runtime binding, two backend representations, normalization, deliberate drift, live divergence authorization, and `runtime-ready` certification.

That fixture proves the contracts work together deterministically. It is not evidence that every future asset class, simulator backend, mechanism family, or hardware runtime is already supported without additional adapters, validators, or domain evidence.

## Release boundary

RefAs 1.1.0 ships typed physical construction and scoped readiness semantics as Core contracts while keeping the existing vision-first evidence policy. The release does not claim observed manufacturer internals or calibrated real-world physics where evidence is absent, and it does not rename public `.../v1` namespaces merely because the package version advanced.
