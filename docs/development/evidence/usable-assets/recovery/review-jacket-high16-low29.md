# Independent review: high16 / low29 cloth handoff rejected

**Decision: reject the frozen high16 and low29 main-cloth contact acceptance.**
The matched renders preserve the intended collar and body outline, and the
saved topology and sampled shape-distance measurements remain useful. A
stronger independent intersection check found actual self-intersections that
the earlier metre-scale Blender ray predicate missed. Neither file is a final
garment candidate.

This review concerns only the two main cloth meshes in their rest pose. It
does not assess all decorations, avatar clearance, motion, export or engine
playback. No source file was edited or saved by the reviewer.

## Exact frozen inputs

| Input | SHA-256 |
| --- | --- |
| `work/garment/geometry-repair/lining-16/repaired-detailed.blend` | `9eb977d1a3c8bd7ff1e565e2640fa03cd3c0e507ccc5ba290e9b9ed4662994fc` |
| `work/garment/geometry-repair/paired-low-29/optimized-cloth.blend` | `6afdd36a0c9a1c1dcfb22252aa87d33b7c4c7554f63264ca3a0cf65cc8d3db29` |

The independent checks read the immutable files, verified these hashes and
verified the same hashes after inspection. Blender 4.3.2 ran with two threads.
The complete command, stdout, stderr, UTC boundaries and 30.769-second
execution are retained in [the numeric evidence directory](review-jacket-high16-low29/).

## Geometry findings

The independent contact check obtains the evaluated saved geometry. A BVH
with 0.1 micrometre broadphase padding proposes face pairs. A float64 triangle
separating-axis test then checks both face normals, all edge-cross-edge axes
and in-plane axes for coplanar cases. The arithmetic epsilon is 1 picometre;
the broadphase padding is not an allowed penetration. Pairs sharing a native
vertex index are excluded and reported as outside this nonadjacent-pair scope.

Every reported pair was separately checked with a float64 linear solve for
each of the six triangle edges against the other triangle. This second method
does not call the SAT helper or Blender's ray helper. All 7,559 reported pairs
have nonzero intersection segments and strict interior barycentric evidence.
There are no uncorroborated pairs in this result.

| Variant / mesh | Strictly corroborated crossing pairs | Shell classes | Largest intersection segment |
| --- | ---: | --- | ---: |
| High16 collar | 6,326 | Outer/outer 147; inner/outer 1,541; inner/inner 4,066; outer/rim 146; inner/rim 402; rim/rim 24 | 5.463022 mm |
| High16 body | 4 | Inner/inner 4 | 0.350290 mm |
| Low29 collar | 1,224 | Outer/outer 134; inner/outer 554; inner/inner 314; outer/rim 92; inner/rim 130 | 5.463022 mm |
| Low29 body | 5 | Inner/outer 4; inner/inner 1 | 2.163444 mm |

Counts describe intersecting face pairs; they are not a count of separate
physical defects. Intersection-segment length is not penetration depth.
Full face IDs, shell classifications, sample coordinates, barycentric values
and intersection spans are retained in
[strict-crossing-classification.json](review-jacket-high16-low29/strict-crossing-classification.json).

Three concrete examples make the rejection independent of the aggregate
counts:

- Low29 collar faces **15033 / 15037** intersect along a **1.128533 mm**
  segment, around `(0.0748, -0.0782, 1.1111)` metres. The two strict hits lie
  inside the opposing triangles, with solve residuals at or below
  `2.17e-19` metres.
- Low29 body faces **4481 / 22202** intersect along a **1.387795 mm** segment,
  around `(0.1393, 0.0740, 1.3816)` metres. The solve residuals are at or below
  `1.58e-18` metres.
- High16 exterior collar faces **86003 / 86227** intersect along a
  **26.558 micrometre** segment near `(0.066484, -0.070758, 1.081600)` metres.
  Thus correcting only the low-resolution lining cannot resolve the source
  surface problem.

The first two exact face coordinates and solves are retained in
[contact-diagnosis.json](review-jacket-high16-low29/contact-diagnosis.json).

## Why the earlier zero-contact report is superseded

