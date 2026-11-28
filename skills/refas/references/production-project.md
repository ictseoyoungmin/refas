# Native project, input and delivery

Read the relevant section when managing project inputs, native compatibility, recovery or export. The main modeling loop stays in `SKILL.md`.

## Start from an existing asset

Use an existing GLB or separately saved Blender scene as the starting point for
an ordinary production edit. Initialize a project if needed, keeping it outside
the installed skill; include original references when available.

```bash
python3 scripts/produce.py init --root PROJECT --name revised-asset
python3 scripts/produce.py run --root PROJECT --input-glb EXISTING.glb \
  --script EDIT_SCRIPT --intent "refine the requested part while preserving the assembly" \
  --views hero
python3 scripts/produce.py status --root PROJECT
```

Write the edit script with normal `bpy` operations on the imported scene. Use
exact imported object names with repeated `--protect-object NAME` flags for
parts whose recorded state and materials must stay unchanged. Protection starts
after loading the asset and before applying the script, at the starting frame.
It does not establish all-frame or visual preservation.

## Choose the starting scene

| Input choice for `run` | Starting scene |
| --- | --- |
| Neither input flag | Current saved native, or an empty scene before the first revision |
| `--input-glb EXISTING.glb` | Blender scene reconstructed from that self-contained GLB |
| `--input-blend MANUAL.blend` | The separately saved native scene |

Choose at most one explicit input. An explicit asset supplies the complete
starting scene for this run; it is not appended to the current model. Earlier
project revisions remain available for recovery. Omit both flags on subsequent
edits to continue the new native instead of importing the original asset again.

The GLB must embed its buffers and images; external files and URLs are not
captured. The successful revision retains the exact GLB bytes as
`inputs/base.glb`, alongside the edit script and new native. No intermediate
manual `.blend` conversion is required. Use the normal `verify` and `restore`
commands for project integrity and recovery.

`run` keeps the native-output default and only the requested views. Use
`deliver` when the current native is ready for export, or `run --outputs delivery`
when the final edit and export belong together. Read the topology guide for
curve conversion, modifiers and other delivery limits.

## Preserve what the source contains

GLB carries supported glTF scene data; it cannot recover original modifiers,
construction scripts, sculpt history or other authoring data absent from the
file. Inspect the imported geometry, materials, UVs, skin weights, shape keys
and animation that matter to the edit. Preserve them deliberately and verify
the actual output in its intended consumer. Successful import and native
save/reopen do not establish reference likeness, lossless conversion of every
feature or game readiness.

For a separately edited `.blend`, use Blender's Save As and pass that separate
file to `--input-blend`. Keep stored project revision files immutable. Both
input routes use the production worker's supported scene and output scope.

## Adopt an asset from a saved 1.x project

Use `import-v1` when continuing an asset recorded in a saved RefAs 1.x project.
Choose the intended checkpoint and asset from `.refas/project.json` and its
`.refas/checkpoints/CHECKPOINT_ID.json`. The current old head may contain review
records rather than a model. Inspect the recorded artifact paths and choose
deliberately; an import does not accept a candidate merely because it exists.

```bash
python3 scripts/produce.py import-v1 --root NEW_PROJECT \
  --source-project OLD_PROJECT --checkpoint CHECKPOINT_ID \
  --artifact assets/selected.glb --name imported-asset --views front,side
```

The destination must be new and separate from the old project and installed
skill. Select a recorded uncompressed `.blend` with packed textures and no
linked libraries, or a self-contained supported `.glb`. The command
reads the chosen content-addressed checkpoint bytes, checks their size/hash,
captures the source reference and provenance, then creates a new production
revision with real native, GLB and requested render output. Normal Blender,
view, review, size, samples and timeout options apply.

The old project's live asset path may have uncommitted changes. Those changes
are not the selected checkpoint. The importer uses its archived bytes and
preserves the original project. It refuses missing, ambiguous, corrupt or unsafe
selections. Read the retained import report and inspect actual output before
continuing with ordinary `run` edits.

| Selected input | Retained or recreated | Scope to report |
| --- | --- | --- |
| Recorded native `.blend` | Exact input bytes; supported scene reopened and saved through the production worker | Check the worker's supported geometry/material scope; do not infer untested rig, driver, animation or simulation fidelity |
| Recorded GLB | Exact GLB input; a new editable Blender scene from supported glTF data | Original modifiers, construction scripts, sculpt history and other absent authoring data cannot be recovered |
| Source reference | Verified original source bytes and provenance | Generated or inferred sources retain that limitation; no source-camera calibration is established |
| Legacy manifests | Captured provenance and chosen checkpoint/artifact identity | Capturing metadata does not revalidate the old certification system |
| Old project history and approvals | Kept in the unchanged old project | Other checkpoints, review images, journals, gate decisions and certificates are not transferred as new production approval |

The new revision's visual and target-readiness assessments start unevaluated.
Compare it with the source and the intended old asset, inspect scene/export
details, and make any required correction. Restore preserves the imported
artifact/provenance input bytes in the same way as any other production revision.

## Adopt changed references

To adopt changed references, pass the complete desired set and the `sequence` returned by `status`:

```bash
python3 scripts/produce.py references --root PROJECT --reference ORIGINAL_IMAGE --reference UPDATED_BRIEF --expected-sequence SEQUENCE
```

