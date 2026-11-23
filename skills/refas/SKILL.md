---
name: refas
description: Build and revise reference-driven 3D assets with Blender, preserve editable source and useful renders, and resume local changes from saved project revisions. Use for modeling from images and improving an existing asset.
---

# RefAs — Reference Asset Foundry

Create an editable 3D asset that answers the user's visual and practical requirements. Work from the original references, build a coherent whole, inspect actual renders, and improve the largest visible defect. Keep the successful model available for further edits and its intended use.

Use the Python production commands below to create and continue assets.

## Start with the asset

Inspect the supplied references before modeling. Establish the intended use, major proportions, distinctive shapes, important openings, materials, and any required movement. Use the user's existing decisions; ask only for missing information that would materially change the asset.

For clothing or articulated subjects intended for games or animation, make wearing or movement part of construction from the start. Use the actual target character or mechanism when available. A static figure is an intermediate result unless that is the requested deliverable. Declare the supported character, motion range, export consumer and asset budget; do useful work without inventing a universal game-ready profile.

Separate what the image shows from inferred depth and engineered choices. Complete plausible side and rear surfaces, while keeping hidden details identifiable as assumptions. Generated reference views, depth maps, and model renders are working aids rather than new observations of the original subject.

Build continuous major volumes and believable connections before small decoration. Reuse shared profiles and mirrored or repeated geometry where appropriate; preserve visible asymmetry. Choose Blender's existing modeling tools when they express the form well. A large number of primitives or polygons does not establish shape quality.

For surfaces that should form one continuous shell, derive adjoining regions from a shared boundary. Separately subdivided edges can open a crack even when their control points meet. Inspect the connection with the final modifiers from both sides before adding small detail; preserve intentional openings.

Load a construction guide only when its problem is present: `references/production-garments.md` for cloth transitions and folded collars, or `references/production-assemblies.md` for segmented hard surfaces, joint pivots and local pose checks.

Keep Boolean cutters and surface-fitting sources editable when later shape corrections depend on them. Explicitly mark only a construction **mesh** with `obj["refas_role"] = "construction"` and `obj.hide_render = True`; keep it enabled in the current scene and active view layer. The assembly guide shows editable negative-space construction, and the topology guide shows a retained projection source. Native revisions preserve these meshes while asset surface counts, framing and GLB exclude them. Ordinary hidden objects are not inferred to be construction sources.

For trim or hardware that must follow a deforming surface, the assembly guide also covers the optional `scripts/production/surface_binding.py` authoring helper. Bind to an explicitly selected outer triangle and move a section together; inspect neighboring sections and clearance after authoring the result.

Read `references/production-topology.md` when checking mesh defects, rebuilding topology, or optimizing an asset for delivery. Choose topology for the actual deformation and use; reducing polygon count alone does not establish useful retopology.

## Start or resume a production project

Paths below are relative to the installed skill root. Run the entry script by its absolute path if the working directory differs. Store the project outside the installed skill directory.

```bash
python3 scripts/produce.py doctor
python3 scripts/produce.py init --root PROJECT --name asset-name --reference ORIGINAL_IMAGE
python3 scripts/produce.py status --root PROJECT
```

Repeat `--reference` for multiple original files. A design brief without an image can start without that flag. Initialization copies the supplied references into the project; preserve those copies. `doctor` reports the available Python/Blender environment and `status` identifies the current revision and its files.

For existing work, inspect `status`, the current native scene, and its renders before editing. Read any retained intent and findings so that a new agent continues the same asset.

To adopt changed references, pass the complete desired set and the `sequence` returned by `status`:

```bash
python3 scripts/produce.py references --root PROJECT --reference ORIGINAL_IMAGE --reference UPDATED_BRIEF --expected-sequence SEQUENCE
```

This preserves the model and its history. Use `--clear` instead of reference flags to explicitly remove all active references. Identical file contents are a no-op regardless of paths or order. `status` and `verify` report `evidenceFreshness.status`: `current`, `stale`, or `no-revision`. `stale` means the current bundle used a different reference content set; its files can still have valid integrity. New references require a new edit/review before deciding visual acceptance.

