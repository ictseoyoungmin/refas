---
name: refas
description: Reconstruct a reference image as a traceable, editable, and visually certified 3D asset. Use for image-to-3D work that requires whole-to-part observation, explicit uncertainty, projection-aware modeling, immutable child assembly, multiview rendering, objective visual critique, or safe checkpoint and rollback routing; especially when a quick img2threejs approximation is not sufficient.
---

# RefAs — Reference Asset Foundry

RefAs turns visual evidence into a 3D asset without pretending that a single image contains facts it cannot reveal. It binds every claim to source evidence, separates observation from inference, reconstructs from whole object to surface feature, and keeps every risky edit recoverable.

## Required reading

Before doing any reconstruction, read:

1. `references/workflow.md`
2. `references/checkpointing.md`
3. `references/failure-routing.md`

Then load only the references owned by the active capability:

| Active work | Read |
|---|---|
| Source, hierarchy, observation | `references/observation.md`, `references/provenance.md` |
| Camera, depth, spatial inference | `references/spatial-reasoning.md` |
| Shape and surface construction | `references/construction.md` |
| Parent/child placement | `references/assembly.md` |
| Material identity and finish | `references/appearance.md` |
| Render, comparison, closure | `references/validation.md` |

Do not blend every reference into one undifferentiated prompt. Keep one capability and one visual scope active at a time.

## Non-negotiable truth policy

- The raw reference is primary evidence. Crops, edge maps, contrast views, segmentation, and annotations are observation aids.
- Observe the whole image before regions or parts. Every part retains an ancestry chain and a context-preserving crop.
- Store visible facts separately from interpretations, hypotheses, and ambiguities.
- Never convert hidden geometry, material identity, symmetry, or dimensions into facts without evidence.
- Compare actual renders, not code, parameter values, manifests, or agent confidence.
- Preserve accepted child assets as immutable GLBs when assembling a parent. Reopen them only when parent evidence disproves their closure.
- A low score alone does not select a repair owner. Localize a typed visual defect first.
- A blocking defect without an owner fails closed. Do not guess a rollback point.

## Start a project

Use a dedicated output directory; do not write generated artifacts into this skill.

```bash
node scripts/refas.mjs source-manifest \
  --root <project-dir> \
  --image <project-dir>/source/reference.png \
  --id primary-reference \
  --out <project-dir>/source/source-manifest.json
node scripts/refas.mjs init \
  --root <project-dir> \
  --project <semantic-project-id> \
  --source <project-dir>/source/source-manifest.json
node scripts/refas.mjs status --root <project-dir>
node scripts/refas.mjs resume --root <project-dir>
```

`source-manifest` accepts only an image and output inside the project root. It records the source path, SHA-256, byte size, pixel dimensions, and acquisition context. If a project was initialized without a source, use `bind-source` before any checkpoint.

Copy `assets/templates/visual-hierarchy.json` and customize it with semantic IDs such as `whole`, `upper-shell`, or `fastener-center`; never use iteration codes as architecture. Use `assets/templates/visual-observation.json` as input to `createObservation`; the output becomes a digest-bound record.

Create evidence views without replacing the source:

```bash
python3 scripts/evidence.py --image <reference.png> --out <evidence-dir> --scope whole
python3 scripts/evidence.py --image <reference.png> --out <evidence-dir> --scope <part-id> --roi x,y,width,height
```

Normalized ROI values are in `[0,1]`. Evidence manifests include source and recipe digests.

## Reconstruction loop

Follow the semantic capability order in `references/workflow.md`.

1. Inspect the full frame and record source provenance.
2. Define the visual hierarchy from whole to feature.
3. Record observations for the active node; keep uncertainty explicit.
4. Propose multiple spatial hypotheses when depth or camera is ambiguous.
5. Reconstruct the dominant silhouette and mass before decoration.
6. Anchor visible boundaries and relief to the reference projection.
7. Assemble closed children in a parent reference frame.
8. Add appearance only after geometry can explain the image.
9. Render the standard multiview set.
10. Log typed findings, route them to the owning capability, and repair only the invalidated span.
11. Certify the whole object only when every closure gate has current evidence.

After each capability reaches a trustworthy state, commit a checkpoint:

```bash
node scripts/refas.mjs checkpoint \
  --root <project-dir> \
  --capability <capability> \
  --scope <scope-id> \
  --reason <why-this-state-is-trustworthy> \
  --artifacts <artifact-refs.json> \
  --gates <gate-results.json>
```

Checkpoint artifact references must include SHA-256. A checkpoint is a recoverable state, not a progress note.
The runtime verifies each referenced path and digest, stores the exact bytes under `.refas/objects/`, and restores those bytes on rollback. Do not hand-edit `.refas/`.

## Make bounded edits

Begin an edit before changing a closed or protected state:

```bash
node scripts/refas.mjs begin-edit \
  --root <project-dir> \
  --owner <capability> \
  --scope <scope-id> \
  --intent <single-testable-intent> \
  --protected silhouette,attachment,child-integrity
```

