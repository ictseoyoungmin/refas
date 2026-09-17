# Integrated Physical Fixture

P17 closes the physical-semantics implementation plan by exercising the existing P01–P16 contracts together on one domain-neutral construction fixture. It does not add a new top-level capability, canonical truth owner, provenance vocabulary, or backend-to-backend conversion path.

## Fixture shape

The fixture is a coupled parallel 2-DOF assembly rooted at `module-base` with two reusable child modules, `module-drive-a` and `module-drive-b`.

Each child module is composed into the root through an explicit fixed attachment interface. The fixed interface relation remains `BINDS_TO`; articulation remains separately represented by `virtual-joint` identities and `CONNECTS` relations. A fixed mount is never promoted into a degree of freedom merely because the mounted module also participates in an articulated mechanism.

The integrated construction contains:

- three rigid links with explicit rigid-body dynamics and collision proxies;
- two virtual joints in one articulation tree;
- one `PARALLEL_LINKAGE` mechanism with an explicit physical linkage edge;
- one 2-input / 2-output `NONLINEAR` transmission bound to an external implementation manifest;
- two rotary actuators;
- two controllers with independent control profiles;
- controller and actuator runtime endpoints with explicit runtime configuration and calibration;
- one P10 physical asset bundle preserving child-module closures.

## Representation closure

P17 projects the same canonical P10 construction independently into two P12 backends.

The first uses the built-in semantic JSON representation. The second uses an integration backend that deliberately serializes physical frames with representation-specific conventions, including sign-negated WXYZ quaternions, centimeter units, and an equivalent extrinsic `ZYX` Euler representation for a nontrivial interface orientation.

The P13 normalizer converts those encodings back to canonical meters + quaternion semantics before P14 comparison. Equivalent quaternion sign, component order, translation units, or Euler order/convention must therefore remain `EQUIVALENT` rather than creating false drift.

Neither backend becomes canonical truth and neither backend is used as the input to the other backend.

## Deliberate drift and declaration

The integration backend deliberately changes one representable rigid-body mass value in the final closure path. That edit must produce a typed P14 `DRIFT` finding and must block the affected P16 physical claim.

P15 may convert only that exact current drift into `DECLARED_DIVERGENCE` when the exact current engineered authority and backend override declaration validate live. The canonical dynamics component remains unchanged. Re-signed or substituted authority state must fail the live P15 binding before P16 can pass.

## Claim closure

The final closure path is intentionally not the all-equivalent shortcut. It runs the deliberate P14 drift through exact live P15 authorization and then assesses P16 `runtime-ready` evidence through typed physical-claim preflight before the generic certification engine makes the final claim decision.

A separate equivalence regression still proves that quaternion sign/component order, translation units, and equivalent Euler convention/order normalize without false drift.

P17 adds no alternate certification engine. P16 evidence remains downstream of P10–P15 and visual-source fidelity certification remains independent.

## Scoped invalidation

The fixture explicitly verifies that control-gain and runtime-index edits remain downstream-scoped. Rebuilding those downstream components must not stale an unchanged `simulation-ready` assessment.

Runtime indices and locator strings remain deployment configuration. They never become P01 semantic identity, array identity, or a substitute for actuator/controller/runtime-endpoint IDs.

## Deterministic closure evidence

P17 integration evidence is a derived test digest over already-authoritative artifacts and the exact declaration path used by the final positive claim:

- P01 identity graph digest;
- P10 bundle digest;
- both P12 export digests;
- both P13 normalization digests;
- both P14 validation digests;
- exact P15 divergence authorization digest;
- exact P15 semantic-authority-set digest;
- the P14 validation digest targeted by that P15 authorization;
- P16 runtime-ready evidence digest;
- the existing certification decision.

The final deterministic reproduction regression therefore exercises `P14 DRIFT → live P15 DECLARED_DIVERGENCE → P16 runtime-ready → certification`, rather than proving only an all-equivalent shortcut. Substituted P15 authority is a negative regression and must fail closed.

`refas.p17-integration-evidence/v1` is only a test/evidence envelope produced by the fixture harness. It is not a public construction schema and is not registered as a canonical RefAs contract.

P17 is closed only when repeated runs reproduce the same P15-bound integration evidence and all repository regressions, audits, and existing dogfood paths remain green.
