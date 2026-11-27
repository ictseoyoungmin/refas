# Fitted cloth reduction: isolated recovery experiments

These experiments use the unchanged detailed fit saved by garment candidate08.
They investigate a concrete failure before any new garment is selected. The
input/output hashes, script hashes and measured counts are in
[summary.json](summary.json). The private native files remain in the delivery
history; this public directory contains scripts and numeric evidence only.

## Failure identified

The integrated candidate08 had 148,292 garment triangles, exceeding the frozen
125,000 budget. Its complete cloth-vertex comparison found 2.029 mm body error
and 9.713 mm collar error, exceeding the frozen 1.5 mm limit. Both are actual
used surface vertices, not loose unused points. The collar's largest losses
occur around the nape. Low vertices projected onto some part of the detailed
surface did not prove that the resulting faces covered the original shape.

Repeatedly subdividing a missing ridge's nearest low face and projecting its
midpoints could keep those points on a different nearby part of the surface.
It added triangles without restoring the missing feature. Independently
recreating the lining from changed low-polygon normals also introduced errors
close to the 1.8 mm fabric thickness.

## Executed alternatives

| Experiment | Observed result | Decision |
| --- | --- | --- |
| Protect all missed original vertices and neighboring rings | Too many vertices retained; residual lining errors | Reject |
| Project the open exterior, transfer actual original exterior-to-lining offsets, retain dense boundary bands | Both cloth errors below 1.5 mm, but 113,560 cloth triangles before the other 58,400 garment triangles | Reject for budget |
| Space boundary protection and add individual missed feature points | Approximately 61,208 cloth triangles; isolated body/collar errors remained at about 1.65/1.61 mm | Reject for error |
| Bound deformation edges and protect neighboring vertices only when an isolated error stalls | Body 31,536 triangles at 1.2366 mm; collar 33,272 at 1.2483 mm | Geometry-only gate passes |

All preceding scripts and reports are retained. The final experiment uses
4 mm spacing to protect a sampled boundary without fixing every subdivision
point. It keeps the declared shoulder/elbow bands and subdivides long edges
in those deformation regions at a 25 mm threshold. The remaining body and
collar regions use separate bounded lengths. These are authoring controls,
not evidence of successful wearing by themselves.

Each iteration starts from the same detailed exterior. Source vertices that
remain exact carry their original lining offset. Other vertices receive a
float64, clamped, normalized barycentric transfer of the original offset
field. This preserves the detailed shell construction without projecting the
inside onto a nearby outside sheet. When full-vertex distance checks identify
a missing feature, original feature vertices are protected before reduction
is rerun. The budget and motion angles are never changed.

## Scope of the passing measurement

The final experiment checks every vertex of the detailed and reduced closed
cloth meshes against the opposite triangle surface in both directions. The
largest low-to-high error is 0.5294 mm. This is a declared vertex-to-surface
sampling protocol, not a continuous Hausdorff bound or a collision certificate.

The two cloth meshes total 64,808 triangles. Adding candidate08's other
58,400 garment triangles predicts 123,208, below the original 125,000 budget.
The integrated asset must independently verify its actual total, topology,
appearance, avatar preservation, wearing, rigid attachments, export and
consumer animation. This experiment grants none of those later decisions.

### Independent follow-up: candidate remains rejected

The [independent review](../review-jacket-transferred-lining.md) found 17
nonmanifold collar rim edges, each joining four side walls at a pinched exterior
boundary vertex. It also found unused vertices and visible exterior/lining
crossings at the nape. The detailed fitted reference already contained some
local folds, but the reduced lining introduced visible spikes. A reduced
intersection count and a passing distance value do not resolve those defects.
This intermediate is therefore **rejected**, and its complete numerical and
visual evidence remains intact while the cloth construction is repaired.

The scripts contain the recorded workspace paths for provenance. Reproduction
requires the exact identified private detailed input and an adapted workspace
root; no unprovided avatar or replacement reference is synthesized.