Create exactly one candidate checkpoint, render it, then finish the edit with before/after metrics and typed findings:

```bash
node scripts/refas.mjs finish-edit \
  --root <project-dir> \
  --candidate <checkpoint-id> \
  --before <before.json> \
  --after <after.json> \
  --findings <findings.json>
```

The decision is one of `KEEP_EDIT`, `ROLLBACK_EDIT`, `REOPEN_OWNER`, `REQUEST_REVIEW`, or `MAY_CLOSE`. Never manually reinterpret a rollback result as success.

If work must stop before a decision, use `abort-edit`; it restores the baseline artifact bytes. On a fresh agent turn, run `resume` before mutating anything. It returns one safe checkpoint, one capability × scope, and one next action.

## Build geometry

The JavaScript library in `scripts/lib/` provides deterministic, dependency-light primitives:

```js
import {
  appendPartsToClosedGlb,
  createAssemblyContract,
  createRealizedAssemblyProof,
  createCurvedPlate,
  createCylinder,
  createHardSurfaceShell,
  createReferenceRegistration,
  createSegmentPrism,
  createSurfaceNetwork,
  createSurfaceNetworkParts,
  createSurfaceRibbon,
  createVisualReview,
  partsToGlb,
  surfaceFrame,
  surfacePoint,
  validateRealizedAssembly,
  validateRealizedAssemblyProof,
  validateVisualReview,
} from './scripts/lib/index.mjs';
```

Use these as construction mechanisms, not visual assumptions. Put asset-specific polygons, proportions, and hypotheses in the project model specification. Keep them out of the reusable runtime.

For a coherent hard-surface shell with negative space, pass a
`refas.hard-surface-spec/v1` document to `createHardSurfaceShell`. Cutouts become
real front-to-back apertures, and selected outer/cutout edges receive actual
sharp, chamfer, fillet, or stepped geometry. Preserve the returned semantic
topology in GLB output; assembly may bind to its stable edge attachment frames.
Reject invalid or intersecting profiles rather than repairing them silently.

For a curved or folded shell, do not stop at an extruded boundary polygon. Use interior subdivisions, a normal-offset back surface, and either evidence-fitted compound coefficients or a projection-anchored guided surface with transverse profiles plus a longitudinal guide. Make panels, trim, and fastener axes consume the same `surfaceFrame`. Close shape only after side and grazing renders preserve the observed depth profile.

For parent assembly, prefer `appendPartsToClosedGlb`. It preserves the original child binary payload as an exact prefix and records the child digest.

When claiming modularity or disassembly, mark semantic module roots and contact
surfaces in the GLB, store child transforms relative to their parent nodes, and
run `createRealizedAssemblyProof` on the final bytes. The proof—not caller
assertions—must establish mesh ancestry, bounded contact or intentional
clearance, derived support, zero excessive penetration, immutable-child
preservation, and object-ID separation. Validate it and inspect assembled plus
exploded multiview evidence before closing assembly.

Represent every observed shared adjacency once with `createSurfaceNetwork`; `createSurfaceNetworkParts` realizes one physical boundary per adjacency. Use `createReferenceRegistration` to fit attested 2D frame correspondences. Registration is placement authority only and never licenses a child shape change. Use `createAssemblyContract` and `validateRealizedAssembly` to test projected overlap, depth order, support, penetration, and closed-child integrity.

For an open-frame mount, bracket, handle, guard, stock, or architectural frame,
read **Open-frame mounts and structural negative space** in
`references/construction.md`. Reconstruct it as one coherent frame around true
apertures with continuous junctions and explicit mounting lands—not as floating
bars, dark plates posing as holes, or a one-view cage. Keep unseen structural
continuity and load capacity as hypotheses unless evidence attests them.

## Render and review

Generate actual multiview evidence with the bundled offline renderer:

```bash
python3 scripts/render_glb.py \
  --glb <asset.glb> \
  --out <render-dir> \
  --reference <reference.png> \
  --frame <canonical-object-frame.json> \
  --timeout-seconds 300 \
  --max-working-mb 512
```

Copy `assets/templates/canonical-object-frame.json` when the GLB's semantic axes are known. Its right, up, and forward axes are world-space unit vectors; its origin is the canonical local origin. `hero.position`, `hero.target`, and `hero.up` are expressed in that local frame and bind the source camera with `registrationDigest`. `scopeParts` may name exact GLB parts whose current bounds control framing while the renderer retains all parts as whole-object context. Without `--frame`, the renderer deliberately reports and uses the legacy world-axis fallback.

The renderer has no default triangle-count ceiling. A well-justified asset may exceed 30,000 triangles; remove redundant geometry because it is redundant, not merely to satisfy an arbitrary count. Resource safety is enforced independently: geometry decode, framebuffer, and bounded tile scratch memory are estimated before rasterization; triangles are processed without a full-frame per-triangle allocation; and both an internal wall-clock deadline and a parent-process timeout stop stalled work. Use `--max-triangles N` only when a project or CI job intentionally declares a hard policy cap. `--tile-size` controls locality, while `--max-working-mb` is a safety budget rather than a quality setting. Failed preflight or timeout attempts do not publish a partial render set.

