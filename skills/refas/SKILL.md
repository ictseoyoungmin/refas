---
name: refas
description: Build and revise traceable, editable 3D assets from visual references using evidence-bound observation, whole-to-part modeling, real multiview renders, and local repair. Distinguish asset validity from independently proven source resemblance.
---

# RefAs — Reference Asset Foundry

**Deliver an actual, recognizable, editable 3D asset, not a collection of passing checklists.** Preserve exact source evidence and recoverable construction state. RefAs helps an agent observe → construct → render → compare → repair; it does not generate a 3D model by itself.

## Modeling priorities

- Build a coherent whole with continuous side/back geometry, evidence-fitted profiles, and real thickness before decorative detail.
- Reuse shared profiles and mirrored/repeated geometry where the source supports them; preserve measured asymmetries.
- Prioritize actual visual improvement over the number of passing checklists.

Source-bound approval requires independent original-source evidence; modeling previews, GLB integrity and generic project audit cannot authorize it.

## Read only the active instructions

1. For a new project read `references/INDEX.md`, then `references/workflow.md`. The index is the canonical installed-skill router; load just the leaf for the current capability.
2. For an observation question read `references/observation.md` and `references/provenance.md`; for camera/depth choices read `references/spatial-reasoning.md`.
3. For actual shape construction read `references/construction.md`; add `references/organic-articulated-construction.md` only for relevant organic or articulated work, and `references/parameter-fitting.md` only when fitting parameters.
4. Load `references/checkpointing.md` before checkpoint/edit/restore operations. Before persisting or repairing a typed finding read `references/failure-routing.md`. If `next` returns a blocked or invalidated state, read both before changing project state.
5. For source comparison and final review read `references/validation.md`. For appearance use `references/appearance.md`; for assembly use `references/assembly.md`. Follow the conditional finalization chain in `references/INDEX.md` only when the requested claim requires it.

Do not preload every contract, physical subsystem or template for a static prop. Paths are relative to the installed skill root; never assume repository-root files are installed.

## Start or resume

Use a separate project directory; never write output into the installed skill. For a new project with an original image:

```bash
node scripts/refas.mjs source-manifest --root PROJECT --image PROJECT/source/reference.png --id primary --out PROJECT/source/source-manifest.json
node scripts/refas.mjs init --root PROJECT --project asset-id --source PROJECT/source/source-manifest.json
node scripts/refas.mjs next --root PROJECT
```

For an existing project:

```bash
node scripts/refas.mjs resume --root PROJECT
node scripts/refas.mjs next --root PROJECT
node scripts/refas.mjs diagnose --root PROJECT --asset PROJECT/candidate.glb
```

`next`, `diagnose` and `validate` are read-only. Use `node scripts/refas.mjs describe node workflow`, `describe node failure-routing` or `describe node validation` for current public command contracts. Do not confuse a generic `DONE`/`audit PASS` with independently approved source-bound handoff.

## Prioritize construction and visible improvement

1. Inspect the **raw original** in whole-object context. Identify proportions, silhouette, major volumes, identity-bearing parts, important holes and relations. Record observed facts separately from inferred depth and engineered details. Do not claim to have observed hidden faces.
2. Select explicit camera/depth alternatives where ambiguous. A rendered hero view is not **registered** until source-to-camera evidence proves it; do not use an arbitrary matching-looking view as source-fidelity proof.
3. Build coherent, editable major masses and continuous curvature first. Use evidence-fitted sections, curves, lofts, cages, genuine apertures and connected attachments when appropriate. A cluster of generic boxes, spheres and cylinders is only a blockout, not a credible identity-bearing whole.
4. Re-render the actual current GLB and inspect the source mismatch. Fix the largest owned defect before adding cosmetic detail. Local edits must not silently damage previously correct geometry.
5. Do not spend a short iteration generating every final proof. Use relevant hero/side/diagnostic previews for *work in progress*; retain exact original bytes and attribution. Final delivery still requires the applicable full current evidence and strict gates.

