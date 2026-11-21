---
name: refas
description: Build and revise reference-driven 3D assets with Blender, preserve editable source and useful renders, and resume local changes from saved project revisions. Use for modeling from images and improving an existing asset.
---

# RefAs — Reference Asset Foundry

Create an editable 3D asset that answers the user's visual and practical requirements. Work from the original references, build a coherent whole, inspect actual renders, and improve the largest visible defect. Keep the successful model available for further edits.

This is the **2.0 production workflow under development**, not a published 2.0 release. The Python commands below are the entry for new production projects. The existing 1.x runtime remains available for its saved projects and explicit certification contracts.

## Start with the asset

Inspect the supplied references before modeling. Establish the intended use, major proportions, distinctive shapes, important openings, materials, and any required movement. Use the user's existing decisions; ask only for missing information that would materially change the asset.

Separate what the image shows from inferred depth and engineered choices. Complete plausible side and rear surfaces, while keeping hidden details identifiable as assumptions. Generated reference views, depth maps, and model renders are working aids rather than new observations of the original subject.

Build continuous major volumes and believable connections before small decoration. Reuse shared profiles and mirrored or repeated geometry where appropriate; preserve visible asymmetry. Choose Blender's existing modeling tools when they express the form well. A large number of primitives or polygons does not establish shape quality.

For surfaces that should form one continuous shell, derive adjoining regions from a shared boundary. Separately subdivided edges can open a crack even when their control points meet. Inspect the connection with the final modifiers from both sides before adding small detail; preserve intentional openings.

Load a construction guide only when its problem is present: `references/production-garments.md` for cloth transitions and folded collars, or `references/production-assemblies.md` for segmented hard surfaces, joint pivots and local pose checks. These guides support ordinary Blender authoring without the 1.x certification loop.

## Start or resume a production project

Paths below are relative to the installed skill root. Run the entry script by its absolute path if the working directory differs. Store the project outside the installed skill directory.

```bash
python3 scripts/produce.py doctor
python3 scripts/produce.py init --root PROJECT --name asset-name --reference ORIGINAL_IMAGE
python3 scripts/produce.py status --root PROJECT
```

Repeat `--reference` for multiple original files. A design brief without an image can start without that flag. Initialization copies the supplied references into the project; preserve those copies. `doctor` reports the available Python/Blender environment and `status` identifies the current revision and its files.

For existing work, inspect `status`, the current native scene, and its renders before editing. Read any retained intent and findings so that a new agent continues the same asset. A production project and a 1.x project have different state formats; do not treat one as the other.

## Build, inspect, revise

Write a normal Blender Python script using `bpy`. The worker executes it inside Blender; no RefAs geometry DSL, capability graph, or manually authored evidence JSON is required. Use meaningful object names and a scene organization that makes the next local edit clear.

```bash
python3 scripts/produce.py run --root PROJECT --script BUILD_SCRIPT --intent "build the complete primary form" --views hero,side --size 384 --samples 8 --timeout 120
```

The first run starts from an empty scene, including no World datablock. Create any scene resources your script needs. A subsequent run opens the current saved native scene before applying the script:

```bash
python3 scripts/produce.py run --root PROJECT --script EDIT_SCRIPT --intent "adjust the headband pad while preserving the earcups" --views hero,side --size 384 --samples 8 --timeout 120
```

Use `--input-blend PATH` to import a separately saved manual edit. An edit script should modify the existing scene rather than recreate unrelated objects. The worker provides `bpy` and the absolute `REFAS_OUTPUT_DIR` to scripts; the production runner manages the native scene, GLB export, requested renders, and revision metadata. Use `--expected-revision REVISION_ID` when an edit must start from the exact revision you inspected.

