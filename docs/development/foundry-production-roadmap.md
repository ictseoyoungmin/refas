# Foundry production roadmap (post-v1.2.1)

RefAs is a reference-driven **3D asset production system**. Verification is an internal quality control, not the product's principal output. The primary result is a recognizable, editable, assembly-aware GLB and a source project suitable for iteration.

## Production-first priorities

### F01 — Flagship whole-object construction
- Start from one demanding reference subject and get its **whole shape** credible before feature breadth.
- Convert source observations into a construction plan: global proportions, source camera, silhouette-changing masses, signed negative spaces, repeated part patterns and support relationships.
- Provide concrete mesh-building recipes for hard-surface solids, continuous organic subdivision cages, cavities/holes, mechanical rails/struts, separate accessories and materials. Preserve the chosen geometry authoring tool's editable project file (e.g. Blender) as well as the exact candidate GLB.
- Make every step reconstruct something the agent can see, not only create paperwork. Headless four-/six-/eight-view captured checkpoints are supporting feedback, not substitutes for the asset.
- Completion: an independent external worker can produce and revise a recognizable flagship asset without author-provided scaffolding and can reopen the correct shape owner if required.

### F02 — Agent construction kit and local geometry editing
- Expose a small, discoverable capability kit with real examples: constructive sketch-to-volume, segment+profile sweeps, holes, loops, creases, part transforms, symmetry, attachment seats, materials and GLB export.
- Support Blender CLI/bpy and native modular script backends. Record construction inputs as editable parameters and geometry provenance; do not introduce a generative 3D/image model requirement.
- Prefer an immediately useful vertical slice over many isolated operators. Measured iteration time and reference resemblance—not operation count—determine whether a helper belongs in the kit.
- Completion: an agent can repair silhouette, face, hair, garments or a complex mechanism through *local* owner-scoped geometry edits, reusing the same model without a full rebuild.

### F03 — Character, mechanical and appearance production tracks
- **Characters:** anatomically plausible head/face, carefully segmented hair, deformation-ready edge flow, joint loops, facial shape keys, wardrobe and common skeleton/VRM-ready exports.
- **Mechanical assets:** open/closed assemblies, struts, gears, correct pivot/hinge axes, exploded views, stable support/contact, nonpenetrating movement.
- **Appearance:** accurate material grouping, detail-frequency hierarchy, texture/source material evidence and practical target-runtime shaders.
- Completion: separate production-grade vertical slices whose geometry remains useful after a material/lighting swap.

### F04 — Iterative, observable worker ergonomics
- One agent-facing loop: inspect current project -> propose a single meaningful geometry edit -> modify -> render -> compare -> retain or rollback.
- The worker sees exact commands, trusted current geometry and crop/view pointers; it never has to parse raw policy logs to discover a repair target.
- Capture per-iteration time/cost and *visual* improvement, preserve a successful checkpoint and stop when no real progress is observed.
- Completion: repeated unfamiliar-reference trials improve fidelity without repeated human reconstruction of the toolchain.

## Quality controls: bounded supporting role

Existing source-bound, GLB, physical, camera, and recovery gates remain necessary and fail closed. Do not add more validators simply because a failure mode can be imagined. First demonstrate the failure on a source image and a real GLB; prefer reusing current tests, replay and repair routing. Additional P0 semantics/quality changes are deferred from **v1.2.1 interface release** and should be reconsidered only with new asset-production evidence.

## v1.2.1 boundary

v1.2.1 adds read-only agent navigation and diagnosis over the current runtime. It does **not** add new positive source-photo semantic interpretation, does not relax final source-bound admission, and does not claim that any arbitrary single photograph can produce a guaranteed faithful GLB. Source-bound release approval remains unavailable when independent source-meaning evidence is absent. Draft artifact transfer and explicit approved final receipt are distinct.

## Recommended next vertical slice

First prove F01 on a single hard reference where the prior system produced a formally valid but visibly wrong model. Preserve original photo bytes, freeze accepted cameras, iterate on whole-object silhouette/part identities and demonstrate an unmistakable visible improvement through headless captures. Publish construction recipes and editable source assets alongside the actual GLB. Only after the vertical slice is credible, standardize the kit for reuse.

## Rendering infrastructure track (v1.4.0)

CPU rendering throughput and backend interoperability support the production-first roadmap; they do not replace the flagship modeling work or supply photo fidelity on their own. The current, implementation-facing design is organized separately:

- [CPU render execution architecture](v1.4.0-render-architecture.md)
- [Backend and trusted replay contracts](v1.4.0-render-contracts.md)
- [R14 implementation slices and acceptance gates](v1.4.0-render-work-plan.md)

The public v1.3.0 renderer, source truth, and certified evidence remain unchanged while this work is in design. Begin with real nondegenerate scene benchmarks, then select the compiled CPU kernel and only afterward widen optimized backend authority.