Built-in geometry helpers (such as hard-surface shell, profile loft, subdivision cage and GLB assembly) are optional mechanisms, **not** superior to a more faithful available Blender or other external workflow. See `references/construction.md`; do not recreate specialized authoring tools purely to avoid an external backend.

## Use diagnostic evidence only for what it can show

- Verify camera framing and the full visible object before ranking a comparison. A square crop, different viewpoint or unclipped-looking render alone is not camera registration.
- Neutral clay can help evaluate silhouette and shape **only when its image actually reveals the required surfaces**. A two-tone object mask cannot establish local curvature, relief or wood grain. Texture, color, patina, emission and roughness belong to a material-aware pass.
- An object-ID or normal image must encode the requested distinction; a file existing on disk is not enough. If it cannot answer the current visual question, report the evidence as insufficient and choose a suitable view rather than inventing a geometry defect.
- Digest and render-integrity PASS mean the exact model was processed; they never mean it resembles the source. Registered overlays and IoU are comparison aids, not independent positive identity authority.

Short non-certifying appearance preview:

```bash
node scripts/refas.mjs preview-pbr --glb candidate.glb --frame frame.json --out renders/preview --views hero,side --reuse
```

Full canonical portable capture uses `python3 scripts/render_glb.py --glb ASSET --out DIR --reference SOURCE --frame FRAME`, with explicit resource limits. Inspect hero, oblique, side, top, grazing, normal, object-ID and albedo at final scope, then use independently feature-supported appearance rendering as required. The missing `--frame` world-frame fallback is not a registered source camera. For exact requirements use `references/validation.md` and `references/appearance.md`.

## Keep recoverable, owner-local edits

- Before modifying protected construction, open a bounded edit for one responsible capability and scope. Read `references/checkpointing.md`; a committed checkpoint binds actual files and SHA-256, not a progress note.
- Evaluate real candidates and their rendered differences; keep at most one selected candidate checkpoint per bounded edit. Restore real baseline bytes if it fails; do not rewrite a `ROLLBACK_EDIT` as success.
- Existing projection/parameter fitting is advisory and owner-local. A solver's `KEEP` ranking never substitutes for source review or structural/relational eligibility. Camera and shape variables have different owners; preserve exact candidate provenance.
- If evidence is insufficient, first distinguish incorrect geometry, camera/frame mismatch, missing observation and an inapplicable test. Do not blindly modify a mesh in response to an `INSUFFICIENT` verdict.

```bash
node scripts/refas.mjs begin-edit --root PROJECT --owner shape-reconstruction --scope whole --intent 'correct lid silhouette'
node scripts/refas.mjs finish-edit --root PROJECT --candidate CHECKPOINT --before before.json --after after.json --findings findings.json
```

Commands above show the interface, not a waiver of the checkpoint or source-evidence requirements. Use `abort-edit` to roll back an unfinished transaction and `resume` on a fresh agent turn.

## Check the right claim, then deliver honestly

During blockout, **continue constructive experimentation** even if independent final resemblance proof is not yet available; call it a draft. Do not fabricate a PASS, promote inferred geometry to observed, or bypass integrity/recovery checks. Physical semantics are conditional on the asset and claim, not a universal requirement for every decorative prop.

```bash
node scripts/refas.mjs audit --root PROJECT
node scripts/refas.mjs inspect-glb --glb PROJECT/candidate.glb
node scripts/refas.mjs validate --root PROJECT --asset PROJECT/candidate.glb
```

`audit` checks recorded state; it does not establish geometry correctness or source likeness. `validate` is the strict source-bound coverage interface and exits 2 when blocked. For final claim/certificate/handoff, load `references/INDEX.md`, `references/validation.md`, `references/claim-certification.md` and conditionally `references/candidate-transactions.md` or applicable physical leaves. A valid GLB, present renderer report, generic certificate or attractive preview cannot stand in for independent source evidence.

**Deliverables:** exact GLB, editable source/modeling inputs, source and camera hypotheses, useful actual review renders, a concise outstanding-findings list, and an explicit draft/verified/blocked status. Spend the next useful action on visible asset improvement rather than repeating unchanged paperwork.