Review hero, oblique, side, top, grazing, normal, object-ID, and albedo views. The software renderer is the mandatory portable validation baseline, not a visual-fidelity renderer. After this basic gate passes, run an independent PBR-capable renderer—Blender Cycles/Eevee headless, Three.js/WebGL, Filament, glTF Sample Viewer, VTK, or an equivalent backend—and normalize its evidence as `refas.pbr-render-report/v1`.
Its `PASS` status and `claimScope: render-integrity-only` mean only that actual GLB geometry rasterized in every requested view. Read `materialSupport`; do not use this report alone to pass appearance or visual fidelity.

After the exact hero frame is registered to the source, create scope-local critique evidence from `assets/templates/registered-comparison-input.json`:

```bash
node scripts/refas.mjs compare \
  --input <project-dir>/registered-comparison-input.json \
  --out <project-dir>/reviews/registered-comparison \
  --timeout-seconds 120
```

The output retains each scope's ancestry and binds the source, asset, render frame, registration, hierarchy, input, and every generated image by digest. Inspect its whole context, registered crop, overlay, split, edge overlay, silhouette difference, landmark residuals, and normalized dimensions. These are `derived-observation-aid` artifacts: a better IoU or smaller residual cannot pass a visual gate, and a bad number cannot select rollback until the visible defect is localized as a typed finding.

RefAs ships one deterministic, dependency-light Cook–Torrance implementation as an independently executed fallback:

```bash
node scripts/refas.mjs render-pbr \
  --glb <asset.glb> \
  --out <project-dir>/renders/pbr \
  --frame <canonical-object-frame.json> \
  --timeout-seconds 180 \
  --max-working-mb 512
```

It supports base-color, metallic, and roughness factors. It explicitly reports clearcoat, image-based lighting, normal maps, and textures as unsupported. Prefer Blender, Three.js, Filament, glTF Sample Viewer, or VTK when the appearance claim needs those features; keep those renderers outside the RefAs distribution and adapt their outputs through the same report contract.

Copy `assets/templates/pbr-render-report.json` for the independent pass. Bind the exact asset and canonical-frame digests, renderer family/name/version/backend, fixed lighting rig, exposure/tone mapping/output color space, supported and unsupported material features, output frame digests, and reproducibility mode. A renderer's brand name never implies feature support. If the declared backend does not cover every required material feature, keep appearance insufficient and reopen the owning capability from the PBR evidence.

Create `reviews/visual-review.json` from `assets/templates/visual-review.json` with `createVisualReview`. Bind it to the exact source and asset SHA-256, identify whether the reference is independent or generated from the same fixture, record every standard view and visual gate verdict, cite the exact independent PBR report SHA-256 and renderer feature support, and retain every unresolved typed finding. Validate both reports before checkpointing:

```bash
node scripts/refas.mjs validate-spec --file <project-dir>/reviews/visual-review.json
node scripts/refas.mjs validate-spec --file <project-dir>/renders/pbr/render-report.json
```

Preview a visual finding route without mutating state:

```bash
node scripts/refas.mjs route --root <project-dir> --finding <finding.json>
```

After verifying the finding and evidence, apply its owner, rollback checkpoint, artifact restore, and invalidation set atomically:

```bash
node scripts/refas.mjs report-finding --root <project-dir> --finding <finding.json>
node scripts/refas.mjs resume --root <project-dir>
```

Do not restart unrelated upstream work. A blocker with insufficient evidence or unknown ownership does not mutate trustworthy state.

## Closure

Whole-object closure requires all of the following with current evidence:

- source identity is unchanged;
- hierarchy coverage is complete for visually material parts;
- primary-reference facts and explicit ambiguities exist;
- silhouette, proportions, curvature, topology, and relief are reviewed;
- attachment, occlusion, support, penetration, and child integrity pass;
- camera and render integrity pass;
- hero and diagnostic multiviews contain no unresolved blocking finding;
- one digest-bound `visual-review` artifact covers the exact source and asset bytes;
- the visual review uses an independent reference rather than a source generated from the candidate's own model specification;
- the renderer used to pass appearance supports every material feature required by the claim;
- project audit is valid.

Run:

```bash
node scripts/refas.mjs audit --root <project-dir>
node scripts/refas.mjs inspect-glb --glb <asset.glb>
node scripts/refas.mjs certify --root <project-dir>
```

The certification checkpoint must contain exactly the canonical closure gates and cite the visual-review artifact for every visual gate. A self-generated fixture may exercise runtime contracts, but it cannot receive a visual-fidelity certificate. A `fail` or `insufficient` verdict, any unresolved major/critical/blocking finding, or an integrity-only renderer claiming appearance causes certification to refuse closure. Run `resume` to receive `REQUEST_VISUAL_REVIEW` and the exact refusal reasons.

Closure is permission to publish the current evidence-bound state, not proof of unseen geometry.
