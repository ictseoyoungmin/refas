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
