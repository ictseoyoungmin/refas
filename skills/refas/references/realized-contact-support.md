# Realized contact and support

Use realized-contact validation after attachment propagation and any physical fusion bake, before downstream KEEP/certification decisions.

- Bind the exact final GLB SHA-256. Any asset-byte change invalidates the graph.
- Treat AABB overlap only as broad-phase candidate discovery. Never close contact from bounds alone.
- Use explicit per-relation expectations for contact, support, clearance, forbidden contact, and tolerated penetration.
- Require support-required entities to reach declared support roots through passing realized SUPPORT edges. Internal connectivity alone is insufficient.
- `FREE` does not imply support exemption.
- Reconcile physical-fusion members through their exact report/provenance digests; do not double-count internal fused members as separate physical meshes.
- Unexpected penetration always blocks. Unexpected ordinary contact follows the plan's explicit policy.
- On failure, reopen the earliest responsible semantic/propagation/fusion stage. Do not patch the realized GLB to satisfy the report.

The realized-contact graph is final-geometry evidence, not a new canonical construction source and not certification authority by itself.

## Structural plausibility beyond contact

Realized contact answers whether surfaces touch, clear, penetrate, and connect to an explicit support root. It does **not** prove that an appendage root is anatomically/mechanically embedded in its parent or that a grounded pose is statically supported.

Use `analyzeStructuralPlausibility({attachmentSemantics, glb})` for those separate checks. It hashes and replays the exact candidate GLB.

### Embedded root

For every attachment relation carrying `rootAnchor.kind: embedded-root`, the runtime:

1. resolves exact active-scene subject and owner meshes;
2. transforms the declared subject-local root point through the realized node hierarchy;
3. measures its distance to the owner's triangle surface;
4. evaluates closed-volume membership from the realized owner triangles;
5. emits `attachment-mismatch` when the point is neither inside nor within the declared tolerance.

An appendage that merely touches the outside wall can therefore still fail.

### Grounded static support

For `groundSupport.mode: grounded`, the runtime:

1. computes each exact realized closed mesh's uniform-density volume and centroid;
2. forms the whole realized volume-weighted COM;
3. gathers ground-near vertices only from declared contact entities;
4. projects those contacts to the declared ground plane and constructs their convex support polygon;
5. projects COM into the same plane and checks inside/outside plus the declared minimum margin.

There is no weighted plausibility score. A grounded failure emits `whole-system-relation-mismatch`. If the source explicitly shows airborne or externally supported state, use `source-supported-exempt`; the support subcheck remains `NOT_APPLICABLE`, not fabricated source truth.

This structural artifact is exact-candidate engineered plausibility evidence. It does not replace realized-contact, spatial/resemblance closure, or final certification authority.
