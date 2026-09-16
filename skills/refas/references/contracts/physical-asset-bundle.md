# Physical asset bundle contract

Use this leaf when packaging canonical physical construction semantics into a reusable digest-bound module manifest.

P10 does **not** create a new physical truth object. `refas.physical-asset-bundle/v1` is a manifest over existing P01–P09 construction contracts. The upstream contracts remain authoritative for their own semantics and provenance.

## Canonical boundary

A bundle contains:

- one selected `assembly-module` root;
- a scoped P01 identity projection for that root module subtree;
- exact digest refs to included P02–P09 physical contracts;
- deterministic closure records for the root and every descendant module;
- one root closure digest and one bundle digest.

The bundle never copies component payloads into the manifest. Component bytes remain external canonical contracts and are referred to by exact schema + digest.

## Scoped P01 identity

Do not bind the whole `refas.physical-identity-graph/v1` digest. P10 uses `refas.physical-asset-bundle-identity-projection/v1` over the selected root-module subtree.

The projection includes the selected module subtree's semantic identities and internal relations, including:

- module and contained identity IDs/kinds;
- canonical physical frames;
- exposed attachment-interface frames;
- attachment-interface compatibility families;
- internal P01 relations whose source and targets all lie inside the selected subtree.

The selected root module's own incoming placement frame is omitted from its projection. That placement belongs to the parent composition, not the reusable child's internal closure.

Unrelated identities or relations outside the selected root subtree must not stale the bundle.

## Component refs

P10 may bind exact component digests for:

- `refas.rigid-body-dynamics/v1`
- `refas.collision-model/v1`
- `refas.articulation-graph/v1`
- `refas.mechanism-graph/v1`
- `refas.transmission-model/v1`
- `refas.actuation-model/v1`
- `refas.control-profile/v1`
- `refas.runtime-binding/v1`

P01 is represented through the scoped identity projection rather than the whole graph digest.

Each component ref has a bundle-local stable `componentId`, an `ownerModuleId`, the component schema, and the exact component digest. P10 reproduces the component's own digest before accepting the ref. This is an integrity check, not replacement semantic authorization: P02–P09 validators remain the owners of component meaning and liveness.

Runtime/backend indices, array position, display names, file names, or export node ordering are never component identity.

## Module closure

Each module receives one `refas.physical-module-closure/v1` record:

```text
module closure
  = scoped module-subtree identity projection digest
  + exact local component refs
  + exact direct-child closure refs
  + direct-child placement frames owned by this parent
```

A child module closure intentionally excludes the child's incoming placement relative to its parent. The parent closure separately binds that placement.

Consequences:

- moving an unchanged closed child inside a parent changes the parent closure but not the child closure;
- changing child-local P01 identity/interface/frame semantics changes the child closure;
- changing, adding, removing, or substituting a child-owned physical component changes the child closure;
- the changed child closure propagates recursively into every parent that references it;
- an unchanged child closure may be reused by exact digest without rewriting the child's component payloads.

This separation is required for reusable closed modules.

## Validation

`validatePhysicalAssetBundle()` checks intrinsic canonical manifest structure and digest reproduction.

`validatePhysicalAssetBundleBindings()` additionally recreates the bundle from current P01 identity and current component payloads. It must fail when:

- an exact component is missing or substituted;
- a component digest does not reproduce;
- component scope/source differs from the selected identity graph;
- a component is assigned outside the selected root subtree;
- selected P01 subtree semantics changed;
- a child closure ref is stale;
- a module closure is missing, duplicated, multiply parented, or unreachable;
- the root closure or bundle digest is stale.

## Transform rule

P10 does not introduce Euler orientation as canonical state. Physical frames remain meters + canonical `[x,y,z,w]` quaternion as defined by P00/P01. Authoring or backend Euler forms remain derived representations.

## Authority rule

The bundle does not promote authority. It does not turn inferred or engineered properties into observed source truth, and it does not authorize simulation/control/runtime readiness by itself.

Later representation/export/claim slices consume exact bundle state but remain responsible for their own preflight, projection, validation, divergence, and certification semantics.

## P10 ownership boundary

P10 owns packaging identity and digest closure only.

It does not own:

- backend representation capacity — P11;
- export realization — P12;
- backend normalization — P13;
- cross-representation findings — P14;
- backend-specific divergence — P15;
- physical readiness claims — P16.
