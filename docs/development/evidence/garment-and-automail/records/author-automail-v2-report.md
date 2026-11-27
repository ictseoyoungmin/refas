# AURIX arm — independent RefAs 2.0 report

## Delivered outcome

A complete editable rigid-part arm prototype was authored from the unchanged AURIX sheet. It includes shaped shoulder/upper-arm/forearm armor, recessed circular sockets, exposed actuator cores, elbow rotor, removable service cover, wrist, palm and five separate three-link digits. The selected neutral scene is **`d4012de785ad42d5b67d5df0d12e6632`**, restored through the public CLI as **`3b26f1ad9446435e9e4dcc2b836227dc`**.

The technical exercise passed. Visual fidelity remains a prototype-level interpretation: primary forms and palette are recognizable, while the source's compound surface curvature, rear mechanical density and fine machining remain simplified. No likeness score, engine-readiness result or physical-performance claim is made.

### Main files

- `candidate.blend` and `candidate.glb`: restored selected neutral state.
- `first-candidate.blend` and `first-candidate.glb`: first complete candidate, retained before corrections.
- `panel-edited.blend` and `panel-edited.glb`: outward 3 mm service-cover state.
- `renders/first-candidate/`, `renders/candidate/`, `renders/panel-edited/`: actual 512 × 512, 16-sample Cycles images.
- `poses/`: elbow 0°, 45°, 90° and combined wrist/index sample, each with native/export files and actual side/oblique images.
- `project/`: full public production history. Earlier candidates and all pose/restore revisions are retained.
- `scripts/`, `review.json`, `pose-review.json`, `provenance.json`, `commands.json`: reproducible authoring and exercise inputs.

## Timing and isolation

UTC start was **2026-11-21T21:19:14+00:00**, recorded before reading guidance. The first complete candidate was published at **2026-11-21T21:24:33.939926+00:00**. Workflow checks finished at **2026-11-21T21:32:24.242727+00:00**; this report ended at **2026-11-21T21:37:11.183931+00:00**. Total observed elapsed time to report completion is **17.95 minutes**. These are wall times, not a controlled resource benchmark.

Only this source, task, metadata, repository AGENTS instructions and frozen RefAs entry with its assembly/review guides were read. No other case, candidate, agent's files, external app, image-generation tool or subagent was used. Exact model identity and token counts were unavailable and were not inferred.

The fresh build and two corrections ran directly through the public `produce.py` CLI. **`run.py` was actually executed in `--phase exercise` mode**, against the selected saved revision. Its `all` path is provided as a reusable fresh-build sequence; a second full fresh generation was not run. Exact actual commands, return codes, timestamps where recorded, stdout and stderr are retained in `commands.json` and `logs/`.

## Source, scale and interpretation

The original source SHA-256 is `3c7856dd632f8a1cde8036078573f569db55b6af97fae853237d8a9356f3c872` (3,215,297 bytes); the project copy matches exactly. Units are metres, Z up and front −Y. This is a right-hand interpretation with thumb at −X in the front view. Shoulder, elbow and wrist pivots lie at Z = 0.690, 0.426 and 0.184 m respectively. Flexion uses local X.

The evaluated neutral envelope is **165.240 × 120.641 × 743.095 mm**. Its lowest modeled fingertip is at Z = 9.898 mm. The sheet's 760 mm total was treated as a nominal proportion guide; this asset is **not an exact 760 mm dimensional reconstruction**. The connector's 110 mm label, uncalibrated cameras and differing finger poses make a single fully registered interpretation impossible from this sheet alone. Hidden backs, routing, thickness and screw placement were inferred. Weight, assist force and neural-control text were not treated as verified engineering specifications.

## Actual visual inspection and corrections

The full first candidate was saved before correction. Its front, side, back, oblique and service-detail renders were opened. The first noticeable issues were overly broad side plates that obscured the exposed core, a shoulder rim that read as a plain bright disc, and markings that were too close to the armor surface.

The first correction re-profiled the side shells to expose the mechanical channel, narrowed the bright shoulder rim and lifted the markings. A second source comparison found weak shoulder-to-elbow width contrast. The second correction broadened shoulder armor, narrowed the over-wide elbow and modestly broadened the main blade profiles. Joint centers, service cover and all hand/digit parts stayed in place. Both earlier visual states remain available.

All five corrected neutral views were inspected. Before/after comparison uses the same explicit cameras, lighting, orthographic scale, image size and sample count. Images are associated with source regions for provenance; they are **not registered source projections**.

Remaining visual work is concrete: improve compound shoulder/forearm curvature and side transitions, replace the broad rear spine with a richer source-like mechanical arrangement, refine asymmetric hardware and material finishes, and improve small-detail readability. The current 16-sample renders are visibly grainy and bright metal reflections flatten some details. No visual approval is implied by the checks below.

## Local edit and preservation

The rear `SERVICE_COVER` group moved along local **+Y**. Requested movement was **0.003 m**; measured world translation was **[0, 0.002999998629, 0] m**, within the 1e-7 m tolerance. Its subtree contains **26 objects**: the pivot and 25 attached meshes.

All **274 unrelated objects** retained their recorded geometry, topology, UV data, materials, modifiers, parenting and local/world transforms. The selected subtree retained geometry, materials, modifiers and parent relationships; only its intended transform changed. Independently comparing the serialized scene records also found exactly 26 changed object records, all within the selected subtree, with every unrelated record equal.

`panel-preservation.json` contains the before/after measurements and object names. Neutral and edited service-detail images were inspected using the same camera and lights. The movement is deliberately subtle at 3 mm; numeric measurements establish the displacement.

## Exact recovery

