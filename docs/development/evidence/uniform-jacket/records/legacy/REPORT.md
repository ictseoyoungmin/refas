# Uniform jacket — fixed RefAs 1.x condition

## Delivered result

**Editable reference prototype with unresolved visible defects.** The selected native source is `candidate.blend`; `candidate.glb` is the selected export. The model contains a hollow open-front cropped torso, genuine armholes, shaped hollow sleeves and open cuffs, notched lapels, standing back collar, pale piping, shoulder tabs, two front waist buckles, rear belt, and left-side shield/chain decoration. It was constructed from the supplied sheet with parametric surfaces, not imported geometry or reference-image projection.

The asset export contains **111 meshes, 71,382 triangles and 4 materials**. It contains no cameras, lights, floor or mannequin. The native scene includes review cameras and lights, outside the selected export collection. Front is −Y, wearer's left is +X, Z is up, units are metres, and the back-centre waist hem is at Z=0.

## Outputs

- `create.py`: full initial construction, export and rendering.
- `correct.py`: the single geometry correction; a separate appearance step follows its saved geometry stage.
- `edit_cuff.py`: native local edit, protected-part checks, edited GLB, detail render and exact restore.
- `render_glb_verify.py`: removes the native asset, imports the exact delivered GLB and renders it.
- `candidate.blend`, `candidate.glb`: selected reference prototype.
- `initial/candidate.blend`, `initial/candidate.glb`, `initial/renders/`: preserved first candidate.
- `geometry-correction.blend`: geometry-only intermediate before palette conversion.
- `edited.blend`, `edited.glb`: left cuff increased to 7 cm.
- `restored.blend`: byte-identical copy of selected 6 cm reference candidate.
- `renders/front.png`, `back.png`, `three-quarter.png`: actual selected native views.
- `renders/exported-glb-front.png`, `exported-glb-openings.png`: actual reimported GLB views; underside view shows open hem and cuff apertures.
- `renders/edited-left-cuff.png`: actual revised cuff close-up.
- `renders/refas-preview/`: successful low-resolution RefAs hero/side diagnostic preview, explicitly preview-only.
- `local-edit-verification.json`, `observations.json`, `report.json`, and `logs/`: detailed evidence, measurements, failures and tool results.

## Attempt and visual review

The initial whole model was built once. Its first render failed because this Blender build lacks OpenImageDenoise. Disabling optional denoising allowed the same geometry to render. The initial front/back/oblique views showed an incorrectly mirrored sleeve ring correspondence: one sleeve twisted at the shoulder; the sleeve transitions were angular and cuff piping partly intersected the sleeve surface.

Exactly **one geometry correction after visual review** rebuilt the sleeve ring correspondence, smoothed the sleeve lofts and reduced their wrist radii to clear cuff piping. `geometry-correction.blend` freezes this geometry stage. A separate appearance stage converted the supplied sRGB palette into linear material factors; the initial values rendered too pale. The selected three views and reimported GLB views were inspected. No second geometry correction was made.

## Local change and restoration

The wearer's-left cuff band's height along its stored sleeve axis changed from **0.060000008 m to 0.070000009 m**. The lower band edge stayed fixed, the upper piping moved 10 mm along the axis, and the buckle and eyelets moved 5 mm to remain centred. The buckle size was preserved. The edit was made in native source geometry; no GLB binary patch was used.

All **104 protected asset objects** retained their recorded geometry/transforms/properties/material assignments; their hashes remained unchanged, including after reopening the edited file. Material palette factors were unchanged. `candidate.blend` and `restored.blend` have the same SHA-256:

`12bad67bdd8ac19d44291af29919f3036aca833eeb5ecde820ebed35062275a2`

This is an engineering regression check, not source-fidelity approval. The local operation used native-source snapshots and verification; it is not represented as an admitted RefAs bounded-edit checkpoint transaction.

## Dimensions and interpretation

The body back centre is approximately 0.419 m high; collar stand is 0.030 m. The shoulder yoke spans approximately 0.362 m, close to the lower edge of the requested 0.38 m ±5% band. The sleeve seam was constructed around a 0.58 m target; exact cloth-pattern seam equivalence is not certified. Baseline cuff height is 0.060 m and outer circular cuff profile is about 0.270 m around.

Chest and hem circumferences were used as hypothetical closed elliptical cross-sections: chest semiaxes about 0.18/0.106 m give approximately 0.91 m around, while hem semiaxes 0.136/0.074 m give approximately 0.68 m. The actual open shell omits its front arc, so these are inferred closed circumferences, not measured complete garment loops. G=13 cm is interpreted as laid-flat cuff width; N=13 cm remains unresolved. I=7.5 cm is not imposed as the entire collar opening. Front/back/labelled-left panels decide decoration side despite conflicting obliques.

## Remaining visible defects