For the two exact low29 counterexamples, Blender's `intersect_ray_tri` returns
no hit at the native metre scale. Normalizing the ray direction still returns
no hit. Translating to a local origin and scaling all coordinates by 1,000
produces the two correct segment hits, with either normalized or unnormalized
directions. The geometry is unchanged apart from this coordinate conversion.

This is an observed small-triangle scale limitation of the previously used
predicate. It is not a coplanar-only ambiguity or a count caused by normal/UV
vertex splits. The triangles have disjoint native index sets and actual
strict-interior intersection segments. The reproduction is retained in
[ray-scale-diagnosis.json](review-jacket-high16-low29/ray-scale-diagnosis.json).

All ray-only zero-contact claims for these checkpoints must therefore be
superseded. Correct topology, positive mean paired thickness or small
high/low distance cannot override these intersections.

## What remains valid

The production topology observer was freshly rerun on all four saved meshes.
Each is one closed, positively oriented component, with zero boundary edges,
nonmanifold edges/vertices, inconsistent winding, degenerates, loose vertices,
wire edges or negative/near-zero closed components. Exact coordinate
duplicate triangle counts are zero. Outer/inner paired face multiplicities
and both pair/side attributes match. These are combinatorial and local
orientation facts; they do not prove an embedded shell without intersections.

Low29 contains **66,060 main-cloth triangles**: body 36,496 and collar 29,564.
The independently recomputed minimum face-average projected gaps are
51.226 micrometres for the low body and 50.141 micrometres for the low collar.
Positive face-average thickness alone permits local facets to cross elsewhere.

The author's fresh saved-file distance report compared every vertex and every
triangle centroid in both directions on corresponding outer, inner and rim
surfaces, as well as the complete shell. Its worst sample remains
**1.486655 mm**, low collar lining to high collar lining, under the fixed
1.5 mm budget. This is a finite sample result, not a continuous Hausdorff
bound or a geometric validity verdict.

## Visual review and separate gorge relief

I inspected all six matched high16/low29 renders from
`paired-low-29/views/render-observation.json`: whole front, rear nape and
collar front for both variants. They use the same recorded cameras and
diagnostic outer/lining materials, and load only the two cloth objects.
The body silhouette, lapel endpoints and rear collar roll remain consistent
between high and low at these cameras. Earlier needle-like nape artifacts are
absent. These views do not expose the small internal crossings found above.

The known blue body sliver through the orange gorge remains a separate
assembly defect. The later high-only local body relief image in
`seam-relief-high-probe-v1/renders/front-oblique.png` was compared directly
with the same-camera fitted-before image. The visible sliver is removed in
that image. The author records 63 outer/inner body pairs moved by at most
2.863946 mm, zero body boundary vertices changed and at most 3.725 nm pair
offset drift. This supports the local visual remedy; its old ray-only shell
zeros do not establish contact clearance and must be repeated with the
corrected detector. The field must also be applied consistently to matched
high/low inputs and assessed with the broader fit, motion and export gates.

## Prepared Godot lining checker

The independent `check_lining_gap.py` already uses float64 SAT, not the
Blender ray helper. Its unchanged SHA-256 is
`9276677062d8e7e5e4e770a510885d0e5c802d248946e1ab2628cf8a60c7b118`.
It correctly detects both exact native counterexamples at metre scale and
after local scaling by 1,000. It also rejects contact for analytically
separated copied-face controls at both scales: eight positive/negative
checks, recorded in
[lining-sat-scale-countercheck.json](review-jacket-high16-low29/lining-sat-scale-countercheck.json).

The final 97-frame actual Godot lining-point run remains pending. The prepared
checker covers two explicitly declared narrow facets and their actual paired
inner triangles, where present. It does not claim global all-vertex clearance
from twelve probes. The explicit consumer position profile, matrix thresholds
and raw weight handling remain unchanged.

## Required next boundary

Repair the contact predicate first, retain these rejected files and then
repair the actual high and low cloth geometry. Recheck the exact saved bytes
with independently corroborated contact tests. Only after that should the
matched body relief, detailed assembly, original-avatar clearance, all 97
motion samples, actual GLB triangle/material correspondence and consumer
checks be considered for garment acceptance. No U2/U3/U6 completion follows
from this review.
