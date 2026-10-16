---
name: refas
description: Build and revise traceable, editable 3D assets from visual references using evidence-bound observation, whole-to-part modeling, real multiview renders, and local repair. Use for reference-driven 3D construction and assembly when shape fidelity matters; distinguish rendered/model validity from independently proven source resemblance.
---

# RefAs — Reference Asset Foundry

Construct a complete, coherent, editable 3D object from the visual reference. Establish whole volumes, repeated and paired structures, continuous curvature, thickness, and physical connections. Refine them through registered and orthogonal renders, then record source observations and construction choices with their respective provenance.

## Required reading

For a new reconstruction, read the small routing entry first:

1. `references/INDEX.md`
2. `references/workflow.md`

Load `references/checkpointing.md` **before** checkpoint/edit/restore operations,
and `references/failure-routing.md` **before** reporting, persisting or
repairing a typed finding. If `next` returns an invalidated or blocked state,
load both before making a state-changing edit. The runtime continues to
enforce those same contracts even if they are not preloaded.

`references/INDEX.md` is the canonical instruction router and defines the installed skill-root convention and semantic routing boundary. Do not bypass it when adding or loading a reference leaf.

Then load only the references owned by the active capability:

| Active work | Read |
|---|---|
| Source, hierarchy, observation | `references/observation.md`, `references/provenance.md` |
| Camera, depth, spatial inference | `references/spatial-reasoning.md` |
| Shape and surface construction | `references/construction.md`; also `references/parameter-fitting.md` when measurements should drive parameter updates |
| Organic or articulated manufactured shape | `references/organic-articulated-construction.md` after `references/construction.md` |
| Parent/child placement | `references/assembly.md` |
| Material identity and finish | `references/appearance.md` |
| Render, comparison, closure | `references/validation.md` |
| Conditional finalization and release authorization | Follow the chain in `references/INDEX.md`: `references/physical-fusion.md` when justified, then `references/realized-contact-support.md`, `references/validation.md`, and `references/claim-certification.md`; load `references/candidate-transactions.md` when sealing the evidence transaction |

Do not blend every reference into one undifferentiated prompt. Keep one capability and one visual scope active at a time.

## Modeling priorities

- Inspect the entire source and identify major masses, silhouette, repeated patterns, principal sections, and part relationships.
- Build a coherent whole with continuous side/back geometry, plausible thickness, support paths, and aligned attachments before adding detail.
- Reuse shared profiles and mirrored/repeated geometry when the structure supports them; fit deviations to the source.
- Compare the actual GLB in its registered reference camera and side, top, rear, and grazing views. Repair the largest geometric discrepancy first.
- Preserve the distinction between source observations, spatial hypotheses, and engineered construction choices in their respective artifacts.
- Preserve reusable children and trustworthy checkpoints for localized rework.

Source-bound approval uses independently bound original-source evidence and the existing contracts in `references/validation.md` and `references/claim-certification.md`. Geometry validity and resemblance are separate reported outcomes.

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

Inspect the original images directly. Request a derived observation aid for a specific visual question in a selected ROI; provide `question` and `decisionTarget` before generation.

```bash
node scripts/refas.mjs evidence --spec <project-dir>/evidence-request.json --out <project-dir>/reviews/observations --reuse
node scripts/refas.mjs evidence --assess <project-dir>/evidence-utility-decisions.json --out <project-dir>/reviews/observations --prune
```

Assess each requested analysis as `clarified`, `contradicted`, `insufficient`, or `no-benefit` and record its observed contribution and retention decision. Attribute model edits with exact before/after GLB SHA-256 and a localized finding. Preserve raw originals and SHA tombstones for eligible pruned derivatives. See `references/observation.md` for the data contract.

## Agent workflow and diagnostics

On an existing project, prefer querying the next trustworthy action before constructing more geometry. These commands are read-only facades over installed checkpoint/recovery and verification evaluators; they cannot create PASS verdicts or override source evidence.

```bash
node scripts/refas.mjs next --root <project-dir>
node scripts/refas.mjs diagnose --root <project-dir> --asset <project-dir>/candidate.glb
node scripts/refas.mjs diagnose --root <project-dir> --finding <project-dir>/finding.json
node scripts/refas.mjs validate --root <project-dir> --asset <project-dir>/candidate.glb
```