- **shoulder-armhole junctions (major):** Separate body/yoke/sleeve surfaces are not welded; shoulder peaks and visible sleeve-cap gaps remain, especially rear/oblique. Subdivision can separate the sewn boundary.
- **whole fabric (major):** Sleeves and body remain stiff and smooth; tailored folds, fabric ease, chest shaping and soft collar/lapel roll are simplified.
- **rear waist buckles (minor):** Buckle frames are partially buried by the curved rear belt in the back render.
- **lapels and shoulders (minor):** Lapel notch geometry is sharp and schematic; shoulder yoke width is about 0.362 m, at the lower edge of the requested 0.38 m tolerance.
- **left shield and chains (minor):** Shield fleur-de-lis and chain link pattern are coarse approximations; sleeve badge faces mostly sideways and decoration does not exactly match the sheet.
- **export appearance (note):** Native procedural bump is not embedded in GLB. Export keeps editable base color, metallic and roughness factors. Render noise remains without denoising.

## RefAs status and workflow boundary

The exact source was manifested, initialized and committed as source checkpoint `cp_9fd83ee1db1029fc003f`. Source-only `audit` is valid; GLB inspection is valid. The successful RefAs preview is `preview-only`. **Strict source-bound validation is BLOCKED** on candidate lineage, source semantic current-GLB evidence, relational evidence, registered multiview, independent visual review, realized contact/support and whole-object certification. These statuses are retained in `logs/validate.json`.

No registered source camera, external-construction attestation, canonical shape-stage acceptance, certified downstream checkpoint or source-fidelity certificate is claimed. Continuing prototype construction under these unsupported final-acceptance statuses was deliberate under this task's scope and short budget. Valid export, manual image inspection and a source-only audit do not prove reference resemblance.

## Timing and commands

The first reliable timestamp is **2026-11-21T18:52:59.814435+00:00**, recorded immediately after the first guidance read. The required pre-read start timestamp was missed; its exact value is unavailable. End: **2026-11-21T19:02:50.613155+00:00**. Elapsed since the first reliable timestamp: **590.8 seconds**, a lower bound on total wall time. No overrun was observed against the 900-second soft budget; no invented pre-read duration is added.

| Command | Measured run seconds | Result |
|---|---:|---|
| `/usr/bin/blender -b -t 4 --python create.py` | not recorded | First run failed at denoising after native/GLB export; no geometry review or correction yet |
| `/usr/bin/blender -b -t 4 --python create.py` | 14.105587482452393 | Same initial geometry rerun with denoising disabled; three views completed |
| `/usr/bin/blender -b -t 4 --python correct.py` | 26.984947443008423 | One geometry correction, separately saved geometry stage, then color conversion; three views |
| `/usr/bin/blender -b -t 4 --python edit_cuff.py` | 3.2454206943511963 | Local native edit, exported edited asset, detail render, reopened verification, byte-exact restore |
| `/usr/bin/blender -b -t 4 --python render_glb_verify.py` | 6.997783184051514 | Imported exact GLB after removing native asset, actual front and underside views |

Exact token use and complete tool-call counts were not recorded and are not estimated. No numerical likeness score is supplied.

## Guidance accessed and friction

Assigned snapshot only: **12 Markdown guidance files, 155,409 unique bytes accessed**. Byte counts describe files, not model-token use or full reception of truncated output. Initial oversized calls were truncated; operative leaves were reread. Spatial-reasoning's opening 125 lines were explicitly reread; its full certification discussion was not consumed. The frame template and small public CLI argument snippets were also inspected.

| Assigned guidance | Bytes |
|---|---:|
| `SKILL.md` | 9,491 |
| `references/INDEX.md` | 14,330 |
| `references/workflow.md` | 15,470 |
| `references/observation.md` | 12,654 |
| `references/provenance.md` | 2,091 |
| `references/spatial-reasoning.md` | 30,732 |
| `references/construction.md` | 19,245 |
| `references/checkpointing.md` | 8,849 |
| `references/validation.md` | 24,678 |
| `references/appearance.md` | 8,238 |
| `references/failure-routing.md` | 5,608 |
| `references/contracts/canonical-edit-boundary.md` | 4,023 |

- The timestamp was recorded just after the first guidance read, not before it. Pre-read start is unavailable; measured elapsed is a lower bound, with no fabricated pre-read duration.
- The first multi-leaf guidance call produced an oversized, truncated response. Several operative leaves were reread individually; this cost attention and additional calls. Byte totals below measure accessed files, not model tokens.
- Blender Cycles first failed because this build lacks OpenImageDenoise. Optional denoising was disabled; the identical initial construction was rerun.
- Checkpoint CLI discovery did not show a compact complete artifact example. Initial invocation supplied an inline JSON string, then paths, then incomplete objects; it succeeded after reading provenance and supplying path/kind/sha256/sizeBytes objects in files.
- preview-pbr requires --frame. A frame with an unregistered hero lacked registrationDigest and was rejected. Removing the optional hero allowed semantic-axis diagnostic previews without inventing source registration.
- External-construction attestation, canonical shape checkpoints, registered source projection, and certified downstream closure were not attempted for this draft. The source checkpoint is valid, but native edits are not claimed to be runtime-admitted RefAs transactions.
- Initial sleeve frame logic caused one mirrored shoulder to twist. The single permitted geometry correction repaired angular correspondence and smoothed both sleeves.
- Initial palette values were entered as linear RGB and looked too pale. A separate appearance step converted the given sRGB palette to linear factors; geometry-only correction was saved before that step.

This single attempt exposes concrete construction and workflow issues. It cannot establish general superiority of a skill or model.
