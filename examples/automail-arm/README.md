# AURIX arm — fresh RefAs 2.0 authoring exercise

This example builds one complete rigid-part cybernetic arm from the unchanged
`source/reference.png` sheet. The selected result is an editable prototype with
shaped ivory armor, graphite structure, gold and steel mechanisms, a removable
rear service cover, wrist and five separate three-segment digit chains.

## Reproduce

Use the public production entry from the intended frozen skill copy. The runner
accepts explicit paths and creates its project below the selected output root:

```bash
python3 examples/automail-arm/run.py \
  --root /absolute/new-output/automail \
  --skill-root /absolute/frozen-refas-skill
```

Use `--blender /absolute/path/to/blender` when it is not on `PATH`. The public
doctor resolves that executable once; production steps and independent GLB
inspection use the same resolved executable.

The default `all` phase requires a fresh output root. It creates the first
candidate, applies the two retained source-review corrections, performs the
service edit and exact restore, saves four pose samples, restores neutral, and
independently reimports the GLB to check hierarchy and limited articulation.
This reproduces the previously reviewed construction sequence; inspect the
actual new images when changing the scripts or reference.

To exercise an existing selected native revision without rebuilding:

```bash
python3 examples/automail-arm/run.py \
  --root /absolute/existing-output/automail \
  --skill-root /absolute/frozen-refas-skill \
  --phase exercise --baseline SELECTED_REVISION_ID
```

## Files and scene convention

| File | Responsibility |
|---|---|
| `create.py` | Complete authored arm; shared profile meshes for major shells |
| `correct_shells.py` | Opens the side channel, narrows the bright socket rim, lifts markings |
| `correct_proportions.py` | Widens shoulder armor and narrows the over-wide elbow |
| `edit_panel.py` | Measures and applies the 3 mm service-cover subtree translation |
| `pose_check.py` | Absolute elbow/wrist/index configurations and named-shell overlap observations |
| `review.json` | Fixed neutral front, side, back, oblique and service-detail views |
| `run.py` | Public-CLI orchestration, artifact copies, recovery and independent GLB inspection |

Units are metres, Z is up, front is −Y. The chosen right-hand interpretation has
the thumb on −X in the front view. Elbow, wrist and digit flexion use local X.
The shoulder socket is centered at Z = 0.690 m, elbow at 0.426 m and wrist at
0.184 m. The source's 760 mm label is a nominal interpretation; the selected
evaluated mesh envelope is 743.095 mm high, with the lowest modeled fingertip
at Z = 9.898 mm. This is not an exact dimensional reconstruction.

The hierarchy starts at `AURIX_ROOT`. `SHOULDER_PIVOT` carries the upper arm;
`ELBOW_PIVOT` carries the forearm and `WRIST_PIVOT`; each of `THUMB`, `INDEX`,
`MIDDLE`, `RING`, and `LITTLE` has `J0 → J1 → J2` under the wrist. The socket
mount remains under the root. `SERVICE_COVER` is a separate forearm child with
25 attached mesh objects. It moves along local +Y, outward on the back/palm
side of the neutral forearm.

## Produced outputs

The output root contains `candidate.blend` and `candidate.glb` in the restored
neutral state, `first-candidate.blend/.glb`, `panel-edited.blend/.glb`, all actual
renders under `renders/`, four native/exported pose samples under `poses/`, and
the public production history under `project/`. Scripts, hashes, command logs,
preservation measurements and export checks are retained alongside them.

`REPORT.md` and `report.json` distinguish visual observations, measured scene
properties, object-level preservation, exact artifact recovery and export
checks. Successful file checks do not establish source likeness or game-engine
readiness. The scripts deliberately make no claim about load-bearing behavior,
power assistance, a working hydraulic linkage, or continuous collision clearance.

The prototype still simplifies the source's compound armor curvature, rear
mechanical density, asymmetric fasteners and surface finishes. It has no skin
rig, animation clips, authored production UV layout, texture baking or LODs.
The retained 512 px / 16-sample CPU renders show visible sampling noise.

## Source-construction continuation

The later [source-identity checkpoint](../../docs/development/evidence/source-identity/README.md)
continues the selected arm with `refine_construction.py`. It adds nested armor
and recessed carriers, exposes the rear mechanism, builds a recessed service
assembly, and differentiates palm and phalanx shells. New parts attach to the
existing rigid hierarchy. Original pivots and material datablocks remain;
intentional shell material assignments and two moved crown markings are
recorded explicitly.

Begin `run_construction.py` with the previous selected native and a fresh root:

```bash
python3 examples/automail-arm/run_construction.py \
  --phase baseline \
  --root /absolute/output/arm-construction \
  --skill-root /absolute/extracted/skills/refas \
  --input-blend /absolute/previous-selected/arm.blend
```

Run the same arguments with `--phase revise` to produce a candidate and inspect
the fixed whole/detail views. `--phase open-service` produces the matched
before/after cover-opening diagnostic. `--phase exercise` explicitly selects
the latest candidate, applies the 3 mm local cover change, samples elbow and
wrist/index poses, restores exact payload bytes and independently imports the
GLB. Finally, `--phase readback` renders the independently imported asset.

The large cover-opening diagnostic is separate from the 3 mm editing exercise;
it is not a tested physical hinge. `inspect_construction.py` compares all
original native parents/transforms/material snapshots, then checks exported
hierarchy, transforms and bounded rigid motion. `construction_pose_check.py`
checks the added descendants under the declared samples. Neither inspection
proves continuous collision clearance or physical behavior. Timings retain
their measured scope and unknown model/tool monetary costs remain null.
