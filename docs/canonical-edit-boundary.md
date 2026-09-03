# Canonical edit boundary

RefAs treats a GLB as a realized artifact, not the default editable source of semantic shape truth.

## Default edit path

| Edit class | Canonical source of truth | Realization path | Direct GLB mutation |
|---|---|---|---|
| shape | construction state (`model.shape.*`, `model.geometry.*`, construction/surface/attachment state) | rebuild exact GLB | forbidden |
| pose | realized transform state (`assembly.joint.*`, `assembly.node.*`) | node/joint transform update | controlled transform only; mesh/accessor bytes stay immutable |
| appearance | appearance state (material, texture, vertex-color source) | rebake appearance or rebuild GLB | realization only, never the canonical edit itself |
| finalization | realized asset selected for closure | fuse/weld/internal-face cleanup/optimization | controlled finalization only |

An arbitrary vertex or mesh binary patch may be useful for diagnosis, but it is not a canonical shape edit and cannot establish the durable reconstruction state used by later fitting, attachment propagation, rollback, or certification.

## Why this boundary exists

Reference reconstruction is iterative. If a forearm, nose, panel, or other semantic owner changes only in the realized GLB, upstream construction state and dependent relationships can become stale. A later rebuild may lose the edit, while attached dependents may remain in the old position and float. The canonical path therefore updates the semantic construction state first and realizes a fresh GLB from that state.

```text
reference finding
      ↓
canonical construction / pose / appearance state
      ↓
realization
      ↓
exact GLB
      ↓
actual render and structural validation
      ↓
KEEP / ROLLBACK
```

## Shape edits

Shape changes happen upstream. `shape-reconstruction`, `surface-topology`, or an assembly-owned construction relation may modify declared `model.shape.*`, `model.geometry.*`, `construction.*`, `surface-network.*`, or `attachment.*` bindings. The selected state must then rebuild the realized GLB. A shape edit may not declare a direct mesh-binary mutation as its realization operation.

This matches the existing parameter-fitting contract: a project worker rebuilds exact candidate GLB bytes for every parameter vector, and the resulting bytes are re-projected and rendered before a candidate can be ranked.

## Pose edits

Pose is the narrow direct-GLB exception. Parent-local node/joint transforms may change while mesh/accessor bytes remain identical. This preserves the same geometry representation while changing assembly transforms. Future attachment propagation may update dependent transforms before validation, but it must not silently mutate mesh bytes under a pose edit.

## Appearance edits

Material values, texture sources, and vertex-color sources belong to canonical appearance state. Baking them into a realized GLB is allowed as a realization step, but the baked GLB is not the sole source of truth for the appearance change.

## Finalization edits

After semantic construction is closed, controlled finalization may operate directly on the realized asset: logical fusion can be baked into mesh fusion/welding, internal faces can be cleaned, and the mesh can be optimized. Reopening a fused semantic region should restore the pre-fusion semantic checkpoint rather than treating the fused output as the default sculpting source.

## Runtime contract

`createCanonicalEditIntent` records the edit class, owner, scope, canonical bindings, and allowed realization operations. The runtime rejects incompatible combinations, including:

- arbitrary shape edits that do not rebuild a GLB;
- pose edits that mutate mesh/accessor bytes;
- appearance edits whose canonical binding is outside appearance state;
- uncontrolled finalization operations.

The intent is advisory infrastructure for later attachment and transaction slices; it does not itself mutate project state, run geometry generation, or authorize closure.
