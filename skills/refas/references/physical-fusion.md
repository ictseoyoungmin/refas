# Physical fusion finalization

Use physical fusion only after semantic construction and logical fusion are trustworthy. `FUSED` means one logical body during reconstruction; it does not authorize early boolean or weld operations.

For finalization, create a `refas.physical-fusion-plan/v1` bound to the exact logical fusion group, input asset, pre-fusion checkpoint/state, member geometry digests, and member rigid-frame digests. Non-fused dependents are never included.

Choose `WELD_SHARED_BOUNDARY` only when intended interfaces are already coincident. The native runtime welds coincident vertices, removes opposite-winding shared internal faces, rebuilds normals, and checks one connected output plus the declared topology obligation. A mere buffer merge is not physical fusion.

Choose `SOLID_UNION` when solids overlap beyond a coincident interface. Do not approximate that case with merge or weld. RefAs requires an exact-input-bound compatible robust boolean backend result; otherwise the bake remains blocked.

Keep `refas.fusion-provenance/v1` with the fused output. Every output face must retain semantic source-member provenance. If any fused semantic member reopens, discard the fused output, restore the exact pre-fusion semantic checkpoint/state, edit upstream construction, replay attachment propagation, and bake again. Never sculpt the fused GLB as the default semantic source.

A `BAKED` physical fusion report is finalization evidence, not visual or whole-object certification. Realized contact/support and visual review still apply after bake.