This preserves the model and its history. Use `--clear` instead of reference flags to explicitly remove all active references. Identical file contents are a no-op regardless of paths or order. `status` and `verify` report `evidenceFreshness.status`: `current`, `stale`, or `no-revision`. `stale` means the current bundle used a different reference content set; its files can still have valid integrity. New references require a new edit/review before deciding visual acceptance.

## Protect an existing edit

Use exact existing object names with repeated `--protect-object` flags to reject changes to their recorded native state and materials. Choose those names from the starting scene. The baseline is that scene at its starting frame, including objects imported from an explicit asset before the script runs. An edit script should modify the existing scene rather than recreate unrelated objects. Drivers and node-group internals are not exhaustive, and the guard does not approve all animation frames or visual quality.

To edit an existing asset, select either `--input-glb ASSET.glb` for a self-contained GLB or `--input-blend ASSET.blend` for a separately saved native. Each flag chooses the complete starting scene; it does not append objects to the current revision. The input-selection and preservation sections above describe this workflow. Omit both flags on later edits to continue the saved native. Use Blender's Save As for manual edits; files returned by `status` are immutable revision files. The worker provides `bpy` and the absolute `REFAS_OUTPUT_DIR` to scripts; the production runner manages the native scene, selected outputs and revision metadata. Use `--expected-revision REVISION_ID --expected-sequence SEQUENCE` to require the revision and reference state you inspected.

## Native observations

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

## Supported native scenes and output

Each `run` captures its starting asset, script and supplied render/review options and records fresh outputs together. Pass the desired options on each run; prior options are not implicit defaults. External originals can change without altering their captured historical copies.

Native `run` submissions accept portable scenes with visible meshes and classic `CURVE` objects, explicitly marked construction meshes, editable `LATTICE` control cages and packed still-image textures. Link cages to the scene and keep them enabled and visible in the active view layer; a cage may have `hide_render` set because it is not a renderable surface. Unmarked hidden mesh/curve geometry, disabled or excluded construction sources, text (`FONT`), `SURFACE`, modern hair `CURVES` and object instances remain unsupported; convert or realize them explicitly before submission. Temporary `inspect` queries can describe other object types without approving them for submission.

Delivery remains mesh-only and refuses unconverted curves. Choose the final curves and convert them through ordinary `bpy` in a recoverable `run --outputs delivery`; earlier native revisions keep their editable controls. Conversion at one frame does not preserve curve shape-key or geometry animation. Intentionally bake or rebuild required motion in a supported mesh representation and verify the exported playback before delivery.

Delivery also rejects every remaining scene `LATTICE`. For a static result, apply the intended deformation at the selected frame and remove the cage in a recoverable edit before delivery. Keep the editable cage in the earlier native revision. This does not automatically bake cage or shape-key animation; resolve required motion deliberately before removing its controls.

Other supported static mesh modifiers stay editable in the native scene and are evaluated for GLB export. Match each modifier's viewport/render visibility and enabled subdivision levels, or apply the intended geometry: inventory and export use the viewport dependency graph, while Cycles uses render settings. For curves, set `render_resolution_u` to `0` (reuse viewport resolution) or match every non-POLY spline's `resolution_u`. Delivery additionally rejects unapplied non-armature modifiers on skinned or shape-key meshes; resolve those before export. Dirty packed textures are refreshed before the native save.

Construction meshes remain in the delivered `.blend`; the GLB contains the evaluated asset without those source surfaces. Static modifier evaluation uses the selected frame and does not bake source-driven animation. A deliverable may have a construction parent only through the explicit `bind_on_surface` relationship; static delivery realizes its evaluated rigid transform. Select construction sources explicitly with `inspect --object` or `--protect-object` when inspecting or preserving them; protecting a host also protects its recorded evaluated shape and modifier target identity.

## Keep source, review, and recovery connected

Each successful production revision retains the editable `.blend`, actual requested renders, script and machine-recorded metadata; delivery revisions also retain GLB. The runner verifies recorded file integrity and prevents a failed or stale run from silently replacing the current revision. Blender scripts execute as trusted local code; the runner is not a security sandbox.

```bash
python3 scripts/produce.py verify --root PROJECT
python3 scripts/produce.py restore --root PROJECT --revision REVISION_ID
```

Use `verify` to check the recorded project artifacts, and inspect `status` after recovery. Restore publishes the selected prior bundle as a new revision and retains history and the currently active references. A restored bundle can therefore be `stale`; restore does not silently re-adopt its old references. Add `--expected-revision` and `--expected-sequence` to protect a planned restore from concurrent changes. File hashes show which bytes were saved; they do not judge resemblance, topology quality, or usability in a game engine. If the project reports missing or changed artifacts, resolve that condition before building on them.

Do not hide an unavailable Blender backend by generating a substitute preview and calling the run successful. Explain the concrete execution failure, retain the prior usable revision, and repair the toolchain or script.

Successful runs retain compact execution metadata. Add `--keep-diagnostics` to a run or delivery only when its raw job and Blender log are needed for debugging. Failed runs retain their log and run-local `blender-tmp/` directory, including native crash files when Blender writes them. Render log markers distinguish entering and returning from rendering and scene switches; a missing completion marker narrows the last operation but does not establish its failure cause. Temporary `inspect` observations do not retain these files.

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
If the source is specifically a saved RefAs 1.x project, this guide also
describes selecting an archived asset with `import-v1`; previous approvals do
not approve the new output.