Public `produce.py restore` was used after the service edit and after the pose samples. Both recoveries reproduced the selected native `.blend`, GLB and scene-record bytes exactly. All five restored neutral image hashes also match the selected baseline. Recovery creates a new revision and retains history. The final `verify` returned `ok: true` for the recorded-file-integrity scope with 10 artifacts.

## Limited articulation checks

| Sample | Elbow | Wrist | Index J0/J1/J2 | Shell intersections |
|---|---:|---:|---|---|
| elbow-0 | 0° | 0° | [0, 0, 0] | 0 / 30 named pairs |
| elbow-45 | 45° | 0° | [0, 0, 0] | 0 / 30 named pairs |
| elbow-90 | 90° | 0° | [0, 0, 0] | 0 / 30 named pairs |
| wrist-20-index-35 | 45° | 20° | [35, 20, 10] | 0 / 30 named pairs |

Actual side views at 0°, 45° and 90°, the 90° oblique view, and both combined wrist/index views were opened. The forearm and downstream hand follow the elbow and stay visibly connected. The wrist and index chain visibly articulate. In every sample, **96 upper assembly object transforms remained unchanged**.

The 30 named upper-armor/forearm-shell BVH surface pairs returned no intersections per sample. This excludes expected bearing overlap and other object pairs, does not detect all containment cases, and does not cover continuous motion. No full clearance claim follows. No authored hydraulic or cable mesh spans the elbow: visible rods and conduits remain segment-local static approximations. There is no telescoping, tendon or physics solution.

## Independent GLB reimport

A separate factory-startup Blender process reimported the delivered neutral GLB. It retained **300 objects / 280 meshes**, with no missing or extra objects and no parent mismatches. Required shoulder → elbow → wrist → digit relationships and the service-cover parent were present. The maximum bounds difference was **3.55e-09 m**.

The reimported service cover passed the same selected-subtree 3 mm movement check. Independent elbow 45°, wrist 20° and index-base 35° orbit checks passed; maximum measured orbit error was **3.33e-08 m**. The tests operated on in-memory imported nodes and left the delivered neutral files untouched.

The native asset has **159,462 evaluated triangles** and **81,023 vertices**, with 20 empty nodes, including 18 articulation pivots, one service-cover pivot and the root. Solidify, Bevel and Weighted Normal modifiers remain editable in Blender; export evaluates them. There is no armature, skinning, animation clip, authored complete UV layout, texture bake or LOD system. Generated primitive UV layers on 142 objects do not establish a production UV unwrap. No game engine was tested.

## Failures, limits and retained history

One initial metadata read used the nonexistent `source/reference.json` path and returned exit 1; the correct `reference.json` was read immediately afterward. A review-source hash transcription typo was corrected before any production run. No production command failed. The first candidate and first correction were superseded after visual review and retained; neither was hidden or overwritten.

| Revision | Intent | Published UTC |
|---|---|---|
| 0f982e173cfe4160a3b411361590be7e | Build the complete source-led AURIX arm with shaped shells, exposed core and separate rigid articulated digits | 2026-11-21T21:24:33.939926+00:00 |
| f1d628cbbc2e4f32a3c4a0f42f4a8a08 | Reveal the mechanical side channel, narrow the bright socket rim and lift shoulder markings | 2026-11-21T21:27:18.821402+00:00 |
| d4012de785ad42d5b67d5df0d12e6632 | Restore source shoulder-to-elbow width contrast and slightly broaden the main armor | 2026-11-21T21:29:35.613741+00:00 |
| a729d09cab3b4603a71a13967c268ff9 | service-cover-outward-3mm | 2026-11-21T21:31:52.104640+00:00 |
| dea9f287afdd421084b7140ef42dcfb3 | Restore revision d4012de785ad42d5b67d5df0d12e6632 | 2026-11-21T21:31:52.310690+00:00 |
| b82cddb7b87b4aa199ba7e6559e6b8e4 | sample-elbow-0 | 2026-11-21T21:31:59.646034+00:00 |
| 3b3e40c4f54c4eb295b29b2a73985f58 | sample-elbow-45 | 2026-11-21T21:32:07.112731+00:00 |
| 83608af3ea0343a0bcf8e3d53d25073b | sample-elbow-90 | 2026-11-21T21:32:14.416482+00:00 |
| e8f8e45033134e5c87bf0ea30e6a5a23 | sample-wrist-20-index-35 | 2026-11-21T21:32:21.802865+00:00 |
| 3b26f1ad9446435e9e4dcc2b836227dc | Restore revision d4012de785ad42d5b67d5df0d12e6632 | 2026-11-21T21:32:22.011330+00:00 |

## Instructions and original data accessed

The exact paths, byte lengths and hashes are in `guidance_reads.json`; the list below records the inputs actually accessed.

| Path | Bytes | Access |
|---|---:|---|
| `/workspace/scratch/2eb72029c71e/refas-v2/AGENTS.md` | 4,067 | read |
| `/workspace/scratch/2eb72029c71e/refas-v2/examples/automail-arm/TASK.md` | 2,685 | read |
| `/workspace/scratch/2eb72029c71e/refas-v2/examples/automail-arm/reference.json` | 2,182 | read |
| `/workspace/scratch/2eb72029c71e/refas-v2/examples/automail-arm/source/reference.png` | 3,215,297 | view_image |
| `/tmp/refas-dual-asset-20261122/skill-snapshot/SKILL.md` | 10,350 | read |
| `/tmp/refas-dual-asset-20261122/skill-snapshot/references/production-assemblies.md` | 3,595 | read |
| `/tmp/refas-dual-asset-20261122/skill-snapshot/references/production-review.md` | 2,240 | read |

`report.json` contains the structured evidence, measured statistics, complete paths, code/source hashes and explicit visual and technical limitations. File integrity, rigid hierarchy recovery and source resemblance remain separate questions.
