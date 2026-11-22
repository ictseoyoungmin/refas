# Independent contact map: separate candidate14 regional fit

**Status: diagnostic fitted candidate, not accepted.** This review is distinct from the clean individual-shell rest handoff [high42/low44](review-jacket-high42-low44.md). It independently localizes the new fitted body's contacts with the collar and corroborates the one new collar self-crossing. It supplies repair targets without defining a sewn-contact waiver.

## Exact evaluated input

`work/garment/candidate-14-clean44/regional-fit-low/wearable-regional-fit.blend`

SHA-256: `bc5adc12543fa04843785ea519fe91d3b3ced5c23be0f0cebcd6b343c4c60cae`.

Actual Blender read-only run: 2026-11-22 21:46:04–21:46:13 UTC, two threads, 9.258 seconds, exit 0. The helper loads only the two cloth objects from this file and the original collar from the source file. At frame1 both fitted objects have no shape keys and no vertex groups, identity world matrices, and their evaluated world vertices exactly equal the directly edited world vertices. Native inputs remain unchanged.

Original source collar SHA-256: `528a8b67b2cd74dd5724225a6da4065281f6cfdf033d52a0b28123eab804cafd`. Source row-grid SHA-256: `759350d9d8e52529c9afb7b847862e43b596e1d1b1aa89b16f5f9a1400087763`. Independent mapper SHA-256: `28d5f8bb0a4d0a08b4cd95c473e063fe7f13e0c1d591f59b68d5bfd7d9a21ba0`.

## Actual intersection locations

The independent float64 SAT reproduces **all 3,017** body/collar contact pairs reported by the author. Separate finite edge/triangle linear solves locate actual intersection points for every pair. Source row/column coordinates are interpolated at those intersection points; the map does not substitute triangle centroids or merely mark every face incident to a hinge vertex.

| Location in original collar parameterization | Pairs | Distance from actual column0 hinge polyline |
| --- | ---: | ---: |
| Column0 boundary, all involving collar rim | 466 | 0–1.800 mm |
| First original width cell, columns0–4 | 1,245 | 0–4.334 mm |
| Intermediate width, columns4–16 | 1,059 | 0.431–7.507 mm |
| Returned/free region beyond column16 | 247 | 16.951–33.026 mm |

Column0 is the source body attachment; column4 ends the first coarse width cell, column16 is the original neck crest, and column44 is the free piped outline. These are source construction facts and descriptive bands. Even the first cell contains outer/outer crossings, so neither proximity to column0 nor a body/collar object-name rule is an adequate acceptance criterion.

The 247 far-return contacts have a clear spatial split:

| Region | Pairs | Dense source rows | Dense source columns | World bounds, metres |
| --- | ---: | --- | --- | --- |
| Negative-X returned collar | 243 | 902.262–934.116 | 23.689–44 | x −0.092241…−0.075933, y −0.047957…−0.034022, z 1.410751…1.426272 |
| Positive-X returned collar | 4 | 455.877–457.659 | 26.845–27.929 | x 0.079444…0.081450, y −0.042698…−0.042542, z 1.416872…1.417062 |

All **24 contacts reaching the actual free outline, column44**, lie in the negative-X return at rows902.262–916.919. Its far-return contacts include 57 outer-body/outer-collar pairs and several lining/rim combinations. The four opposite-side contacts are outer body against collar lining. These are free returned surfaces, well beyond the attachment strip, and should be repaired before proposing a bounded sewn-interface interpretation.

No actual body/collar contact remains in the old erroneous endpoint row ranges0–8 or1376–1384. The earlier source endpoint repair therefore removed that contact region in this separate candidate; the large remaining counts cannot be attributed to that same rear-reaching endpoint defect.

See [source-coordinate plot](review-jacket-candidate14-contact-map/contact-parameter-map.png), [numeric summary](review-jacket-candidate14-contact-map/classification-summary.json), and [complete compressed pair records](review-jacket-candidate14-contact-map/all-contact-records.json.gz).

## Previous visible-gorge parameter patch

Five contact pairs meet the previously localized source rectangle rows930–934 / columns25–28:

`(4783,17866)`, `(3838,17866)`, `(3838,17868)`, `(3838,17869)`, `(3838,17870)` — each pair is `(body triangle, collar triangle)`.

They are now **outer body against inner collar**, 21.100–27.756 mm from the actual hinge. This does not by itself prove that the old visible outer/outer blue sliver remains in the current camera. It does establish that the body still crosses the free-return lining there. Final visual review and actual shell layering are both needed. The summary bounds describe complete contact segments; a segment may extend beyond the parameter rectangle that it intersects.

## New collar self-crossing

The independent audit reproduces the single collar inner/rim pair **17661/22302**. Its source faces occupy rows906–912 / columns43–44 on the same negative-X free return. The exact triangle corners are retained in the numeric report.

A second calculation using finite float64 edge/triangle linear solves finds two strict interior hits: edge parameters0.909677 and0.493797, with every receiving triangle barycentric coordinate strictly positive. Their intersection segment spans **80.178 µm**, around world `(−0.08845, −0.04093, 1.42037)` metres. This is a genuine interior crossing rather than only a shared corner or a BVH candidate. The segment span is not a penetration-depth estimate. See [independent edge solves](review-jacket-candidate14-contact-map/collar-self-contact-edge-solves.json).

## Repair recommendation and limits

Target coherent paired cross-sections of the negative-X returned collar, preserving the source attachment and crest, rather than moving the entire collar or permitting all body/collar contacts. The free edge, lining, and outer sheet should move coherently so that removing the outer-body intrusion does not introduce a new inner/rim fold. The small opposite-side inner contact can be treated as its own bounded patch. Any accompanying body depression needs measured avatar clearance, preserved outer/inner pairing, and the same fit on high and low comparison surfaces.

After those free-return defects are corrected, the remaining near-attachment observations still need an explicit source-bound physical interpretation and visual seating check. This review does not accept any of them automatically, and it does not assess the original avatar geometry or the final97-frame/exported garment. The clean pre-fit high42/low44 bytes and this partial fitted candidate remain separately identified.
