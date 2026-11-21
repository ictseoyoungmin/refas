# Plain Blender condition — uniform jacket prototype

## Result

The selected prototype is `candidate.blend`, with its garment-only export in `candidate.glb`. The separate cuff revision is `edited.blend`; `restored.blend` restores the selected reference candidate. This is an editable exploratory garment prototype with visible unresolved surface intersections, rather than a production-ready clothing asset.

All files are under `/tmp/refas-jacket-evaluation/plain`. The initial candidate, its GLB, and all three initial renders are retained in `initial/`.

## Execution record

- Start: 2026-11-21T18:52:41+00:00
- End: 2026-11-21T19:04:42.111929+00:00
- Recorded wall interval: 721.1 seconds (12.02 minutes); 15-minute soft budget not exceeded.
- Blender: 4.3.2, executable `/usr/bin/blender`.
- One initial whole-model construction, one geometry correction after visual review, and one render-only retry for a missing denoiser.
- RefAs skill/runtime/documentation read: none, 0 bytes. Common `TASK.md`: 5219 bytes; `reference.json`: 2391 bytes. The sole source image was visually inspected before modeling; its file size is 2666378 bytes.
- No other workflow condition, repository example or output was inspected. No external garment geometry was used. Token usage and tool-call counts were not estimated.

## Construction and correction

`create.py` constructs a real open torso shell, hollow shaped sleeves, separate notched lapels, a standing rear collar, shoulder tabs, waist belt and front buckles, cuff assemblies, pale piping, a stylized shield and individually modeled chain links. Materials remain editable. The native scene includes studio lights and a camera; the garment collection includes only mesh, curve and empty objects. No mannequin or floor is present.

The initial render showed over-bright cloth, floating tab edges, cuff bands with an incorrect vertical orientation, and poor sleeve/armhole transitions. `correct.py` is the only geometric review pass. It rebuilds the torso as four connected panels with explicit armhole boundaries, corrects sleeve normals and seam length, aligns cuff parent axes, lowers the tabs, turns the lateral shield partly toward the front, and reduces cloth sheen. It preserves the complete initial candidate before changing the selected model. Several armhole and cuff intersections remain and are explicitly documented below.

The initial render failed with **“Failed to denoise, build has no OpenImageDenoise support.”** The native file and GLB had already saved successfully. `render.py` disables denoising and produces real images. `create.py` was also updated to use the supported render settings for reproduction. The original failure is retained in `build.log`.

## Dimensions and interpretation

| Item | Evidence / value | Interpretation |
|---|---:|---|
| Shoulder seam span | 0.3776 m | Maximum X span across the two sleeve root control loops |
| Rear-center body length | 0.4200 m | Rear-center body control vertices from hem to neck |
| Outer sleeve seam | 0.5678 m each | Polyline along the modeled outer sleeve control seam; initial value was 0.6177 m |
| Collar stand | 0.0310 m | Corresponding bottom/top control row difference |
| Reference cuff band | 0.0600 m | Along the cuff's sleeve-aligned local Z axis |
| Edited left cuff band | 0.0700 m | Same axis and fixed distal cuff edge |
| Inferred closed chest | 0.8996 m | Elliptical construction perimeter before removing the open front wedge |
| Inferred closed hem | 0.6874 m | Elliptical construction perimeter before removing the open front wedge |

These are construction measurements, not a claim that a closed chest or hem was directly measured on this open jacket. The 13 cm flat cuff width is interpreted as approximately 26 cm around; the nominal cuff base ellipse is about 26.1 cm around. The contradictory 13 cm outer circumference label is not enforced. Collar width I is also treated as ambiguous. The decoration remains on the wearer's left (+X), following the front, back and labelled left views; conflicting oblique decoration is not duplicated. The scene uses metres, Z up, front -Y and the rear-center hem at X=0, Z=0.

## Cuff local change and restore

`edit_cuff.py` increases the wearer's-left band from 60 mm to 70 mm along its local sleeve axis. The bottom piping stays fixed. The upper piping moves 10 mm toward the shoulder. The buckle, narrow strap, tongue and eyelets move together by 5 mm so they remain centered on the band. The buckle shape is not stretched.

Seven asset objects change. Fingerprints of the remaining **78 objects** match before and after the edit, covering the body, both main sleeve meshes, lapels, shoulder/chain decoration, opposite cuff, and other protected geometry and transforms. Material node input hashes also match. Reopening `candidate.blend` and saving `restored.blend` reproduces every recorded asset geometry/transform fingerprint and material hash. The selected `candidate.blend` itself is not modified by this edit operation.

The checks cover mesh vertices/topology, curve control points/radii, world transforms, parent identity and material assignments, plus shader inputs. They are an edit-isolation check. They do not certify production topology or visual fit. The pre-existing cuff/sleeve overlap is visible in both close-ups; increasing band height does not fix that overlap.

## Actual images

- `renders/front.png`
- `renders/back.png`
- `renders/three_quarter.png`
- `renders/cuff_left_70mm.png`
- `renders/cuff_left_restored_60mm.png`

Final whole-garment renders use Cycles at 48 samples, 1000 × 1100 pixels, no denoiser. The cuff images are 800 × 900 pixels at 40 samples. The images are rendered from the native mesh scene, not composited or image-generated. The observer should use `candidate.blend` for shared-camera comparison.

## Unresolved visible differences

- The sleeve/armscye transitions retain pinching and small triangular surface intersections, particularly visible from the back and at the front upper arms. They are not production-clean sewn joins.
- Upper cuff piping and part of the buckle strap intersect the main sleeve on their front faces. The local height edit is geometrically verified but does not fix this pre-existing overlap; the close-up images make the limitation visible.
- The lapels are more angular and planar than the softly rolled reference, and the uniform-height back collar is less naturally folded.
- The shoulder tabs remain thin with some visible separation. The simplified shield has a rigid patch silhouette, and small fleur-de-lis detail, chains and pendants are approximations.
- Sleeve fold distribution is procedural and comparatively smooth; no garment simulation or sewing-pattern fit was performed.
- The three-quarter render clearly shows the open front, neck, waist and cuffs, but resemblance is a visual prototype assessment only. No calibrated photo matching or numerical similarity score was produced.

## Export and scope

The GLB contains 83 mesh entries, 85 nodes, 6 materials, no cameras, no punctual lights and no animations. The export uses only the garment collection's selected objects. Body, sleeves, lapels, cuff components, trim and hardware are identifiable by object name in the native source.

No cloth simulation, mannequin fit, rigging, engine integration, calibrated camera matching or certification was attempted. No numerical visual similarity score is claimed. This one attempt documents concrete modeling/editing results and friction; it does not establish superiority over another workflow.

## Reproduction and evidence

Run `create.py`, then `correct.py`, then `edit_cuff.py` with Blender 4.3.2. `render.py` is the retained render-only recovery script. `audit.py` records the selected candidate's dimension checks without modifying it. `report.json` contains exact output paths, file sizes, measured timing fields, command lines, interpretation choices, and the local edit checks.

Recorded elapsed times: initial geometry/export before rendering 1.901 seconds; correction/export/three renders 54.424 seconds; cuff edit/check/restore/two renders 25.633 seconds. The overall wall interval above includes image inspection, source writing and report production.
