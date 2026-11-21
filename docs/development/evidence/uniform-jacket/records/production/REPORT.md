# Uniform jacket — fixed RefAs 2.0 production condition

## Result

An editable prototype, GLB, construction/edit scripts, actual views, and the cuff edit/restore pair are complete. The selected native candidate is **candidate.blend**, corresponding to production revision `b503f3577f474decad644a32fe9002ce`. The restored native file is byte-identical to it. This is a prototype with visible construction defects; it is not a visually accepted or game-ready garment.

The assigned snapshot was `601a7f93` as provided. Work used its native `produce.py` doctor, init, run, restore and verify route, with `/usr/bin/blender` 4.3.2. No live repository code, other condition, example report, generated geometry or pre-existing garment mesh was inspected.

## Timing and guidance

The first explicit UTC clock was **18:53:03** on 2026-11-21, following the initial roughly one-second read/image call. The pre-read start is approximately 18:53:02, not an independently recorded UTC timestamp. Final report time: **2026-11-21T19:02:36.108655+00:00**. Elapsed from the explicit clock: **573.1 seconds**; under the 900-second soft budget.

The full assigned SKILL.md was read: **9,090 bytes**. Common inputs were TASK.md (5,219 bytes), reference.json (2,391 bytes) and the visually inspected original reference PNG (2,666,378 bytes). A diagnostic-only excerpt of the assigned snapshot's blender_worker.py was inspected to understand lighting: regex matches and lines 410–458. Exact byte accounting is in report.json. No compatibility/certification guidance stack was loaded.

## Construction and review

The first complete geometry was a hollow U-shaped torso and shoulder yoke, separate shaped open sleeve shells and cuffs, folded notched lapels, a standing collar, thin mesh piping, shoulder tabs, waist straps, rear belt, and left shield/chain pieces. The main fabric has editable charcoal cloth shading and a small procedural weave bump. Silver hardware uses metallic material. Curves were converted to meshes for the production exporter, while fabric subdivision and thickness modifiers remain editable in the native file.

There was one script initialization failure before a complete candidate: the empty production scene had no World. The script attempted to set its color. Adding a World fixed it without changing geometry. That failure log and runner-captured original script remain available.

The initial complete candidate was reviewed from front, back, three-quarter and side. Its sleeve tops were visibly open tubes, the upper-arm shield was partly buried, and fabric sheen was excessive. The single permitted visual correction changed the sleeve-root geometry into rounded caps, moved that shield above the sleeve, and reduced wool sheen/specular response. The initial result is retained as initial.blend and renders/initial. The corrected result was selected after all four views were inspected. No further geometry correction was made.

### Native run timings

| Run | Outcome | Recorded seconds |
|---|---|---:|
| Build complete hollow uniform jacket with fitted torso, shaped sleeves, notched lapels, piping and left silver chain decoration | failed | 4.884 |
| Build complete hollow uniform jacket; repair absent world initialization from first script attempt | committed | 19.055 |
| Single visual correction: sleeve caps connected to armholes, exposed left shield, restrained charcoal wool response | committed | 35.810 |
| Increase only wearer-left cuff band height from 6 to 7 cm along its sleeve axis, align piping and buckle, verify protected parts | committed | 18.847 |

## Dimensions and reference decisions

The native scene uses metres, Z up, front −Y and wearer-left +X. The nominal rear waist hem is at the origin. Shoulder seam width is parameterized at 0.38 m, back centre length at 0.42 m, sleeve axis at 0.58 m and collar stand at 0.03 m. The sleeve parameter is not an independent measurement of the final curved seam after the cap correction.

The extrapolated closed chest ellipse at z=0.255 m has radii 0.174/0.110 m and circumference approximately **0.9036 m**. The hem ellipse has radii 0.132/0.084 m and circumference approximately **0.6870 m**. These extrapolate across the actual open front; neither is a directly measured closed garment. The cuff opening uses about 0.258 m circumference, consistent with a 13 cm flat opening. The conflicting N=13 cm label was left unresolved, and collar-width I was not interpreted as full neck width. The authoritative front/back/labelled left views place the decoration on +X.

## Local cuff change and restoration

The separate edited.blend increases only the wearer-left cuff band along its sleeve axis, keeping the distal rim fixed. The nominal height changes from 6 to 7 cm. Direct base-mesh projection measured **0.059987178 m → 0.069987188 m**, a delta of **0.010000010 m**. The proximal piping moves 10 mm, and buckle/strap/rivets move 5 mm to remain centred.

Seven cuff objects changed. All **269 protected objects** had identical recorded geometry/transforms/material-slot/modifier fingerprints, including the body, lapels, shoulder/chain decoration and opposite sleeve/cuff. All material node fingerprints stayed identical. The distal piping stayed identical. The checks are recorded in cuff-edit-checks.json; edited front/side renders were inspected.

The native production restore command then published revision `d7b2e44e2fe24a00b22dacb1e3ba523e` from the selected candidate. restored.blend and candidate.blend have identical SHA-256 hashes, and the restored scene fingerprint also matches. `produce.py verify` passed its **recorded-file-integrity** check for eight current artifacts. These checks demonstrate scope and restoration, not visual resemblance.

## Unresolved visual and technical issues

- The most important remaining defect is the **visible gap between the sleeve caps and body armhole boundaries**. The cap correction improves the outer contour but does not produce a clean sewn junction.
- Shoulder tabs float slightly above the yoke. Sleeve shape and elbow folds are simplified. The collar is too regular/cylindrical and lapels remain stiff.
- Cloth still appears brighter and more blue-grey than the black reference under the diagnostic lights. The two-thread CPU Cycles renders disable denoising and remain grainy.
- Shield embroidery, chain routes, tassels, buckle contact and rear ornament visibility are approximate. Some rear details are occluded.
- The cloth has no deliberate production UV unwrap. Automatic UVs on small details are not UV validation. Procedural weave bump is not baked into the GLB.
- There is no rig, deformation test, cloth simulation, game budget, or engine import test. Fabric pieces are editable separate components, and their junctions need further modeling before production use.

The recorded evaluated scene contains **277 mesh objects**, **81,290 vertices** and **161,820 triangles**. The large object count mainly reflects individual chain links and metal/piping details. The exported garment contains no mannequin, floor, camera or light geometry.

## Files

- candidate.blend, candidate.glb: selected corrected prototype.
- initial.blend and renders/initial: preserved first complete candidate.
- edited.blend, edited.glb, renders/edited: cuff design-change revision.
- restored.blend: exact selected native candidate after native restore.
- create.py, correct.py, edit_cuff.py: executable source scripts.
- renders/candidate: actual front, back, hero/three-quarter and side PNGs.
- project: complete native production state, revisions, source copy and run logs.
- report.json, construction.json, cuff-edit-checks.json, restore-checks.json: structured account and checks.
- initial-run.log, initial-run-retry.log, correction-run.log, cuff-edit-run.log, restore.log, verify.log: retained CLI outputs.

Exact command details, run timestamps, source byte counts and artifact hashes are in report.json. Exact token/tool-call totals and numerical likeness scores are unavailable and were not invented. This single independent attempt does not establish general workflow superiority.