## Build, inspect, revise

Write a normal Blender Python script using `bpy`. The worker executes it inside Blender; no RefAs geometry DSL, capability graph, or manually authored evidence JSON is required. Use meaningful object names and a scene organization that makes the next local edit clear. Batch related corrections into one useful edit rather than saving a new revision for every small operation.

```bash
python3 scripts/produce.py run --root PROJECT --script BUILD_SCRIPT --intent "build the complete primary form" --outputs native --views hero --size 384 --samples 8 --timeout 120
```

The CLI defaults to `--outputs native`: save the editable scene and requested views without GLB export or reimport. Its default view is `hero`; add a side or detail view only when it answers the current modeling question. Use `--views ''` when no render is needed. Without an explicit input, the first run starts from an empty scene, including no World datablock; create any scene resources your script needs. A subsequent run opens the current saved native scene before applying the script:

```bash
python3 scripts/produce.py run --root PROJECT --script EDIT_SCRIPT --intent "adjust the headband pad while preserving the earcups" --protect-object EarcupLeft --protect-object EarcupRight --views side
```

Use exact existing object names with repeated `--protect-object` flags to reject changes to their recorded native state and materials. Choose those names from the starting scene; the earcup names above are examples. The baseline is that scene at its starting frame, including objects imported from an explicit asset before the script runs. An edit script should modify the existing scene rather than recreate unrelated objects. Drivers and node-group internals are not exhaustive, and the guard does not approve all animation frames or visual quality.

To edit an existing asset, select either `--input-glb ASSET.glb` for a self-contained GLB or `--input-blend ASSET.blend` for a separately saved native. Each flag chooses the complete starting scene; it does not append objects to the current revision. Read `references/production-import.md` for this workflow and its preservation limits. Omit both flags on later edits to continue the saved native. Use Blender's Save As for manual edits; files returned by `status` are immutable revision files. The worker provides `bpy` and the absolute `REFAS_OUTPUT_DIR` to scripts; the production runner manages the native scene, selected outputs and revision metadata. Use `--expected-revision REVISION_ID --expected-sequence SEQUENCE` to require the revision and reference state you inspected.

1. **Construct the whole.** Resolve silhouette, proportions, thickness, negative space, and component relationships. For a character, establish face and body identity before clothing detail or accessories.
2. **Inspect real output.** Open the rendered images and compare them with the original reference. Choose a small number of views that reveal the current question: a side view for depth, a close view for a face, or a material-aware view for appearance. Request further views only for unresolved defects; do not generate a default pack of crops, videos, full arrays or reports.
3. **Make a focused correction.** State the visible problem and the parts to preserve. Change the responsible objects or parameters, then compare the new render with both the source and the prior revision.
4. **Keep or restore.** A successful command records an output revision; it does not decide whether the shape is better. Restore the earlier revision if the change damages accepted work or fails to improve the target defect.
5. **Continue only where useful.** Fix unresolved major defects before polish. If repeated edits do not help, reconsider camera, representation, or construction method instead of generating more reports.

Preserve UVs, materials, rigs, weights, shape keys, and object identity during local edits when the asset contains them. Inspect affected geometry and deformation, not only object counts. Saved fingerprints are change observations and can help locate unexpected edits; they do not prove deformation quality or game readiness.

Keep classic Blender `CURVE` objects editable during native iterations when their Bezier, POLY or NURBS controls express piping, cables or profiles well. Native save/reopen, renders and object protection retain their recorded controls, settings, shape keys and materials. Inspect the evaluated surface while editing the controls; tessellated mesh counts do not describe the control cage. Read the assembly guide for local curve edits and the topology guide before converting for delivery.

