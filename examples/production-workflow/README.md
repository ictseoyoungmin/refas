# Native production workflow fixture

This example creates an original navy, ceramic-white and metal headset, then
widens only its headband comfort pad. It demonstrates an ordinary Blender
script followed by a local revision of the saved native scene. There is no
input image, so this example provides **no evidence of reference likeness**.

The headset has 30 named mesh objects: curved headband layers, cup shells,
cushions, trim, adjustment rails, yokes, and a detachable microphone assembly.
Parts remain separately editable. The rails and microphone are modeled parts;
there is no rig or mechanical motion validation in this fixture. The generated
UVs are sufficient to exercise UV preservation, not a production texture atlas.

## Run through the production CLI

Run the complete creation, local revision, deliberate failure and exact restore
demo through the public CLI with one command:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 examples/production-workflow/run.py
```

The default output is `examples/production-workflow/output/demo`. Use `--root`
to choose a different **new** directory; existing directories are never
overwritten. The harness uses actual Blender, renders hero/side at 512 pixels
and 16 samples, checks preservation of the other 29 parts and matched cameras,
and writes `demo-evidence.json` with original artifact/input inventories and
hashes. `--blender`, `--size`, and `--samples` can select another execution
configuration. Recorded evidence from the verified Blender 4.3.2 run is in
[`docs/development/evidence/refas-2-native`](../../docs/development/evidence/refas-2-native/README.md).

From the repository root, initialize a project and run these two scripts with
the `produce.py` interface described in the main README:

- `examples/production-workflow/create_headset.py`: start from an empty scene.
- `examples/production-workflow/revise_headset.py`: use the current native
  revision and widen `HeadbandComfortPad` by 18 percent. All other parts should
  retain their recorded fingerprints.

Use `hero,side` views for both runs. Eight Cycles samples are a quick diagnostic
setting; use more samples when reviewing materials. The worker records the
actual render settings. Diagnostic rendering explicitly disables denoising so
Blender builds without OpenImageDenoise can execute the same backend.

Scripts use normal `bpy`, with no required asset DSL or special collection.
The worker supplies `REFAS_OUTPUT_DIR` and `REFAS_INPUT_DIR` as absolute string
paths. Scripts are trusted Python code, not sandboxed plugins. Their source
and the packed `.blend` are the portable inputs supported by this first slice;
scripts that require sibling modules or other external files need a deliberate
dependency packaging step before use.

## Worker contract

The CLI creates a fresh output directory and passes a JSON job to Blender:

```json
{
  "operation": "edit",
  "baseBlend": null,
  "script": "/absolute/path/create_headset.py",
  "outputDir": "/absolute/path/empty-artifact-directory",
  "views": ["hero", "side"],
  "render": {"engine": "CYCLES", "samples": 8, "size": 384}
}
```

```bash
PYTHONDONTWRITEBYTECODE=1 blender -b --factory-startup --threads 2 \
  --python-exit-code 1 \
  --python skills/refas/scripts/production/blender_worker.py -- --job job.json
```

For a revision, `baseBlend` points to the previous native scene copied into the
run's input directory. The script executes after that scene opens. The worker
does not overwrite that input. The host owns snapshot publication and recovery.

Each successful edit produces:

| File | Purpose |
| --- | --- |
| `scene.blend` | Packed editable native scene, saved before diagnostic helpers exist |
| `asset.glb` | Derived triangle asset with material, UV, skin and morph export enabled |
| `scene.json` | Current-frame object inventory, geometry/UV/material/rig/shape-key fingerprints and statistics |
| `view-hero.png`, `view-side.png` | Actual Cycles CPU renders with explicitly unregistered camera records |
| `result.json` | Output paths, Blender version, observations, verification scope and limitations |

The worker reopens the `.blend`, compares the recorded state, imports the GLB
into a fresh scene, and checks triangle counts, bounds, and basic skin/morph
presence where applicable. Different GLB vertex counts are allowed because
UV seams and normals can split vertices. Diagnostic cameras and lights are
created in a separate scene after the native save/export. They are absent from
both deliverable files.

`inspect` accepts an existing `baseBlend` and an optional `assetGlb`. It emits a
fresh `scene.json` and verification result without resaving either input. It can
also render requested views. Supported view names are `hero`, `front`, `side`,
`back`, and `top`; these are bbox-framed diagnostic cameras, not registration to
a reference. A changed bounding box can change a camera between revisions.
Use the CLI's `--review-spec` to capture explicit orthographic cameras and fixed
lighting for before/after comparisons. Its format and limits are documented in
[`production-review.md`](../../skills/refas/references/production-review.md).
The worker's corresponding job field is `reviewSpec`, an absolute path to the
captured JSON. Compare the recorded camera and lighting specifications before
claiming a matched-view fix; fixed diagnostic views remain unregistered.

The current export boundary supports mesh objects, armatures and non-instancing
empties, and packed still image textures. Convert curves/text/metaballs to
meshes and realize instances first. Inspection applies the same object-scope
restriction instead of rendering an incomplete or unrecorded subset.
Linked libraries, external movie/audio/cache dependencies, and image sequences
are rejected explicitly. Procedural Blender shaders may require baking for the
GLB to look the same. Node group contents, drivers, full animation behavior and
simulation state are not exhaustively certified by the fingerprints. The raw
native-file hash remains the identity of the complete saved artifact.

These observations do not establish texture quality, complete topology
quality, collision behavior, game-engine compatibility, or final acceptance.

## Real Blender verification

```bash
REFAS_BLENDER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  discover -s tests -p test_production_blender.py
```

The test runs creation, local revision, inspection and failure cases in actual
Blender. It checks that only the comfort pad changes, source bytes remain
untouched, diagnostic helpers do not leak into the artifacts, PNGs are really
rendered, and errors do not become successful revisions. `BLENDER_EXE` can
select a particular executable. Without opt-in, this integration suite skips
instead of silently replacing Blender with a mock.
