# Independent review: high42 / low44 main-cloth rest handoff

**Decision: the exact high42 and low44 files pass the bounded individual-shell rest review. The complete wearable remains unfinished.** This result applies to two closed main-cloth meshes before the author's separate candidate14 regional fit. It does not transfer automatically to later fitted, rigged, animated, or exported bytes.

## Frozen inputs and provenance

| Input | SHA-256 |
| --- | --- |
| `geometry-repair/lining-42/repaired-detailed.blend` | `d390171806d787c21f98ca5a398117526d7cfc1f302c34bd46ea992ae28fcf0d` |
| `geometry-repair/paired-low-44/optimized-cloth.blend` | `2abed15053c1521bb2ad103d19c9d715b488e7cfcb7b5f2f15c8dea79f61b803` |

The native inputs were reloaded in actual Blender with two threads. The independent helper SHA-256 was `b08db640f84950f8e051041b3ad0044962e0a9984e952fb2b7d67545c9d96a8f`. Recorded process time was 2026-11-22 21:39:32–21:39:55 UTC; exit code 0. Both native hashes remained unchanged. All 59 entries of the author's frozen handoff manifest were independently checked against their actual hashes and byte lengths and matched.

See [raw native audit](review-jacket-high42-low44/independent-native-audit/report.json), [recorded command](review-jacket-high42-low44/independent-native-audit/command.json), [manifest verification](review-jacket-high42-low44/handoff-manifest-verification.json), and [evidence hashes](review-jacket-high42-low44/evidence-hashes.json). These reports pin the reviewed bytes rather than relying on a candidate number.

## Independent saved-native findings

| Mesh | Closed triangles | Nonadjacent padded-BVH candidates | Contact pairs | Minimum positive mean face-normal lining gap |
| --- | ---: | ---: | ---: | ---: |
| High42 body | 152,656 | 0 | 0 | 182.975 µm |
| High42 collar | 249,296 | 0 | 0 | 129.804 µm |
| Low44 body | 37,468 | 0 | 0 | 188.635 µm |
| Low44 collar | 22,708 | 0 | 0 | 94.664 µm |

The independent observer uses a BVH padded by 0.1 µm and a separately implemented float64 triangle SAT, including coplanar separating axes. It skips self-pairs sharing a native vertex index. In these four exact meshes there were no nonadjacent broadphase candidates, so the result does not depend on a near-parallel ray-triangle rejection. This is materially different from the rejected high16/low29 evidence.

All four meshes have one positive-volume closed component. The fresh production topology observation found zero boundary/wire edges, loose vertices, nonmanifold edges/vertices, inconsistent winding edges, degenerate triangles, negative closed components, and near-zero closed components. Duplicate coordinate triangles are zero. Shell-pair/side attributes are valid and the paired outer/inner face multiplicities agree. The reported mean projected gap is not a universal minimum pointwise separation or an animation guarantee.

## Reduction and shape bounds

Low44 contains **60,176 actual closed main-cloth triangles**. The author separately forecasts 117,990 total coat triangles after adding its current 57,814 secondary-triangle subtotal; this is a forecast, not an independently accepted final garment count.

I reviewed the saved-file surface comparison and verified its exact input hashes. It compares all vertices and all triangle centroids in both directions, separately for outer, inner, rim, and whole shell. The worst recorded side-specific distance is **0.319266 mm for body** and **0.954472 mm for collar**, below the unchanged 1.5 mm budget. The collar's worst case is a rim sample; comparing only its complete shell would understate this value. These are finite samples rather than a continuous Hausdorff proof. The surface-distance computation was reviewed from the pinned author output rather than redundantly rerun here.

See [saved surface comparison](review-jacket-high42-low44/author-saved-surface-comparison.json).

## Direct visual review and source-bound repair

I directly inspected the matching saved-file whole-front, nape, and collar-front images for high42 and low44. Their camera, framing, lighting, and diagnostic materials match. At the provided 640×480 resolution, the reduction preserves the shoulder/body outline, neck standing curve, lapel return outline, and front opening without a newly visible silhouette discontinuity. The rust lining visible near the collar base occurs in both images; it does not certify the body/collar interface as seated or collision-free.

I also inspected the original multi-view reference sheet, the before/after isolated collar endpoint front and side views, and the earlier nape view. The original reference depicts a lapel that terminates at the front waist. The rejected geometry's isolated side view exposes a long strip projecting rearward from that endpoint; the repaired high42 endpoint terminates locally at the front. The front view confirms that this removes the lateral spur while keeping the long descending front lapel. The nape curve remains visually consistent. This is a justified source-construction repair, not a reduction error silently charged against the 1.5 mm approximation budget.

The repair evidence identifies coarse endpoint rows 0–2 and 344–346. A front-opening ray had accepted the rear body and overwritten the intended front depth. The author records a maximum corrected cage displacement of 138.737 mm and maximum final high-collar outer displacement of 138.482 mm relative to rejected high16. Those large values are explicitly disclosed as fixing erroneous source points. High outer vertex indices remain available for lineage; the body outer surface is unchanged relative to high16, while its lining and local collar return geometry were repaired separately.

Reviewed images and their exact hashes are retained under [matched high/low](review-jacket-high42-low44/matched-high-low/render-observation.json), [isolated endpoint repair](review-jacket-high42-low44/source-endpoint-repair/render-observation.json), and [original reference](review-jacket-high42-low44/reference.png). These views contain main cloth only and diagnostic colors; they do not assess final black cloth shading, piping, ornaments, hardware, or avatar appearance.

## Remaining acceptance gates

This review grants only a clean rest-geometry handoff for each individual high42/low44 cloth object. It does not grant a body/collar contact allowance, complete garment acceptance, or a U2/U3/U5/U6 completion by itself. The following require the final assembled bytes:

- Source-aware body/collar attachment seating, with free-return/gorge penetration kept distinct from any defensible stitched contact.
- Avatar body/shirt/vest clearance and preservation, paired high/low fitting, all secondary attachments and metal shape preservation.
- Every one of the 97 native animation frames, including corrected shell gaps and self/inter-object contacts after binding and morph baking.
- Exact native-to-actual-GLB oriented/material face correspondence at the unchanged 2 µm tolerance across all 97 phases, and actual Godot playback under its separately justified precision profile.
- Final native/export triangle and primitive budgets, final shaded whole/detail/posed views, and edit/restore evidence.

The author has already reported a distinct partial regional-fit candidate14 with a newly introduced collar contact and body/collar intersections. Those findings do not alter these frozen pre-fit bytes, and this review does not clear that later candidate. The old high16/low29 files remain rejected: their previous ray-filtered zero-contact claims were superseded by 7,559 independently corroborated contacts. Their original bytes and rejection evidence remain preserved.
