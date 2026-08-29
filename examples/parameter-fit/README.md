# Evidence-bound parameter fitting dogfood

This fixture generates a target GLB and a deliberately wrong baseline, renders both through the portable RefAs renderer, and runs the public `fit-parameters` CLI. Every optimizer trial creates a real GLB and actual hero/side/top evidence. The selected geometry is ranked by measurements but remains explicitly subject to visual review and the normal RefAs checkpoint flow.

Run `npm run dogfood:parameter-fit`. Generated evidence is written under `examples/parameter-fit/output/` and is excluded from the product package.
