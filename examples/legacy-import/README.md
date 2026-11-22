# Explicit 1.x asset import demonstration

Run `run.py` against a separately installed 2.0 CLI and an actual saved 1.x
project. Choose the checkpoint and artifact deliberately; the current head may
record only a review. The source project is read without writes.

```bash
python3 examples/legacy-import/run.py \
  --cli /absolute/install/node_modules/.bin/refas \
  --legacy-project /absolute/old-project \
  --checkpoint cp_a744fb4e4fae0cd60712 \
  --artifact assets/wing-cover.glb \
  --edit-object panel:cell-00 \
  --out /absolute/new-proof-directory
```

The identifiers above belong to the retained wing-cover fixture used for the
recorded run; substitute values from the chosen project's own manifests. Its
source is a generated contract reference, not a real-photo reconstruction case.

The example records every subprocess command, hashes every old project file,
imports the selected archived asset, moves one named mesh by 0.005 Blender units
along Z, checks that other recorded object fingerprints survive, and restores
the exact original artifact/input bundle. It uses the public CLI for every
production operation. Inspect actual rendered images as well as the JSON result.

This proves the demonstrated import/edit/recovery scope. It does not recover
construction history absent from GLB, import the entire old checkpoint history,
or inherit certification, visual acceptance or target-engine approval. Actual
native import and unsupported-resource cases are covered separately by the
opt-in Blender integration tests. See the [recorded evidence](../../docs/development/evidence/v2-distribution-and-import/README.md).