The canonical instruction graph registers these under `workflow/agent-next`,
`failure-routing/agent-diagnose`, and `validation/agent-validate-source-bound`.
Use `node scripts/refas.mjs describe node workflow`, `describe node
failure-routing`, or `describe node validation` to inspect the public
command contract without guessing the owning module.

A returned `workPlan` can be `command`, `construction`, `review`, or
`terminal`. Execute an `invocation` only when supplied; other actions
require evidence-guided modeling/review through their `instructionNode`.
`DONE` means the existing generic work is closed, **not** that a new
strict source-bound handoff was approved.

The `next` result gives the responsible capability and `refas describe capability <capability>` discovery pointer. `diagnose` reports existing checks, owners, supporting evidence and follow-up without mutating the project or inventing a repair category. `validate` is canonical source-bound QA, with exit 2 for a blocked result and exit 1 on invalid invocation. A valid GLB or an ordinary certificate is never proof of reference fidelity. Keep material creation, geometry edits and headless view inspection as the core workflow; do not turn the Foundry into a validator-only task.

## Reconstruction loop

Follow the semantic capability order in `references/workflow.md`.

1. Inspect the full frame and record source provenance.
2. Define the visual hierarchy from whole to feature.
3. Record observations for the active node; keep uncertainty explicit.
4. Select and compare spatial/camera hypotheses for the whole form.
5. Build complete dominant volumes, mirrored and repeated parts, major surface transitions, and physical attachments before decoration.
6. Pass the whole-shape dependency barrier: registered silhouette, major landmarks, principal sections, curvature transitions, and coarse negative spaces.
7. Anchor visible boundaries and relief to the reference projection.
8. When a parameterized shape backend exists, fit multiple owner-local geometry parameters through verified actual-render trials; inspect the selected trial before making it the edit's single checkpoint candidate. High-impact camera, pose, appearance, and lighting fitters remain owner-local and are sequenced by a non-authoritative camera → pose → shape coordinator.
9. Assemble closed children in a parent reference frame.
10. Add appearance only after geometry can explain the image.
11. Render the standard multiview set.
12. Log typed findings, route them to the owning capability, and repair only the invalidated span.
13. Certify the whole object only when every closure gate has current evidence.

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

An owner-local parameter fit may evaluate many digest-bound trials inside this transaction. Those trials are comparison evidence, not checkpoints. When an actual GLB and realized projection are available, use the optional `repairShapeFromProjection` backend to bind projection residuals to geometry parameters and return an advisory `KEEP`/`ROLLBACK`; only the visually inspected selected trial may become the transaction's one direct candidate. Camera and pose trials must preserve geometry bytes, while appearance and lighting trials must bind a frozen geometry digest. See `references/parameter-fitting.md`.

If work must stop before a decision, use `abort-edit`; it restores the baseline artifact bytes. On a fresh agent turn, run `resume` before mutating anything. It returns one safe checkpoint, one capability × scope, and one next action.

## Build geometry

### Build and review a coherent whole

Start from a closed volumetric blockout. Develop identity-bearing sections, curvature, junctions, openings, and attachment paths with the same construction logic around the whole body. Preserve meaningful paired and repeated geometry. Inspect registered, side, top, grazing, and neutral-clay renders; close the whole-shape barrier before accepting dependent detail.

Create `refas.construction-quality/v1` from
`assets/templates/construction-quality.json` before closing
`shape-reconstruction`. Validate it with `validate-spec`. An
`identity-bearing` claim fails when the candidate is generic-primitive-only,
lacks observed identity features, omits whole-context comparison, or leaves any
visible-form gate below pass. A `blockout` record may preserve exploratory work
but is not a trustworthy shape checkpoint and cannot license downstream detail.

Choose the construction backend that best preserves the evidence. Project-local
lofts, subdivision surfaces, sculpted cages, CAD/NURBS, booleans, or external
modeling tools are valid when their inputs, outputs, and provenance are
recorded. Dependency-light runtime helpers are never preferred over a more
faithful available method solely because they are bundled.

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

Use these as construction mechanisms, not visual assumptions. A sphere,
ellipsoid, capsule, cylinder, prism, or uniform revolution remains blockout
until evidence-fitted landmarks, sections, silhouette inflections, openings,
and curvature transitions replace its generic visible form. Additional
subdivision alone does not graduate it. Put asset-specific polygons,
proportions, sections, and hypotheses in the project model specification. Keep
them out of the reusable runtime.

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
bars, dark plates posing as holes, or a one-view cage.

## Render and review

