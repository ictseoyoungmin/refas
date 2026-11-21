# AURIX arm — independent no-skill baseline

**Selected result:** `candidate.blend` and `candidate.glb`, copied unchanged from correction2. The native assembly is 759.122 mm tall, with the lowest fingertip at -0.500 mm. All five requested neutral views are actual Blender renders.

## Timing and provenance

Start: **2026-11-21 21:21:58 UTC**. End: **2026-11-21 21:39:37 UTC**. Elapsed: **17.66 minutes**. Blender **4.3.2**. Approximate requested budget was 30 minutes; measured time is reported without treating it as a speed score.

Only the authorized source PNG and corrected raw metadata path were inspected. No RefAs skill/runtime, repository modeling code, other candidate, prior mesh, subagent, image generation or external 3D generation was used. Work stayed in this task directory. Model ID, token usage and cost are **unavailable** and were not inferred.

## Source interpretation and assembly

The sheet is 1447 × 1087 px. Its labels are approximately 760 mm total, 110 mm shoulder interface, 215 mm upper arm, 250 mm forearm and 185 mm hand. These are interpreted as concept proportions. The scene uses metres and Z up; FRONT looks from −Y. The neutral thumb is on image left (−X), following the source front view. Shoulder, elbow and wrist pivots are at Z 0.700, 0.435 and 0.187 m. The shoulder-label allocation, hidden attachments, cable paths and inconsistent hand poses are interpretations, not manufacturing truth.

The model includes shaped ivory shoulder/upper/forearm armor; swept shoulder returns; graphite spine and cradles; titanium/gold actuator details; circular layered shoulder interfaces and elbow bearings; a removable forearm cover with its own attached hardware; a wrist; dorsal and palm structures; and five independent three-joint digits. No wearer body is present.

There are **311 asset objects** beneath `AURIX_ROOT`: 269 meshes, 18 curves, 4 text objects and 20 empties. The **5 studio objects** are the ground, three area lights and review camera, all outside the asset root. Evaluated geometry is **120,964 triangles / 62,000 vertices**, before GLB format vertex splitting. The envelope is approximately **152.811 × 113.456 × 759.122 mm**.

## Saved candidates and corrections

| Stage | Actual inspection and disposition |
|---|---|
| initial | First complete native/GLB and five renders retained. Inspection revealed lost transverse socket/bearing axes due to stale transforms during parenting, short finger endpoints and overly bright shading. |
| correction1 | Dependency-graph evaluation before world-matrix preservation restored shoulder, elbow, wrist and digit-bearing orientation. Actual outputs inspected. |
| correction2 — selected | Added swept shoulder returns and rear graphite enclosure; lengthened staggered fingers; moderated three PBR materials. Native/GLB copied unchanged to candidate files. |
| correction3 — rejected | Further material darkening did not solve the preserved bright rig and risked implausible materials. Files and actual renders retained. |

The same camera positions, orthographic scale, target, three lights, ground and rendering settings were used throughout. The saved-file audit found no initial-to-selected studio or rendering changes. All requested views use **512 × 512, Cycles CPU, 16 samples, two threads, denoising off**. Camera/light transforms are in the native file; camera positions and image settings are also in `rig.json`.

## Service-cover edit and exact restoration

Only `SERVICE_COVER_ROOT` and its 13 geometry descendants were moved outward along its declared local normal **(0, −1, 0)**. The descendants are the cover, gold border, vent recess/trim, serial text, four screws and four screw sockets. Measured displacement for every node is **2.999998689 mm**; the float difference from 3 mm is approximately 1.31 nanometres. Geometry, materials and local child transforms were not edited.

**All 302 protected objects, including the studio, retained their geometry, transforms, modifiers and materials in saved-file readback.** The full protected-name list and measurements are in `report.json`, `edit_verification.json` and `saved_state_audit.json`. `panel-edited.blend` and `panel-edited.glb` contain the moved assembly; `renders/edited` contains five actual views.

`restored.blend` was read back separately and exactly matches the captured candidate scene state. This is state-level evidence, not a claim that .blend file bytes match. Both captured-state SHA-256 digests are:

```text
6e5fe575e491a4ee07aba4d789bc43b520882fab30398331c22d448edfefd513
```

The comparison includes all scene object parent relationships, basis/local/world matrices, mesh/curve/text data, modifiers, material slots/parameters, light/camera parameters and render settings. `state_baseline.json` and `state_restored.json` additionally preserve the asset-only snapshots.

## Articulation tests

Native elbow **0°, 45°, 90°** poses were rendered from LEFT and front three-quarter. Combined wrist **25°** and index second joint **45°** were also rendered from those views. All actual views were inspected and the neutral pose was restored with exact captured-state equality. The wrist moves from (0, 0, 0.187) m at elbow 0° to approximately (0, 0.1753625, 0.2596375) at 45° and (0, 0.248, 0.435) at 90°.

The rigid hierarchy moves coherently, with no obvious gross clash at the inspected scale. The upper clevis remains fixed while the elbow bearing and forearm rotate; intentional bearing/clevis overlap is not a collision-free manufacturing validation. No telescoping hydraulic or cable constraints cross the joint. Pistons and hoses remain rigid visual parts assigned to one segment. Fine interference was not tested by a collision solver. The 90° side view brings fingertips close to the image boundary.

## Independent GLB import

