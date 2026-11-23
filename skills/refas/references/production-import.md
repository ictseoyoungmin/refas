# Start from an existing asset

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
