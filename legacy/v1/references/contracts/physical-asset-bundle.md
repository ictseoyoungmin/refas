# Physical asset bundle contract

Use this leaf when packaging canonical physical construction semantics into a reusable digest-bound module manifest.

P10 does **not** create a new physical truth object. `refas.physical-asset-bundle/v1` is a manifest over existing P01–P09 construction contracts. The upstream contracts remain authoritative for their own semantics, liveness, and provenance.

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

The projection includes the selected module subtree's semantic identities and internal relations, including module and contained identity IDs/kinds, canonical physical frames, exposed attachment-interface frames and compatibility families, and internal P01 relations whose source and targets all lie inside the selected subtree.

The selected root module's own incoming placement frame is omitted from its projection. That placement belongs to the parent composition, not the reusable child's internal closure. Unrelated identities or relations outside the selected root subtree must not stale the bundle.

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

Each component ref has a bundle-local stable `componentId`, an `ownerModuleId`, the component schema, and the exact component digest. Before accepting a component, P10 dispatches to that component schema's upstream intrinsic validator and then reproduces its exact digest. A payload that merely copies a supported `schema` string and self-computes the corresponding digest is not a valid P10 component.

P04 articulation validation is dependency-bearing: a live input component must provide input-only `validationContext.attachmentSemantics` and `validationContext.jointContracts` so the existing P04 validator can establish canonicality. This context is never serialized into the P10 manifest.

This is validation delegation, not semantic takeover. P02–P09 remain the owners of component meaning and their deeper live dependency rules. P10 only refuses to package a payload that the owning contract validator does not recognize as canonical.

### Module ownership/locality

`ownerModuleId` is not a free label. P10 extracts the P01 semantic identities referenced by each supported component and requires all of them to lie inside the declared owner module's recursive subtree.

Examples:

- a child-owned dynamics component may only reference rigid links in that child subtree;
- an articulation or transmission spanning two child modules cannot be assigned to either child independently;
- such a cross-module component may be owned by their nearest common ancestor module because that ancestor subtree contains the complete semantic footprint;
- assigning a root-link component to a descendant child fails closed.

This rule makes child closure reuse meaningful: a child closure cannot claim a component whose actual semantic subjects live outside that child.

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

## Validation

`validatePhysicalAssetBundle()` checks intrinsic canonical manifest structure and digest reproduction.

`validatePhysicalAssetBundleBindings()` additionally recreates the bundle from current P01 identity and current component payloads. Creation/rebinding fails when:

- an exact component is missing or substituted;
- an upstream component validator rejects the supplied payload;
- a component digest does not reproduce;
- component scope/source differs from the selected identity graph;
- a component references semantic identities outside its declared owner module subtree;
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

P10 owns packaging identity, component-locality proof, and digest closure only. It does not own backend representation capacity (P11), export realization (P12), backend normalization (P13), cross-representation findings (P14), backend-specific divergence (P15), or physical readiness claims (P16).
