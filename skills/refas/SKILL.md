---
name: refas
description: Build and revise reference-driven 3D assets with Blender, preserve editable source and useful renders, and resume local changes from saved project revisions. Use for modeling from images and improving an existing asset.
---

# RefAs — Reference Asset Foundry

Create an editable 3D asset that answers the user's visual and practical requirements. Work from the original references, build a coherent whole, inspect actual renders, and improve the largest visible defect. Keep the successful model available for further edits and its intended use.

## Turn the reference into editable form

Inspect the complete original reference before modeling. Establish the intended use and any required movement from the user's request. Use existing decisions; ask only for missing information that would materially change the asset. Separate source-visible shape from inferred depth and engineered choices. Generated views and model renders are working aids, not new observations of the original.

Translate visible features into geometry you can actually edit: primary landmark positions, changes of section, opening boundaries and relations between parts. Use a common scene frame. Put those choices into the points, profiles or cage vertices that control the form, then render the combined result. Correct a visible discrepancy through its responsible controls; let that need determine the technique. This does not require a separate landmark report or parameter framework.

Resolve primary volume, proportions and negative spaces before small decoration. Inspect a neutral material from source-relevant angles. A smooth envelope needs additional sections or a different cage when it cannot express a defining ridge, hollow or return; more polygons or smoothing cannot supply that missing design. Keep defining surface transitions visible in the geometry. Return to broad proportions whenever the assembled result loses the reference's shape or appeal.

Construct adjoining surfaces from shared design boundaries and inspect their evaluated connection. Separate parts when motion, a real seam or construction requires it; inspect their combined form throughout. Choose a blockout, connected patches, sculpt, curves, lattice or ordinary mesh edits for the shape they allow you to control. No technique or helper-call sequence is compulsory.

For clothing or articulated subjects, use the actual target character or mechanism when available. Build wearing and movement into the construction when required, and preserve source-visible asymmetry. A static figure is an intermediate result unless it is the requested deliverable.

## Build and continue the native asset

Paths are relative to the installed skill root. Use the entry script's absolute path from another directory. Store the project outside the skill.

```bash
python3 scripts/produce.py doctor
python3 scripts/produce.py init --root PROJECT --name asset-name --reference ORIGINAL_IMAGE
python3 scripts/produce.py status --root PROJECT
```

Repeat `--reference` for multiple original files; a text-only brief can omit it. For existing work, inspect the current native, renders and retained intent from `status` before editing.

Write ordinary Blender Python using `bpy`, meaningful object names and a scene organization that makes the next edit clear. Without an explicit input asset, the first run starts from an empty scene, including no World datablock; create needed scene resources. Later runs without an explicit input open the current saved native before executing the edit script. Batch related corrections into one useful edit. The worker provides `bpy`, importable helper modules and `REFAS_OUTPUT_DIR`.

Choose views that expose the current source-shape question. For repeatable framing, define a small fixed view specification with `references/production-review.md` and reuse it on compared runs:

```bash
python3 scripts/produce.py run --root PROJECT --script BUILD_SCRIPT \
  --intent "build the complete primary form" --review-spec REVIEW_JSON
```

A view specification is optional; `--views front,side` selects built-in views when useful. Those views reframe to current bounds, so do not treat them as a fixed comparison or source-camera registration. Pass the desired review/view settings each run. Native output is the default; use `--views ''` when no image is needed.

To start from an existing asset, use `--input-blend EXISTING.blend` or `--input-glb EXISTING.glb` once, then omit it to continue the saved native. Read `references/production-project.md` for input selection, supported scene data, changed references, exact object protection and recovery. Preserve required UVs, materials, rigs, weights, shape keys and object identity during local edits. Use a separate Save As file for manual edits; recorded revisions remain immutable.

## Revise from visible differences

1. **Construct the whole.** Resolve silhouette, proportions, thickness, negative space, and component relationships. For a character, establish face and body identity before clothing detail or accessories.
2. **Inspect real output.** Open the rendered images and compare them with the original reference. Choose views for the current question and inspect the affected detail in its whole-object context.
3. **Make a focused correction.** State the visible problem and the parts to preserve. Change the responsible objects or parameters, then compare the new render with both the source and the prior revision.
4. **Keep or restore.** A successful command records an output revision; it does not decide whether the shape is better. Restore the earlier revision if the change damages accepted work or fails to improve the target defect.
5. **Reconsider an unproductive approach.** If repeated edits do not improve the visible difference, change the controls, camera or construction method. Fix unresolved major shape defects before polish; more reports are not a modeling correction.

```bash
python3 scripts/produce.py restore --root PROJECT --revision REVISION_ID
```

Use temporary `inspect --root PROJECT --object NAME` queries for a bounded scene question. Add topology details or motion frames only when needed. Use `verify` when checking recorded artifact integrity; hashes and topology counts do not judge resemblance or usability.

## Use an operation guide when the geometry needs it

Choose the intended geometry edit before looking up a helper. The catalogue returns exact callable signatures, prerequisites and guide sections:

```bash
python3 scripts/produce.py authoring-capabilities --query "bridge"
```

Read the matching section, not every guide. Ordinary `bpy` remains available when no helper fits.

| Current need | Guide |
| --- | --- |
| Whole volume, sculpting, cuts, grooves and unions | `references/production-form.md` |
| Corresponding sections, shared boundaries, attachment, curves, lattice or rigid joints | `references/production-assemblies.md` |
| Cloth transitions, folds and garment construction | `references/production-garments.md` |
| Fixed comparison views and source-view interpretation | `references/production-review.md` |
| Mesh defects, retopology, optimization and output compatibility | `references/production-topology.md` |
| Project/input lifecycle, scene support, preservation, recovery or execution failure | `references/production-project.md` |

## Deliver the selected result

Export for the requested handoff or a specific export investigation:

```bash
python3 scripts/produce.py deliver --root PROJECT
```

`deliver` exports the current native without rerunning its script. Use `run --outputs delivery` when a final edit and export belong together. Read the topology/project guide for explicit curve or lattice conversion, modifiers and animation limits. Keep an editable source and inspect the reopened export, affected connections and any required movement in the intended consumer.

Hand off one selected native/export pair, necessary source resources and useful review images. Keep recovery history in the working project. Report reference fit, asset condition and actual target use separately, with remaining visible defects and untested behavior. A prototype should remain described as a prototype; a relative improvement over a poor candidate does not establish source fidelity.