Render the **actual current GLB**, not a static image stand-in. For each short geometry iteration, use the installed `appearance/iterative-pbr-preview` interface to inspect changed hero/side views; preview is non-certifying and cannot close appearance, source-fidelity or neutral-clay gates:

```bash
node scripts/refas.mjs preview-pbr --glb candidate.glb --frame frame.json --out renders/preview --views hero,side --reuse
```

For full canonical portable baseline, use `python3 scripts/render_glb.py --glb <asset.glb> --out <render-dir> --reference <reference.png> --frame <canonical-object-frame.json>` with explicit time and memory budgets. Review the real hero, oblique, side, top, grazing, normal, object-ID and albedo outputs. The frame axes must reflect the object; the hero camera must be registered to the real source by independent evidence. Missing `--frame` is a **legacy world-frame fallback**, not registration. A render-integrity `PASS` means geometry was rasterized, not that the source resembles it. COLOR_0/texture and other unsupported material appearances must be refused or explicitly excluded, never passed by flat-color substitution.

After the portable baseline, use a renderer independently covering every *required* material feature (Blender Cycles/Eevee, Filament, Three.js/WebGL, or the installed supported `node scripts/refas.mjs render-pbr` fallback) and record exact GLB/frame/renderer/lighting/output digests. Complete all current eight views at final scope. The iterative preview cannot replace this final evidence. For exact feature support, report requirements and user-visible limitations, load `references/appearance.md` and `references/validation.md` rather than guessing from an engine name.

For source-to-asset critique after registered camera admission, run `node scripts/refas.mjs compare --input <project-dir>/registered-comparison-input.json --out <project-dir>/reviews/registered-comparison`; these ROI, edge, landmark and silhouette overlays are **decision aids**, never automatic visual PASS or single-view IoU authority. For visual review, bind original source SHA, current GLB, all required actual render frame hashes, independent reviewer provenance, required material coverage and unresolved typed findings before invoking canonical checkpoint/claim validation. Never self-certify from a generated image.

Compose one noncertifying presentation board via `node scripts/refas.mjs review-board --portable <dir> --pbr <dir> --out <file.png>` (optional `--clay`). Route an existing finding read-only with `node scripts/refas.mjs route --root <project-dir> --finding <finding.json>`; only after independently verifying its owner and rollback lineage, use `node scripts/refas.mjs report-finding` then `resume`. Load `references/failure-routing.md` and `references/checkpointing.md` before edits. Unsupported evidence is `INSUFFICIENT`/`BLOCKED`, not success.

## Closure

Whole-object closure requires all of the following with current evidence:

- source identity is unchanged;
- hierarchy coverage is complete for visually material parts;
- primary-reference facts and explicit ambiguities exist;
- silhouette, proportions, curvature, topology, and relief are reviewed;
- the exact asset has a passing `refas.construction-quality/v1` record and registered whole-source comparison;
- attachment, occlusion, support, penetration, and child integrity pass;
- camera and render integrity pass;
- hero and diagnostic multiviews contain no unresolved blocking finding;
- one digest-bound `visual-review` artifact covers the exact source and asset bytes;
- the visual review uses an independent reference rather than a source generated from the candidate's own model specification;
- the renderer used to pass appearance supports every material feature required by the claim;
- project audit is valid.

Before final authorization, follow the conditional finalization/closure chain in `references/INDEX.md`. If logical fusion is physically finalized, validate that final GLB through `references/realized-contact-support.md`; then complete current visual validation and apply `references/claim-certification.md` to the sealed candidate/evidence transaction before issuing the whole-object certificate.

Run:

```bash
node scripts/refas.mjs audit --root <project-dir>
node scripts/refas.mjs inspect-glb --glb <asset.glb>
node scripts/refas.mjs certify --root <project-dir>
```

The certification checkpoint must contain exactly the canonical closure gates and cite the visual-review artifact for every visual gate. A self-generated fixture may exercise runtime contracts, but it cannot receive a visual-fidelity certificate. A `fail` or `insufficient` verdict, any unresolved major/critical/blocking finding, or an integrity-only renderer claiming appearance causes certification to refuse closure. Run `resume` to receive `REQUEST_VISUAL_REVIEW` and the exact refusal reasons.

A generic whole-object certificate records only the claims supported by its exact current evidence. It is not a substitute for strict source-bound final handoff, which remains blocked when independent original-photo semantics or other mandatory evidence is insufficient. Neither approval proves unseen geometry.