Use an editable Blender `LATTICE` cage for a broad local deformation when moving a few controls is useful. Ordinary `bpy` edits the cage and its Lattice modifier; native revisions retain the recorded grid, interpolation, controls, groups, shape keys and animation. Inspect the cage's compact summary and the affected host's evaluated surface separately. Read the assembly guide for cage placement, protection and delivery.

Before delivery, inspect unintended openings, winding, intersections and unsupported attachments on evaluated geometry and on the reopened export. Classify intentional neck/cuff openings and separate moving parts explicitly. Exercise wearing or motion through useful intermediate states, then retopologize or reduce excessive geometry while retaining the source design and protected data. Keep the detailed source and compare the optimized candidate under fixed views and the same poses.

Use a temporary native observation to answer a specific geometry question without making another revision or render:

```bash
python3 scripts/produce.py inspect --root PROJECT --object SleeveLeft --frame 1 --frame 24 --topology
```

To inspect a standalone native before adopting it into a project, replace
`--root PROJECT` with `--input-blend EXISTING.blend`. The same read-only query
uses the original file directly and verifies its unchanged hash; it does not
create a project or copy the model. Its result has `revision: null` and no
project reference-freshness claim. Revision/sequence guards require `--root`.

The compact JSON describes the requested objects and frames; omit object selection for a scene overview and omit frames for the saved current frame. `--topology` adds complete mesh-condition counts, including the evaluated tessellation of supported classic curves, without location samples. Use `--topology-details` instead when you need bounded locations for selected objects and frames. This read creates no project revision or permanent diagnostic files. It does not establish full-scene collision clearance, continuous animation quality or engine readiness. Retain detailed diagnostics only when needed to resolve a defect.

For before/after comparison, keep the camera and lighting fixed. Pass `--review-spec REVIEW_JSON` to capture explicit orthographic views and a fixed light rig with the revision; omit `--views` to render all views in that file. Read `references/production-review.md` when defining those views. The default views frame the current bounding box and can move when geometry changes. Neither route establishes registration to the source image.

Optional `compare` measures coverage changes in fixed transparent views and explicit regions. Read the review guide for limits; it never approves target improvement or promotes a baseline.

Each `run` captures its starting asset, script and supplied render/review options and records fresh outputs together. Pass the desired options on each run; prior options are not implicit defaults. External originals can change without altering their captured historical copies.

Native `run` submissions accept portable scenes with visible meshes and classic `CURVE` objects, explicitly marked construction meshes, editable `LATTICE` control cages and packed still-image textures. Link cages to the scene and keep them enabled and visible in the active view layer; a cage may have `hide_render` set because it is not a renderable surface. Unmarked hidden mesh/curve geometry, disabled or excluded construction sources, text (`FONT`), `SURFACE`, modern hair `CURVES` and object instances remain unsupported; convert or realize them explicitly before submission. Temporary `inspect` queries can describe other object types without approving them for submission.

Delivery remains mesh-only and refuses unconverted curves. Choose the final curves and convert them through ordinary `bpy` in a recoverable `run --outputs delivery`; earlier native revisions keep their editable controls. Conversion at one frame does not preserve curve shape-key or geometry animation. Intentionally bake or rebuild required motion in a supported mesh representation and verify the exported playback before delivery.

Delivery also rejects every remaining scene `LATTICE`. For a static result, apply the intended deformation at the selected frame and remove the cage in a recoverable edit before delivery. Keep the editable cage in the earlier native revision. This does not automatically bake cage or shape-key animation; resolve required motion deliberately before removing its controls.

Other supported static mesh modifiers stay editable in the native scene and are evaluated for GLB export. Match each modifier's viewport/render visibility and enabled subdivision levels, or apply the intended geometry: inventory and export use the viewport dependency graph, while Cycles uses render settings. For curves, set `render_resolution_u` to `0` (reuse viewport resolution) or match every non-POLY spline's `resolution_u`. Delivery additionally rejects unapplied non-armature modifiers on skinned or shape-key meshes; resolve those before export. Dirty packed textures are refreshed before the native save.

