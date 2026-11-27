# AURIX automail — pinned RefAs 1.x exploratory control

**Delivered:** one editable, complete arm prototype in `candidate.blend` and `candidate.glb`. **Formal RefAs source-bound status: BLOCKED.** No certificate or accepted downstream checkpoint was manufactured.

## Identity, timing and isolation

- UTC start, recorded before reading guidance: **2026-11-21T21:38:02Z**.
- UTC report completion: **2026-11-21T21:57:47.193653Z**; elapsed **19.75 minutes**. This records this execution only, not a general speed claim.
- Pinned skill: `/tmp/refas-dual-asset-20261122/legacy-snapshot/skills/refas`; snapshot label supplied by the parent: `main a29bcc42`; runtime reported `1.4.2`.
- Guidance access: **16 unique files, 196,213 bytes**. Exact paths, byte sizes and SHA-256 values are in `access-log.json`. Combined long outputs were truncated; relevant construction/checkpoint/articulation sections were reread. Transitive runtime module reads were not measured.
- Model ID, token usage and cost were unavailable and are not estimated from bytes.
- No current 2.x guidance/runtime, other agents' outputs, other example assets, existing arm meshes, image generation, external 3D generation, subagents, Git writes or external app writes were used.

## Selected asset and reproducible frame

| Item | Result |
|---|---|
| Asset root | `AURIX_ARM_ROOT` |
| Asset objects | 247 nodes, including 227 meshes |
| Units and orientation | metres; +Z up; FRONT looks from -Y; neutral thumb on world -X/image left |
| Bounds height | 0.7534967 m; fingertips near Z 0.005; highest armor near Z 0.75850 |
| Native SHA-256 | `4e81abdf0d95fd44a576f3a646dabaf7e86a51d04eebc51dc15913b5713109f4` |
| GLB SHA-256 | `2a6d9e4ca1a4e5f73515413eb7bfb789868cc984f90177d34d833006bc52013a` |
| Studio exclusion | Only `STUDIO` collection: ground, camera, three lights; plus `Studio World` |

The original full sheet, including all five body views, exploded assembly and component panels, informed the component decomposition. The arm includes a genuine annular shoulder bore, crowned ivory shoulder/upper-arm/forearm shells, graphite structural bodies, silver rigid actuator parts, circular elbow, gold trim, a removable service cover, wrist and five separate three-joint digit chains. All geometry is beneath the single named root. The native file retains separate editable meshes, modifiers, material assignments and named pivot empties; the Python section/profile construction is also retained.

The 110 mm shoulder-interface label is treated as a nominal connector size/extent. It is not silently imposed as an additional measured axial segment. Shoulder center Z 0.692, elbow Z 0.435 and wrist Z 0.194 were chosen to preserve the visible whole-arm rhythm. Wrist-to-fingertip length is about 0.189 m. The source panels have inconsistent finger poses and uncalibrated cameras; the neutral front-like pose was selected, with explicit depth inference. `source-observations.json` separates observed facts, camera alternatives, engineered dimensions and unresolved ambiguities. No wearer or physiological/engineering performance was modeled.

## Real revisions and inspection

The first complete candidate remains unchanged as `initial.blend`/`.glb`, with five real renders. It showed a shoulder shield partly swallowed by the cylindrical housing, a side armor plate crossing the socket opening, an overly wide elbow and a short/high thumb.

The retained `shape-correction` candidate moved the shoulder shield and its trim outside the housing, replaced the bore-crossing side plates with external annular-sector armor, reduced elbow width to 70% without changing its axis or YZ radius, and lowered/lengthened the thumb with a 28-degree neutral splay. Actual front, side and three-quarter images showed the intended correction. The final, separate appearance edit assigned existing graphite to the two shoulder outer collars. The candidate was then frozen for the parent's anonymous observer.

All whole-arm before/after images use the same three-light studio and five orthographic cameras: front, left, back, front three-quarter and rear three-quarter. Every image is **512 × 512, Cycles CPU, 16 samples, two threads, denoising off**, with the same seed and AgX settings. There are also matched service-cover close-ups, side elbow-pose frames and a wrist/finger close-up. A fresh GLB import was rendered through the same five-view studio. `render-manifest.json` binds exact image bytes and identifies whether the rendered source was native or GLB.

The source is more complex and less regular than this prototype. The socket barrel and armor are simplified; the silhouette remains slender, digits blockier and rear mechanics less dense. The bright fixed studio washes out some ivory detail and 16-sample metal remains noisy. These are explicit limits; attractive materials or file integrity were not treated as source likeness.

## Forearm cover edit and restoration

Only `SERVICE_COVER_ROOT` moved **0.003 m along its declared local normal [0, 1, 0]**. Its 16 mesh children comprise the plate, nine ribs, four screws and two latches. They follow the root rigidly. Every protected native asset object's geometry, transforms, modifiers and material assignments remained unchanged. The saved candidate and edited native files were additionally reopened and checked across **252 scene objects**, including studio objects; no non-cover object state changed.

In the GLB comparison, the BIN chunk is byte-identical, as are meshes, materials, accessors, buffer views and other immutable structures. The **only changed node JSON is `SERVICE_COVER_ROOT`**. This is direct byte/structure evidence, not an inference from appearance.

Restoration has two distinct evidence levels. The in-memory asset state returned exactly to its baseline; `restored-state.blend` retains the diagnostic inspection camera and documents that asset-state restoration. `restored.blend` and `restored.glb` are exact copies of the preserved candidate bytes, with matching SHA-256 hashes. The full restored native scene was separately reopened and its state matched the candidate. The `.blend` byte match is therefore due to actual byte restoration, not an assumption that Blender resaving is byte deterministic. Detailed records: `panel-edit-check.json`, `native-file-preservation.json`, `glb-panel-preservation.json`.

