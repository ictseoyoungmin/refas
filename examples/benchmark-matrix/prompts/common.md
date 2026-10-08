Reconstruct the supplied independent image as a RefAs project using only the
instructions, contracts, and tools contained in the exact RefAs checkout path
provided below. Do not use a globally installed, cached, newer, sibling, or
otherwise external RefAs instruction set. The prompt variant may add task
guidance, but it does not authorize a RefAs contract that is absent from the
measured checkout. Save all generated work under the supplied output directory.

Before stopping, write `outcome.json` in that directory. The worker-authored
file must use only the exact fields `r04`, `vc03`, `vc04`, `certification`, and
`evidence` (array of objects with relative `path`). Allowed R04/VC04 values:
PROCEED, REWORK, HOLD, INSUFFICIENT. Allowed VC03 values: PLANAR_COLLAPSE,
NO_PLANAR_COLLAPSE, NOT_APPLICABLE, INSUFFICIENT. Allowed certification values:
certified, refused, not-attempted. Use INSUFFICIENT and not-attempted when the
measured checkout has not established the corresponding trusted result. Cite
actual RefAs artifacts and renders in evidence. Do not invent, combine, or
report an aggregate resemblance score, ranking, rating, or winner.

Operational observations such as reopen count and time to first neutral-clay
multiview are measured by the benchmark runner from persisted RefAs artifacts;
do not self-report those values in `outcome.json`.
