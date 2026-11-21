# Uniform jacket: reference production and local-edit pilot

## Common assignment

Use the supplied `source/reference.png` as the sole visual design reference to make an editable 3D uniform jacket in Blender. Deliver a credible garment prototype, its native source, a GLB, executable construction scripts, actual renders, and an honest account of unresolved differences. This task does not ask for certification, a body/mannequin, rigging, cloth simulation or engine integration.

Preserve the cropped fitted body, hollow open front, notched lapels and standing back collar, long shaped sleeves with open cuffs, narrow pale piping, shoulder tabs, two front waist buckles and the rear belt. The silver shield/chain decoration is on the wearer's left side. Follow the visible silhouette, side depth and garment construction before small decoration. Do not replace cloth surfaces with disconnected primitive placeholders or paint the reference onto a plane.

Use metres, Z up, X across the shoulders, and the garment front facing -Y. Wearer's left is +X. Put the centre of the rear waist hem at Z=0, X=0. Keep body, sleeves, lapels, piping and hardware identifiable for later edits. Do not include a ground plane, camera or lighting geometry in the exported asset.

### Reference priority and dimensions

- Front, back and labelled left views decide overall construction and the decorated side. Oblique views clarify depth but sometimes contradict the decoration. Retain one coherent garment and report the choice.
- Anchor the shoulder width near 0.38 m, back-centre body length near 0.42 m, and sleeve seam length near 0.58 m. The collar stand is approximately 0.03 m. A prototype tolerance of about 5% on these anchors is appropriate.
- Chest 0.90 m and hem 0.68 m are circumferences, not flat widths. The front is open, so report how any corresponding circumference was inferred rather than claiming a directly measured closed garment.
- The image labels G sleeve opening width and N outer cuff circumference both as 13 cm. Interpret G as a flat laid-out opening width, approximately 26 cm around; N is unresolved and is not an independent hard constraint. M cuff height is 6 cm. The collar-width label I=7.5 cm and some diagram arrow extents are also ambiguous; do not distort the whole garment to satisfy them literally.
- Main fabric is near #1A1A1F, piping #E6E6EA, hardware #C7CCD6. Use materials appropriate to the visible black fabric and metal; appearance must remain editable.

## Shared execution budget

This is one exploratory attempt per assigned workflow condition, not a statistical benchmark. Start a wall-clock record before reading the assigned guidance. Use the same locally available Blender executable. There is a soft limit of **15 minutes per condition**, with an initial whole-model candidate and **at most one geometry correction after visual review**. Preserve the initial result if correcting it. Report overruns and blockers honestly instead of hiding failed runs. Exact model-token usage is not available and must not be estimated from file sizes.

Read the original image visually. Use only the assigned workflow guidance; do not inspect other conditions, their output, or the repository's other examples/reports. External generated geometry or existing garment meshes are not inputs. General Blender Python APIs are available to every condition. Avoid spending the budget on an unrelated final certification workflow; report a prototype and any unsupported acceptance clearly.

Produce actual front, back and three-quarter views sufficient to inspect the model. A common observer will later render all candidates with the same recorded cameras, lights and image settings; your native scene is the comparison input. Similarity metrics alone are not visual acceptance.

## Local-change task

After selecting the reference prototype, save it as the candidate. In a separate native revision, increase only the **wearer's-left cuff band height from 6 cm to 7 cm along its sleeve axis**, keeping its buckle/piping aligned. Preserve the body, lapels, shoulder/chain decoration, opposite sleeve/cuff and materials. Verify the change and protected parts, then restore the reference candidate. Keep both the changed and restored files. This deliberate design change is an editing exercise, not a claim that it improves resemblance to the sheet.

## Output in the assigned workspace

- `create.py`, any one `correct.py`, and `edit_cuff.py`; capture extra source files if used.
- `candidate.blend`, `candidate.glb`, `edited.blend`, `restored.blend` (copies or manifest paths to exact existing outputs are acceptable).
- Actual PNGs and any failure logs.
- `report.json` and `REPORT.md`: start/end times, assigned guidance read and measured bytes, construction/review attempts, commands and execution times where recorded, output paths, local edit/restore checks, reference ambiguities, unresolved visible defects and runtime friction. Do not invent tool-call counts, tokens, numerical likeness scores, or quality claims.

Each condition runs independently. A single comparison can expose workflow friction and concrete model differences; it cannot establish general superiority of a skill or model.