Construction meshes remain in the delivered `.blend`; the GLB contains the evaluated asset without those source surfaces. Static modifier evaluation uses the selected frame and does not bake source-driven animation. Do not parent deliverable objects to a construction mesh. Select construction sources explicitly with `inspect --object` or `--protect-object` when inspecting or preserving them; protecting a host also protects its recorded evaluated shape and modifier target identity.

## Keep source, review, and recovery connected

Each successful production revision retains the editable `.blend`, actual requested renders, script and machine-recorded metadata; delivery revisions also retain GLB. The runner verifies recorded file integrity and prevents a failed or stale run from silently replacing the current revision. Blender scripts execute as trusted local code; the runner is not a security sandbox.

```bash
python3 scripts/produce.py verify --root PROJECT
python3 scripts/produce.py restore --root PROJECT --revision REVISION_ID
```

Use `verify` to check the recorded project artifacts, and inspect `status` after recovery. Restore publishes the selected prior bundle as a new revision and retains history and the currently active references. A restored bundle can therefore be `stale`; restore does not silently re-adopt its old references. Add `--expected-revision` and `--expected-sequence` to protect a planned restore from concurrent changes. File hashes show which bytes were saved; they do not judge resemblance, topology quality, or usability in a game engine. If the project reports missing or changed artifacts, resolve that condition before building on them.

Do not hide an unavailable Blender backend by generating a substitute preview and calling the run successful. Explain the concrete execution failure, retain the prior usable revision, and repair the toolchain or script.

Successful runs retain compact execution metadata. Add `--keep-diagnostics` to a run or delivery only when its raw job and Blender log are needed for debugging; failed-run diagnostics remain available.

Keep one working project and measure its storage before making copies:

```bash
python3 scripts/produce.py storage --root PROJECT
python3 scripts/produce.py compact --root PROJECT
python3 scripts/produce.py compact --root PROJECT --apply
```

`compact` previews redundant payload copies in committed run directories; `--apply` removes only copies that exactly match retained revisions. It preserves checkpoints, source files and failed runs. New successful runs move their payload into revision storage. Do not replace this bounded cleanup with deletion of old assets or history.

## Review and deliver

Export when the selected native is ready for a handoff or when a specific export question needs testing:

```bash
python3 scripts/produce.py doctor --check-export
python3 scripts/produce.py deliver --root PROJECT
```

`deliver` exports the current native without rerunning an edit script. Use `run --outputs delivery` when a final edit and export belong together. Delivery saves native and GLB and defaults to `hero,side`; explicit `--views` or a review specification controls requested renders. `doctor --check-export` checks exporter capabilities and its guarded skin-weight path, not asset quality or engine readiness.

Hand off one selected native/export pair and the necessary scripts, textures and source resources, with only useful review images. Keep recovery history in the working project rather than creating checkpoint archives for each turn. Report the selected revision, useful changes and remaining findings concisely in chat or one summary; keep large logs and full diagnostic arrays for a concrete debugging need. Preserve existing assets and history.

Review three separate questions:

- **Reference fit:** Do silhouette, proportions, distinctive parts, and appearance match the source-visible design? Mark uncertain or invented details as such.
- **Asset condition:** Are unintended holes, reversed faces, intersections and floating attachments resolved? Are topology, materials, UVs and required deformations suitable for the intended use? Report the tested surfaces and intentional exceptions.
- **Target readiness:** Can the actual character wear the garment, or can the assembly perform its declared motion with connected parts? Has the engine/export consumer exercised skinning or animation and the chosen geometry/material budget? An exported GLB alone is not an engine test.

A render or technical check can support only the claim it actually demonstrates. Report a prototype as a prototype. Human visual acceptance, technical verification, and a future automated resemblance evaluator are separate evidence.

For an existing production project, inspect `status` and continue its revisions.
If the source is specifically a saved RefAs 1.x project, the import guide also
describes selecting an archived asset with `import-v1`; previous approvals do
not approve the new output.
