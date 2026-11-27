# Wing-cover continuation report

Completed 2026-11-22 with Blender 4.3.2 and the installed RefAs production workflow.

## Result

Created a separate production project at `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project` from the archived `assets/wing-cover.glb` recorded in checkpoint `cp_a744fb4e4fae0cd60712`. The exact captured GLB has SHA-256 `3fcf70e36a0b42723c3abed6ebc60cdfea0143e19c047ba802258753ee41fdec`.

Raised only `panel:cell-00`, the small enamel panel near the tip, by **0.025 scene units along negative Y**. In this imported orientation, that moves the panel outward above the cover. The offset is about 0.93% of the asset's total height; it is a scene-scale choice, not a measured real-world dimension.

The project is now restored to its imported starting asset and ready for another choice. The starting asset, comparison baseline, raised option, and restoration all remain in history.

| State | Revision |
| --- | --- |
| Imported starting asset | `6f23fe22c89f40ea96b99f1b4060f196` |
| Unchanged asset with fixed comparison views | `3795c8dfcb8f43aeab6728e837b09044` |
| Raised panel option | `ecfc78fcd169476e8c4da1358d4cb173` |
| **Current restored state, sequence 4** | `5b20ffb343054e2a90d6f4fb1f915d6b` |

## Actual render inspection

Opened the supplied generated reference, the old project's hero/side renders, and the imported Blender hero/side renders. Then inspected both revisions' actual Cycles hero, tip-detail, and grazing renders at 640 × 640, 32 samples with identical fixed cameras and lighting.

The detail and grazing images show the raised panel's exposed edge and stronger separation from the cover. The whole-asset view shows no visible change to the surrounding panels, rim, or fastener. The raised option is retained as a reversible visual choice. Its attachment/support was not engineered or certified.

| View | Before | Raised option |
| --- | --- | --- |
| Whole asset | [view-hero.png](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/3795c8dfcb8f43aeab6728e837b09044/artifacts/view-hero.png) | [view-hero.png](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/ecfc78fcd169476e8c4da1358d4cb173/artifacts/view-hero.png) |
| Tip detail | [view-detail.png](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/3795c8dfcb8f43aeab6728e837b09044/artifacts/view-detail.png) | [view-detail.png](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/ecfc78fcd169476e8c4da1358d4cb173/artifacts/view-detail.png) |
| Grazing | [view-grazing.png](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/3795c8dfcb8f43aeab6728e837b09044/artifacts/view-grazing.png) | [view-grazing.png](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/ecfc78fcd169476e8c4da1358d4cb173/artifacts/view-grazing.png) |

## Preservation and recovery evidence

- The comparison baseline's scene fingerprint equals the imported starting scene.
- Only the target object's local/world transform and resulting fingerprint changed. All **65 other object records** are identical.
- Target mesh, evaluated geometry, material assignments, topology, and other recorded properties are unchanged.
- The before/after exported GLB binary chunks are identical. Only `panel:cell-00` has a changed node transform; the GLB mesh, material, accessor, buffer-view, texture/image, skin, and animation sections are unchanged.
- All six restored artifact files and all five restored input files match the imported starting revision byte for byte, including the exact captured legacy GLB and provenance.
- Both the raised and restored heads passed `produce.py verify`. Final status reports four retained revisions, no incomplete runs, and current reference evidence.
- The original project's **247 files** have the same paths and SHA-256 hashes before and after this work. No installed skill or repository files were edited.

Evidence: [preservation-check.json](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/logs/preservation-check.json), [restoration-check.json](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/logs/restoration-check.json), [verify-raised.json](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/logs/verify-raised.json), [verify-restored.json](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/logs/verify-restored.json), [final-status.json](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/logs/final-status.json).

## Files to continue from

| Purpose | Native scene | Export |
| --- | --- | --- |
| **Current restored starting asset** | [scene.blend](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/5b20ffb343054e2a90d6f4fb1f915d6b/artifacts/scene.blend) | [asset.glb](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/5b20ffb343054e2a90d6f4fb1f915d6b/artifacts/asset.glb) |
| Retained raised option | [scene.blend](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/ecfc78fcd169476e8c4da1358d4cb173/artifacts/scene.blend) | [asset.glb](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/ecfc78fcd169476e8c4da1358d4cb173/artifacts/asset.glb) |
| Fixed-view before state | [scene.blend](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/3795c8dfcb8f43aeab6728e837b09044/artifacts/scene.blend) | [asset.glb](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/3795c8dfcb8f43aeab6728e837b09044/artifacts/asset.glb) |

Use RefAs `run` with the current project for further changes; revision files are immutable. Scripts and settings: [raise_panel.py](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/raise_panel.py), [baseline.py](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/baseline.py), [review-spec.json](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/review-spec.json). The complete executed shell commands and image-inspection list are in [commands.md](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/commands.md). The import/provenance report is [migration.json](sandbox:/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/5b20ffb343054e2a90d6f4fb1f915d6b/inputs/import/migration.json).

## Limits and execution notes

The reference is a **generated contract fixture**, not a real photograph. These unregistered diagnostic renders establish the visible local change; they do not establish finished source likeness, independent visual acceptance, or target-engine readiness. No engine or animation test was performed. GLB import cannot recover original modifiers, construction scripts, sculpt history, or other authoring data absent from the selected GLB. The imported scene has no UV objects, armatures, or shape keys, so those features were not exercised.

All production commands succeeded. One locally authored restoration-check helper initially looked for the captured reference in the wrong directory; its path was corrected to the observed `.refas2/sources` location and the full check passed. The initial failure log is retained in `logs/restoration-check-first-attempt.log`.