The candidate GLB was imported into a fresh Blender scene. It contains **311 named objects / 291 meshes**, preserving every native asset object name and parent. No current world matrix differed from native by more than **1e−5**. Native curves and text are converted to meshes and modifiers are baked, while the named transform hierarchy remains editable. Standard glTF Y-up export is converted back to the native Z-up scene convention by Blender import.

The first import motion test incorrectly changed Euler fields on quaternion-mode nodes and produced no movement; its report, scene, log and images remain under `attempt1-*` and `renders/glb-attempt1`. The corrected test postmultiplies each local `matrix_basis` by the required rotation. Elbow 45° moves the wrist **189.811 mm**; wrist 25° moves the index joint **50.654 mm**; index J2 45° moves its distal joint **22.961 mm**. An actual imported neutral front-three-quarter and elbow45 LEFT image were inspected. Imported transforms then restored exactly. Wrist/finger import tests verified descendant transforms; their isolated imported poses were not additionally rendered.

This verifies Blender GLB import and the tested rigid transformations. No external engine or other DCC was tested. `glb-import-check.blend` retains the imported asset plus recreated review studio in neutral state.

## Visual and practical limits

- This is a complete editable procedural prototype, not a high-fidelity reconstruction. Front armor silhouettes, lateral returns, panel curvature and rear mechanical routing remain simplified relative to the concept sheet.
- The unchanged studio rig is too intense for nuanced ivory/graphite shading, and 16-sample denoising-off Cycles previews are visibly noisy. No exposure, camera or light changes were used to make a later revision look better. Root may perform a separate matched review.
- The shoulder interface is a layered recessed socket with a dark backing, not a fully engineered connector. Armor fasteners and hoses are visual assembly details.
- Elbow and wrist motion is rigid hierarchy articulation. Pistons and cables do not dynamically extend or constrain motion. Fixed upper clevis and rotating bearing intentionally overlap as joint parts; full mesh collision detection was not performed.
- Native elbow 0/45/90 views and combined wrist25/index-J2-45 views showed coherent rigid motion without an obvious gross clash at the inspected scale. At elbow90 the fingertips approach the fixed side-view image boundary. Small interference and inaccessible fasteners may remain.
- Thumb/front orientation follows the source front view, with thumb on image left. Other sheet views contain pose/handedness ambiguities and were not forced into an inconsistent exact match.
- The GLB test covers Blender import, names/parents, neutral transforms and selected rigid joint motions only. No game engine or separate third-party DCC was tested. Native curves/text/modifiers become baked meshes in GLB.
- No skin rig, IK, physics, functional hydraulics, performance claims, UV atlas, texture bake or production topology optimization is supplied. Source weight, force, neural interface and range claims were not validated.

## Files and reproduction

| Deliverable | Path |
|---|---|
| candidate.blend | `candidate.blend` |
| candidate.glb | `candidate.glb` |
| initial.blend | `initial.blend` |
| initial.glb | `initial.glb` |
| panel-edited.blend | `panel-edited.blend` |
| panel-edited.glb | `panel-edited.glb` |
| restored.blend | `restored.blend` |
| Selected neutral views | `renders/candidate/{front,left,back,frontthreequarter,rearthreequarter}.png` |
| First complete views | `renders/initial/` |
| Edited cover views | `renders/edited/` |
| Native pose views | `renders/poses/` |
| Imported GLB views | `renders/glb/` |
| Evidence | `report.json`, `edit_verification.json`, `pose_verification.json`, `saved_state_audit.json`, `glb_verification.json` |

`build_initial.py` reproduces the first completed candidate (including its orientation defect). `build_arm.py` reconstructs the selected candidate and all five views; `run_corrections.py` documents and runs that corrected reconstruction. `build_material_trial.py` preserves the rejected material experiment. The edit/pose, GLB import and saved-state audit scripts are independently rerunnable. Re-running scripts intentionally writes their named output files, so archive a revision first if preserving its bytes matters.

```bash
/usr/bin/blender -b -t 2 --python build_arm.py
/usr/bin/blender -b -t 2 --python verify_edit_poses.py
/usr/bin/blender -b -t 2 --python check_glb.py
/usr/bin/blender -b -t 2 --python audit_saved_states.py
python write_report.py
```

## Command failures and setup friction

- setup: First exec attempt used the not-yet-created work directory and was rejected before process creation; retried from /tmp.
- source locator: source/reference.json did not exist; root supplied /workspace/scratch/2eb72029c71e/refas-v2/examples/automail-arm/reference.json and that exact raw-source metadata was then read.
- Blender API: Object.parent_recursive unavailable in Blender 4.3.2; replaced export selection with root.children_recursive. Initial-export-failed.blend and build.log retained.
- construction defect: Un-evaluated rotation matrix was captured during parenting, losing transverse orientations in initial candidate. Corrected in correction1, not hidden or overwritten.
- nonfatal exporter notice: Exporter printed Draco library unavailable. Uncompressed GLB exports completed; no Draco compression was requested or required.
- GLB test defect: Imported joints use QUATERNION rotation mode. First Euler-field test produced zero motion. Corrected test applies local matrix_basis rotation; failed import file/report/log/images retained.
- audit report scope defect: First studio-change report included a global material digest and therefore also listed intentional asset PBR changes. Final report compares studio objects/render settings separately; first audit retained.

Complete command descriptions and output-file byte hashes are in `report.json`. All failed/intermediate files and logs are retained.
