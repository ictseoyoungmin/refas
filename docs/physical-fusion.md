# Physical fusion bake

Physical fusion is a finalization step. It converts one validated logical `FUSED` group into one physical mesh without making that fused mesh the canonical semantic edit source.

## Preconditions

A bake requires:

- valid attachment semantics and logical fusion;
- a `finalization` canonical edit intent declaring `mesh-fuse`, `mesh-weld`, and `internal-face-cleanup`;
- one exact logical fusion group and exactly its member set;
- exact input asset SHA-256;
- exact pre-fusion checkpoint and semantic-state digest;
- exact member geometry and rigid-frame digests;
- a declared topology obligation and fusion strategy.

Non-fused dependents such as glasses are excluded by construction.

## Native shared-boundary weld

`WELD_SHARED_BOUNDARY` is for meshes whose intended union interface is already represented by coincident boundary faces. The runtime transforms every member into the fusion-root frame, welds coincident vertices within the declared tolerance, removes pairs of coincident opposite-winding interface faces, compacts the result, rebuilds normals, and audits connectivity/topology.

A buffer merge alone is not physical fusion. Same-winding duplicate faces, stale member geometry/frames, disconnected output, invalid winding, or a violated topology obligation block the bake.

## Solid union boundary

`SOLID_UNION` is required when members overlap in a way that cannot be resolved by coincident-boundary weld. RefAs does not silently approximate this with merge or weld. A compatible external backend must return one exact-input-bound `robust-solid-union` result with provenance for every output face. Without it the result is `BLOCKED_BACKEND_REQUIRED`.

The geometry algorithm is replaceable; the plan, exact input binding, output topology, provenance, and reopen contract are RefAs authority.

## Provenance and reopen

`refas.fusion-provenance/v1` records every output face's semantic source members and any removed interface pairs. A boolean-generated face may cite multiple source members.

Reopening a fused member never begins from the fused output mesh. `physicalFusionReopenTarget` resolves the request to the exact bound pre-fusion checkpoint/state/asset. The fused output must be discarded, semantic construction is restored, the member is edited upstream, attachment propagation is replayed, and physical fusion is baked again.

## Authority

`refas.physical-fusion-report/v1` may report `BAKED`, `BLOCKED_BACKEND_REQUIRED`, or `BLOCKED_TOPOLOGY`. Even `BAKED` is a finalization artifact, not whole-object certification authority. Later realized contact/support and visual certification still apply.
