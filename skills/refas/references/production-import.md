# Import a selected 1.x asset

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
