# Installed Blender collapse weight semantics

The jacket author requested a direct check before protecting collar boundaries
and deformation bands. This was a controlled diagnostic of the installed
Blender 4.3.2, not a new repository test requirement.

`review_decimate_weight_probe.py` created the same 1,986-vertex UV sphere in four
fresh cases and evaluated Collapse with target ratio 0.1. The output is retained
in `review-decimate-weight-semantics.json`.

| Vertex group | Factor | Result vertices | Original upper vertices kept exactly | Original lower vertices kept exactly |
| --- | ---: | ---: | ---: | ---: |
| None | 1 | 200 | 0 / 961 | 0 / 1,025 |
| Upper 0, lower 1 | 1 | 962 | 961 / 961 | 0 / 1,025 |
| Upper 1, lower 0 | 1 | 1,026 | 0 / 961 | 1,025 / 1,025 |
| Upper 0.25, lower 1 | 1,000 | 200 | 8 / 961 | 0 / 1,025 |

**Zero weight protects vertices; one permits collapse**, with a nonzero factor
and no inverted group. The exact coordinate comparison tolerance was 1e-8 in
the sphere's meter-scale coordinates. A lower positive weight changes collapse
priority but does not lock the vertex. A target ratio cannot override protected
topology, so the final triangle budget still needs explicit verification.

This agrees with the edge eligibility check in Blender's primary
[collapse implementation](https://github.com/blender/blender/blob/main/source/blender/bmesh/tools/bmesh_decimate_collapse.cc):
an edge with a zero-weight endpoint is excluded. The installed-version probe
above establishes the behavior used by this recovery, independently of changes
to the upstream main branch.

For the specific garment repair, open boundary vertices and immediately adjacent
rings can be assigned zero, along with narrowly chosen deformation bands.
Reducible interior vertices receive one. Keeping original feature vertices is
materially different from subdividing a simplified triangle afterward: the
latter adds samples to the already simplified surface and cannot recover a
missing rim or nape ridge by itself. No particular garment candidate is accepted
from this synthetic probe.
