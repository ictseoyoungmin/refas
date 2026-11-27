# Independent review of the transferred-lining cloth experiment

**Disposition: do not select this mesh yet.** The measured shape-distance and
triangle-budget improvements are useful, but the low collar introduces a
nonmanifold rim and shows additional narrow outer/lining folds at the nape. The
fitted high reference itself also contains outer/lining crossings. A distance
pass against that reference is insufficient for U2 or final wearable acceptance.

Inputs are candidate 08's `fitted-detailed.blend` and
`root-transferred-lining-bounded-08/optimized-cloth.blend`. Exact input hashes,
counts and diagnostics are in `review-jacket-transferred-lining/report.json`.
The reviewer ran `review_jacket_lining_probe.py` read-only with Blender 4.3.2 and
two threads. Only the two garment objects were linked; no avatar geometry was
linked or rendered. The script completed observations successfully; its exit 0
is not an acceptance gate.

## New rim topology defect

| Variant | Object | Nonmanifold edges | Nonmanifold vertices | Loose vertices |
| --- | --- | ---: | ---: | ---: |
| Fitted high | Body | 0 | 0 | 0 |
| Fitted high | Collar | 0 | 0 | 0 |
| Optimized | Body | 0 | 0 | 8 |
| Optimized | Collar | 17 | 34 | 310 |

All four meshes have zero boundary edges, zero inconsistent-winding edges,
zero degenerate triangles and zero negative closed components. Those zero
counts do not negate the collar's nonmanifold edges.

The separate `review_jacket_nonmanifold_probe.py` localized every one of the 17
edges. Each connects an outer vertex to its paired inner vertex and is incident
to **four rim quads**, rather than two. For example, outer vertex 4168 and inner
vertex 12642 share rim faces 30236, 30239, 30240 and 30243. All flagged faces are
lining/rim material and contain no repeated vertex inside the individual face.

This is a pinched/branched open boundary propagated through the lining
extrusion, rather than a cap normal reversal. The reduced outer surface needs
valid boundary fans before extrusion. Preserving the corresponding original
boundary features in the next reduction is preferable to treating four-wall
edges as acceptable. The unused vertices can be removed separately, but removing
them will not repair the 17 rim junctions. Exact edge coordinates and polygon
indices are in `review-jacket-transferred-lining/nonmanifold-detail.json`.

## Outer/lining geometry and the reference limitation

The probe separates triangles using paired outer and inner vertex sets, tests
BVH candidate pairs with actual finite segment/triangle intersections, and
compares the transferred lining direction with each outer triangle normal.

| Variant | Object | Verified outer/inner crossing pairs | Outer triangles with nonpositive interior thickness |
| --- | --- | ---: | ---: |
| Fitted high | Body | 3,262 | 229 / 75,264 |
| Fitted high | Collar | 41,232 | 773 / 121,792 |
| Optimized | Body | 1,920 | 197 / 14,987 |
| Optimized | Collar | 25,934 | 1,324 / 15,291 |

Triangle-pair counts depend on tessellation and must not be interpreted as a
percentage improvement between high and low meshes. The signed thickness is
the negative dot product of the outer face normal and the average paired
lining offset. A nonpositive value means the lining is not on the intended
interior side of that local outer triangle; it is not the same measure as a
closed component's signed volume. The low collar reaches approximately -1.800
mm locally, despite the nominal 1.8 mm fabric thickness.

The current high reference already has actual folds/crossings, particularly
near the nape and garment openings. Retaining that reference exactly would
retain those defects. The optimized collar additionally has many outer faces
whose local orientation is inconsistent with the transferred lining direction.
This requires geometric correction, not just a broader error tolerance or a
normal recalculation.

## Matched cloth-only visual observations

The saved views use the same camera, lighting and geometry scale for high and
low. Blue is the exterior, rust is the lining/rim; these are disposable
diagnostic material overrides. The native input files remain unchanged.

- `high-nape.png` and `low-nape.png` show that the low rear collar contains many
  narrow spikes and blue exterior streaks through the rust lining. The high
  band is substantially smoother, although some source folds remain visible.
- `high-collar-front.png` and `low-collar-front.png` also expose the serrated
  neck band and local overlapping side/facing regions. The folded lapel may
  intentionally expose its lining; the issue is the narrow crossing/spike
  pattern rather than the presence of the rust material itself.
- Whole-front renders are retained for matching the larger silhouette. Neither
  whole-view similarity nor an error below 1.5 mm closes the local thickness
  problem when the fabric itself is only 1.8 mm thick.

The numeric optimization result remains evidence of a promising reduction
strategy: preserve original missed features, simplify the exterior and transfer
the known lining offsets. Before selection, it needs valid open-boundary fans
and a locally coherent fitted/lining surface, followed by the requested actual
wearing, attachment, motion and export checks. This review does not broaden or
weaken the frozen budgets.
