# Independent review of the corrected garment contact predicate

**The correction is sound for the declared nondegenerate triangle-contact
scope.** The exact 17 controls pass when rerun, and the saved whole low29
negative audit reproduces the independent **1,224 collar and 5 body**
self-intersection counts. This review validates the observer correction; it
does not accept any garment geometry.

## Reviewed source and execution

| File | SHA-256 |
| --- | --- |
| `examples/uniform-jacket/geometry_wearable.py` | `f3ebefdb756cc7d24d314901580d587536244df7b8a84f3cfaaf1fbf5825b738` |
| `examples/uniform-jacket/check_contact_wearable.py` | `5398303449d4fa67fa6a4785b267f425533c77c6aa8be47ea89072a5aa400a28` |
| `examples/uniform-jacket/inspect_shell_motion_wearable.py` | `08a5fb4ca78c2c4e6e95318d9a3b8b15c5f80c9b1245286c234b0e821c7e1ddd` |
| Actual native counterexample fixtures | `ec13c102c68198d32dd86c35778be9c0563d17688e2155c44c94a48345913cfb` |

The exact reviewed shell observer is preserved as
[inspect_shell_motion_reviewed.py](review-contact-predicate/inspect_shell_motion_reviewed.py).
The active authoring script later added an explicit body-only diagnostic option;
this preserved copy identifies the source actually used for the negative audit.

The fixture copy exactly matches the independent two-pair native diagnosis,
including the float64 linear-system intersections and their provenance. The
rerun completed in 0.149 seconds with exit code 0, `CONTACT_CONTROLS True 17`,
no stderr and all source hashes unchanged. Its command, UTC boundaries and
outputs are retained in [review-contact-predicate/](review-contact-predicate/).
No broad suite or new Blender geometry run was needed for this review.

## Numerical behavior

The predicate converts both triangles to finite float64 arrays and subtracts
the first triangle's first vertex before projection. It assesses both face
normals, all nine edge-cross-edge axes, and both face normals crossed with all
six edges. The last group supplies the in-plane separation axes needed for
coplanar triangles. Axes are normalized before comparison, so a small
triangle's area is not used as an absolute hit threshold.

The comparison tolerance is `max(1e-12, span * float64_epsilon * 64)` metres:
a scale-relative arithmetic term with a one-picometre floor. This is not a
physical penetration allowance. A boundary touch, or a gap within arithmetic
uncertainty, remains a contact observation. It does not waive a detected
overlap based on depth, length, name, shell type, pair count or visual
appearance.

The runnable controls contain the two actual missed crossings at scales
0.001, 1 and 1,000, each at both a local origin and translation
`[13, -7, 200]`: twelve positive checks. Five additional controls cover
parallel separation, coplanar overlap, coplanar separation, a shared-corner
touch and a transverse crossing. All expected values are reproduced. This
establishes the recorded numeric range; it is not a claim about arbitrary
floating-point extremes or every possible mesh.

## Exact degeneracy and adjacency scope

Shape or non-finite input errors raise exceptions. If either computed
float64 face normal is exactly zero, the contact function explicitly returns
`False`. Thus it is a triangle-area contact observer, not a point/segment
intersection solver for collapsed faces. This exact-degeneracy branch must
not be interpreted as proof that a degenerate triangle is acceptable.

The shell observer separately records degenerate faces on every requested
frame, using its conservative squared-normal threshold of `1e-24`, and the
production topology audit reports its own degeneracy observations. Final
geometry acceptance must continue to require the separate degenerate count
to be zero. Both low29 meshes have zero degenerates in the negative fixture.
There is no broad small-area skip in the contact predicate for nonzero
normals.

For self-contact, the shell caller excludes a face paired with itself,
duplicate pair order, and triangles sharing a native vertex index. All
remaining padded-BVH candidates are passed to the corrected predicate. The
shared-vertex adjacency exclusion is explicit; the result does not claim
that every fold inside a topological vertex fan has been assessed. Across
the two separate body/collar objects, contact is observed separately without
that self-adjacency exclusion.

## Exact low29 negative reproduction

The author's saved negative audit uses the same low29 bytes:
`6afdd36a0c9a1c1dcfb22252aa87d33b7c4c7554f63264ca3a0cf65cc8d3db29`.
Its command and result record the reviewed predicate hash. The saved output
hash matches the command record, and it explicitly requests frame 1 only.

| Mesh | Primary self-contact pairs | Independent pairs | Shell-class comparison |
| --- | ---: | ---: | --- |
| Body | 5 | 5 | Four inner/outer, one inner/inner: exact match |
| Collar | 1,224 | 1,224 | 314 inner/inner, 554 inner/outer, 130 inner/rim, 134 outer/outer, 92 outer/rim: exact match |

Every retained primary example face pair belongs to the complete independent
pair set. Counts and all shell classes match; the primary observation stores
only a limited example set, so this comparison does not claim a second full
pair-by-pair list comparison. The independent report already corroborates
the complete pair set with a separate edge-solve method.

The author also observes 3,116 body/collar contact pairs and labels them
unclassified. Sewn attachment context and unintended interpenetration still
require separate review. They are not silently exempted or counted as a
successful garment fit.

See [low29-comparison.json](review-contact-predicate/low29-comparison.json)
for the identity and count comparison. The retained negative audit supports
the observer repair and continues to reject the garment checkpoint. The
next high/low handoff and final native/GLB remain subject to independent
geometry, visual, motion and consumer review.
