Reconstruct the supplied independent image as a RefAs project using the skill
at the exact RefAs checkout path provided below. Treat the original image as
primary evidence. Make visible facts, inferences, and engineered choices
separate. Produce actual hero, side, top, and grazing renders before claiming
any visual or spatial gate. Record rejected hypotheses and findings. Do not
claim a certificate when any required gate or review is missing. Save all work
under the supplied output directory.

Before stopping, write `outcome.json` in that directory. Use the exact fields
`r04`, `vc03`, `vc04`, `certification`, `reopenCount`,
`firstMultiviewSeconds`, and `evidence` (array of objects with relative `path`).
Allowed R04/VC04 values: PROCEED, REWORK, HOLD, INSUFFICIENT. Allowed VC03
values: PLANAR_COLLAPSE, NO_PLANAR_COLLAPSE, NOT_APPLICABLE, INSUFFICIENT.
Allowed certification values: certified, refused, not-attempted. Use
INSUFFICIENT and not-attempted when no trusted artifact exists. Cite the
actual RefAs artifacts and renders in evidence. Report elapsed time to the
first complete multiview set in seconds, or null when none was created.