1. **Construct the whole.** Resolve silhouette, proportions, thickness, negative space, and component relationships. For a character, establish face and body identity before clothing detail or accessories.
2. **Inspect real output.** Open the rendered images and compare them with the original reference. Choose views that reveal the current question: a side view for depth, a close view for a face, or a material-aware view for appearance. Use enough views to expose hidden defects; no fixed eight-view pack is required for every edit.
3. **Make a focused correction.** State the visible problem and the parts to preserve. Change the responsible objects or parameters, then compare the new render with both the source and the prior revision.
4. **Keep or restore.** A successful command records an output revision; it does not decide whether the shape is better. Restore the earlier revision if the change damages accepted work or fails to improve the target defect.
5. **Continue only where useful.** Fix unresolved major defects before polish. If repeated edits do not help, reconsider camera, representation, or construction method instead of generating more reports.

Preserve UVs, materials, rigs, weights, shape keys, and object identity during local edits when the asset contains them. Inspect affected geometry and deformation, not only object counts. Saved fingerprints are change observations and can help locate unexpected edits; they do not prove deformation quality or game readiness.

For before/after comparison, keep the camera and lighting fixed. Pass `--review-spec REVIEW_JSON` to capture explicit orthographic views and a fixed light rig with the revision; omit `--views` to render all views in that file. Read `references/production-review.md` when defining those views. The default views frame the current bounding box and can move when geometry changes. Neither route establishes registration to the source image.

The current export scope uses visible meshes and packed still-image textures. Convert curves or text to meshes and realize object instances first; inspection rejects unsupported object scopes instead of silently dropping them. Static mesh modifiers stay editable in the native scene and are evaluated for GLB export. This alpha rejects hidden/excluded meshes and unapplied non-armature modifiers on skinned or shape-key meshes; resolve those explicit limitations before submission. Dirty packed textures are refreshed before the native save.

## Keep source, review, and recovery connected

Each successful production revision retains the editable `.blend`, exported GLB, actual requested renders, script, and machine-recorded metadata. The runner verifies recorded file integrity and prevents a failed or stale run from silently replacing the current revision. Blender scripts execute as trusted local code; the runner is not a security sandbox.

```bash
python3 scripts/produce.py verify --root PROJECT
python3 scripts/produce.py restore --root PROJECT --revision REVISION_ID
```

Use `verify` to check the recorded project artifacts, and inspect `status` after recovery. Restore publishes the selected prior bundle as a new revision and retains history. File hashes show which bytes were saved; they do not judge resemblance, topology quality, or usability in a game engine. If the project reports missing or changed artifacts, resolve that condition before building on them.

Do not hide an unavailable Blender backend by generating a substitute preview and calling the run successful. Explain the concrete execution failure, retain the prior usable revision, and repair the toolchain or script.

## Review and deliver

Deliver the native project, GLB, necessary textures or other source resources, useful actual renders, and the scripts needed for the completed work. Identify the selected revision and explain any unresolved visual or technical findings.

Review three separate questions:

- **Reference fit:** Do silhouette, proportions, distinctive parts, and appearance match the source-visible design? Mark uncertain or invented details as such.
- **Asset condition:** Are geometry, connections, materials, UVs, and required deformations suitable for the intended use? Make checks proportional to the asset.
- **Target readiness:** Has the actual requested engine/export path been exercised, including animation and budgets when relevant? An exported GLB alone is not an engine test.

A render or technical check can support only the claim it actually demonstrates. Report a prototype as a prototype. Human visual acceptance, technical verification, and a future automated resemblance evaluator are separate evidence.

## Optional 1.x project compatibility

Use this route only to resume a saved 1.x project or when the user explicitly needs its existing source-bound or physical certification contracts. Do not preload this reference stack for the production workflow above.

Read `references/INDEX.md`, then its active `references/workflow.md` route. The 1.x commands remain `node scripts/refas.mjs next`, `diagnose`, and `validate`; they keep their existing state and authority semantics. Load `references/checkpointing.md` before 1.x checkpoint/edit/restore operations and `references/failure-routing.md` for typed repair. Source-bound approval remains governed by `references/validation.md` and `references/claim-certification.md`.

The new production `verify` command is an artifact integrity check and does not issue a 1.x certificate. Keeping this compatibility route reachable does not make its fixed capability progression a prerequisite for producing a new asset.
