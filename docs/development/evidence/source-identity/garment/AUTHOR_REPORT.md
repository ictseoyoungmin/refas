# Uniform jacket — informed source-identity refinement

## Selected result

The selected editable asset is **identity-04**, revision
`d83189287d4d458397b05534083f00e1`. Its deliverables are `native.blend` and
`native.glb`. It materially improves the source-visible black straps, the
left-sided fleur-de-lys and hanging chain/pendant assembly, and the collar/lapel
depth relationship while preserving the continuous sewn body and the existing
cuff edit contract.

This was an informed continuation of the previously selected jacket. It used
the complete original sheet, the previous source-ambiguity decisions, actual
baseline renders, and the installed RefAs 2.0 production package. It is not an
independent workflow trial or a fair no-skill/1.x/2.0 benchmark.

## Inputs and preservation

The original 1672 × 941 source image was inspected in full before authoring.
Its SHA-256 is
`d8b85deb544c58009823ed8ed1478f20389c7a57cedc40870f64046cce76c7c5`.
The immutable supplied baseline was
`baseline/extracted/refas-jacket-automail-refinement/garment/selected/jacket.blend`,
SHA-256 `03de5a60b31bf32bae05cec46eeb4fe6220089c1043f274c772a4383cb9a1268`.
Both original files retain their initial bytes. The new project's historical
captures also retain the original native input and source image.

The body cage's face topology and its named left/right sleeve regions are
unchanged. Both armholes retain their shared 40-edge seams with two incident
faces per seam edge. The original six material datablocks are still present
in the independently reopened selected native file, and their original shader
data was not edited during authoring. New cloth, black strap and embroidery
materials were created as separate datablocks.

The nominal shoulder width, rear body length and sleeve-axis length remain
0.38 m, 0.42 m and 0.58 m. The body cage's largest deliberate vertex displacement
is approximately 14.48 mm, concentrated in the shaped sleeves. No armhole was
split and no wrist or cuff assembly was replaced.

## What changed

### Folded collar, lapels and cloth

The existing collar/facing object was reconstructed with a rounded stand,
narrower descending nape leaf and two shared gorge boundaries. Named vertex
groups retain separate collar, left/right lapel and gorge selections. The
front lapel leaves now sit over the actual evaluated chest surface, with a
modeled roll and fabric clearance. This corrects the inherited leaf's excessive
forward projection, visible in the fixed side and oblique views.

The body retains its original sewn cage and modifiers. Small chest and waist
changes add fitted volume; elbow-region offsets and broad folds give the
sleeves a restrained cloth response while fading out before the wrists. Seams
and shoulder tabs are fitted back to the evaluated cloth. The largest forms
were reviewed before selecting the ornament treatment.

### Straps and hardware

Waist and cuff straps now use an explicitly nonmetallic black material, with
thin pale edging. Silver buckle frames and tongues remain separate objects.
The previous bright gray strap faces could be mistaken for metal under the
fixed light rig; the new material clearly separates fabric straps from silver
hardware. No review light, exposure or camera was changed to obtain this result.

### Left ornament

The old wire-like emblem and indistinct terminal beads were explicitly replaced.
The sleeve and breast shields now have curved black fields, thin silver borders,
and raised three-lobed fleur-de-lys shapes. Alternating closed oval links form
the two front drapes, rear suspension chains and hanging tassels. Small lance
pendants remain visibly separate from their chains.

The final correction concerns only the lower front drape. Its centerline follows
the final cloth with at least 4.5 mm of front-surface clearance, preventing the
rising links near the sleeve anchor from entering the cloth. An independent
native comparison against identity-03 confirms that all other 99 mesh objects
retain canonically identical geometry, material assignments and transforms.

## Visual decisions and retained candidates

All four candidates remain available in the production project's revision
history with native, GLB, captured authoring script, actual renders and metadata.
`delivery-manifest.json` identifies each path and revision.

| Candidate | Decision | Concrete observation |
| --- | --- | --- |
| identity-01 | Rejected; retained | Better black straps and filled fleurs, but excessive cloth sheen made the garment too gray; vertical sleeve tassels entered the sloping sleeve. |
| identity-02 | Intermediate; retained | Darker cloth and sleeve-axis tassels fixed those defects. The lapel outline still projected too far in front of the actual chest. |
| identity-03 | Rejected after detail review; retained | Chest-seated lapels improved the side profile and breast ornament separation. The lower front chain entered the sleeve, producing separated silver dashes near its anchor. |
| identity-04 | Selected | The lower drape reads continuously under the identical ornament camera; the other identity-03 geometry is preserved. |

The comparison boards use unchanged transparent render PNGs composited on a
neutral display background. They do not rerender the scene or alter garment
pixels. The original PNGs remain under `renders/before`, `renders/after` and
each candidate folder. `comparison-whole.png`, `comparison-collar.png` and
`comparison-ornament.png` provide the useful fixed before/after pairs.

The review specification retains all six baseline whole-view cameras, the
three existing collar cameras and the original light rig. One additional
ornament camera was used identically before and after. All comparison renders
use 640 × 640 pixels and 32 Cycles samples. Camera, lighting, renderer and
reference-region metadata match exactly. Source-region association is retained;
the source image and model cameras are not geometrically registered.