## Articulation and GLB preservation

The native elbow was rendered and inspected at 0, 45 and 90 degrees of flexion. Wrist translation agreed with the expected rotation about the declared pivot to at most 1.49e-8 m. Geometry remained unchanged and the upstream shoulder/upper arm remained fixed. Sixteen named upper/forearm armor pairs had no triangle-surface overlaps at these sampled poses. A -20-degree wrist pose plus index MCP/PIP/DIP rotations of -20/-40/-25 degrees was rendered and inspected; twenty palm/forearm armor pairs had no triangle-surface overlaps. Neutral asset state was restored.

These checks do not cover every internal pair, bearing overlap, finger self-collision or full motion clearance. The rods are rigid visual components attached entirely to the upper arm or forearm; none is a working hydraulic linkage spanning the elbow or wrist. No physics, full skin rig or verified 135-degree range is claimed.

Fresh-scene GLB import retained all 247 names and all required parents, with no missing nodes or parent errors. The maximum world-matrix difference from the native snapshot was **2.384e-7**. Actual imported joint tests moved the wrist through the elbow, palm through the wrist and distal index segment through `Index_PIP`, while the specified protected objects stayed fixed. All tested transforms returned to neutral. Imported GLB geometry is evaluated/triangulated and is not claimed to be byte-identical to native editable control meshes. Details and measured displacements are in `glb-import-check.json`. A first mesh-centroid displacement calculation had an averaging/transform parentheses error; the read-only checker was corrected and rerun, with its first outputs retained under `logs/glb-import-*-first-measurement*`. No candidate geometry or bytes changed.

## Open topology finding

All imported vertices were finite. Raw GLB indexing has shading-seam splits, so its 193 raw nonmanifold mesh counts are not alone proof of holes. A separate read-only BMesh diagnostic merged coincident positions within 1e-7 m in copies. Native base meshes closed after that positional merge, but reverse/mirrored surfaces have inconsistent or inward winding. After the same diagnostic merge, **18 imported GLB meshes still have nonmanifold edges**:

`Hand_PalmGripPad`, `Index_Grip_0`, `Index_Grip_1`, `Index_Grip_2`, `Little_Grip_0`, `Little_Grip_1`, `Little_Grip_2`, `Middle_Grip_0`, `Middle_Grip_1`, `Middle_Grip_2`, `Ring_Grip_0`, `Ring_Grip_1`, `Ring_Grip_2`, `ServiceCover_Plate`, `Shoulder_RearBridge`, `Thumb_Grip_0`, `Thumb_Grip_1`, `Thumb_Grip_2`.

No zero-area faces were found after the positional merge. This remains a substantive production topology limit. The proposed later repair is consistent outward winding **before** bevel evaluation, followed by re-export and fresh checks. It was **not executed** in this control because the parent directed that the frozen candidate already under anonymous review be preserved. No watertight, manufacturing-ready or physical-readiness claim is made. Full per-mesh counts are retained in `mesh-qa-diagnostic.json`.

## What the legacy workflow actually exercised

The pinned CLI successfully created the source manifest, initialized the project, returned `next` guidance, described source intake, inspected the GLB and audited the initialized state. Audit reports `valid: true`, **zero checkpoints**, no head and no certification. That says only that this minimal recorded state is internally consistent.

The actual strict command was:

```text
node /tmp/refas-dual-asset-20261122/legacy-snapshot/skills/refas/scripts/refas.mjs validate --root /tmp/refas-dual-asset-20261122/automail-legacy --asset /tmp/refas-dual-asset-20261122/automail-legacy/candidate.glb
```

It returned **exit code 2, source-bound decision BLOCKED**. The complete raw output is retained at `logs/refas-validate.txt`. It passed source provenance, primary-source pixel-frame replay and intrinsic GLB integrity. These seven required checks were missing/not run:

- `candidate-lineage`
- `source-semantic-current-glb`
- `relational-evidence`
- `registered-multiview`
- `independent-visual-review`
- `realized-contact-support`
- `whole-object-certification`

No accepted source-intake checkpoint, downstream construction checkpoint, external-construction attestation, registered camera/projection proof, canonical neutral-clay barrier, independent source-semantic review or whole-object certificate was claimed. The useful Blender prototype and local checks are delivered separately from those unfulfilled formal boundaries.

The failed `/usr/bin/blender4.3.2` path lookup is retained; `/usr/bin/blender` actually reports Blender 4.3.2 and executed the task. Every substantive command and its actual result/log is listed in `commands.json`. The first builder is preserved as `scripts/build_initial_retained.py`; no failed or superseded visual candidate was deleted.

## Deliverable map

- `candidate.blend`, `candidate.glb`: frozen selected neutral arm.
- `initial.blend`, `initial.glb`: first complete candidate.
- `shape-correction.blend`, `shape-correction.glb`: focused geometry correction.
- `panel-edited.blend`, `panel-edited.glb`: 3 mm service-cover edit.
- `restored.blend`, `restored.glb`: byte-exact full restoration; `restored-state.blend`: independent asset-state restoration evidence.
- `poses/` and `renders/poses/`: sampled elbow and wrist/index poses.
- `renders/initial`, `renders/candidate`, `renders/edited`, `renders/shape-correction`, `renders/candidate-glb`: actual review frames.
- `scripts/`, raw source bytes/metadata, machine-readable checks, command logs, artifact/render manifests and `report.json` support reconstruction and review.

This is **one exploratory control**, not proof of general workflow performance, quality, speed or certification reachability.