## Local edit, restore and independent validation

The finalization stage exercised the existing left cuff edit script on the
selected model. Band axial extent changed from 0.0599871780 m to
0.0699871884 m, a measured increase of **0.0100000104 m**. Exactly these seven
objects changed:

- `L_Cuff_Band`
- `L_Cuff_Buckle frame`
- `L_Cuff_Buckle tongue`
- `L_Cuff_Piping_Proximal`
- `L_Cuff_Rivet_-0.022`
- `L_Cuff_Rivet_0.022`
- `L_Cuff_Strap`

The eighth left cuff object, `L_Cuff_Piping_Distal`, remained fixed. All 92
non-left-cuff objects, the opposite cuff and all material data remained
unchanged. The deliberately edited result is retained as `cuff-edited.blend`
and `cuff-edited.glb` with actual edit renders.

The public restore command then restored the selected revision. Every selected
artifact and captured input file matches the restored bundle by SHA-256 and
byte count. `restored.blend` and `restored.glb` are exact selected-file copies.
The current project head is restored revision
`749d1f1433e3454f8ba83799fca905d9`.

A fresh Blender process independently opened the selected native file and
imported the actual GLB. Both contain 100 mesh objects and 493,958 evaluated
triangles. Names and parent relations match; maximum matrix difference is
1.69 × 10⁻⁷ and maximum bound difference is 1.86 × 10⁻⁹ m. The continuous body
and collar have no evaluated boundary edges, no edges incident to more than two
faces, and no zero-area faces under the focused topology checks. The body cage
retains its intended three boundary loops: the connected front/neck/hem
opening and the two wrists. Solidified rims close the material volume without
filling the hollow garment.

The imported GLB was saved and rendered through a separate production project
under the same front-three-quarter and ornament views. Those actual images are
in `renders/glb-readback`. This exercises the requested export/readback path;
it does not establish target-engine readiness.

## Timing, versions and runtime observations

| Event | Recorded UTC |
| --- | --- |
| First observed authoring-session clock | 2026-11-22 12:09:56 |
| Runner's first start | 2026-11-22 12:13:24.423483 |
| First authoring-script CLI invocation | 2026-11-22 12:16:17.990800 |
| Earliest actual candidate render file | 2026-11-22 12:16:33.935843 |
| Final validation completed | 2026-11-22 12:29:48.222146 |

The original sheet and repository instructions were read immediately before
the first observed session clock. The first script timestamp is the submitting
public CLI invocation, not a separately instrumented Blender script-entry clock.
Identity-03 and identity-04 additionally record their actual script entry/end
inside Blender. The earliest rendered-file timestamp is distinguished from
completion of the full multiview bundle.

The runner records 22 owned subprocesses with UTC start/end, monotonic
start/end/duration, exit status, exact arguments, stdout and stderr. Their
durations sum to approximately 622.29 seconds. Public CLI child Blender runs
also retain the package's `run.json`, `blender.log` and elapsed duration; separate
monotonic endpoints for those nested package children are not exposed. Read-only
tool probes and visual review are not assigned fabricated process timings.
Concurrent machine load was uncontrolled. Model-token usage and billing are
unavailable and are not estimated.

The public installed package reports RefAs 2.0.0-alpha.1, Python 3.12.14 and
Blender 4.3.2 at `/usr/bin/blender`. All Blender authoring and validation processes
were restricted to two threads. The installed package was not changed.

No production runtime defect blocked the asset. Three runner corrections were
made during this informed task: reusable timestamps now come from the execution
clock or an explicit argument; duplicate candidate labels are rejected before
mutation; and changed native/source bytes require a new project root. Actual
duplicate-label and different-native guard checks are retained as JSON records
and ran without another render. Candidate script identity now hashes the
immutable captured `edit.py`. The first record's late mutable-path checksum and
its correction are both retained in `metadata_corrections`.

A preliminary fingerprint-only predecessor comparison reported differences in
nine tiny sphere studs/beads because Blender's sphere operator changed polygon
allocation order. The final independent comparison canonicalizes face order
while preserving winding and exact vertex coordinates, confirming unchanged
geometry. This is disclosed rather than presenting raw fingerprints as visual
or geometric proof.

## Reproduction and scope

`reproduce/` contains the selected captured `refine_identity.py`, runner,
independent inspectors, original cuff edit helper, review specifications,
source image and source ambiguity record. The repository authoring entry is
`examples/uniform-jacket/run_identity.py`. Run `baseline`, then a uniquely named
`candidate`, review the actual images, and run `finalize` with that label.
Every candidate starts from the supplied immutable baseline; previous revisions
remain retained. The selected script is a normal Blender Python script with
editable meshes, materials, named groups and modifiers.

This remains a static garment prototype. The source's cuff width/circumference
and collar-width labels remain ambiguous as previously documented. Hidden
lining, exact fold depth, embroidery relief and chain suspension geometry are
plausible interpretations. Some shoulder folds and broad smooth sleeve panels
remain less natural than the source. No new UV layout, rig, cloth simulation,
chain physics, engine test, optimized game budget or numerical resemblance score
is claimed. Successful technical checks support editability, preservation and
readback; visual selection is separately recorded in `visual-review.json`.
