# Evaluated mesh and explicit attachment observations

The installed production skill gains one read-only Blender-side module,
`production/mesh_audit.py`, with two ordinary Python functions. It creates no
certification state or global game-readiness verdict. Authoring scripts can write
its results under `REFAS_OUTPUT_DIR` so the normal revision inventory retains them.

## Interface

```python
from mesh_audit import audit_mesh, anchor_gap

topology = audit_mesh(garment, meters_per_unit=1.0)
attachment = anchor_gap(
    anchor_object, support_object,
    anchor_local=(0, 0, 0), max_gap_m=0.001, meters_per_unit=1.0,
)
```

`audit_mesh` observes the current evaluated object. It reports boundary edges and
boundary groups with world-space locations; loose vertices, wire edges, edges
shared by more than two faces, inconsistent adjacent winding, degenerate triangles,
index-connected components, face-edge-connected surface components, disconnected
face fans at nonmanifold vertices, and each closed surface's signed volume. Counts
cover the entire evaluated mesh; detailed samples have an explicit bound.
Unit scale is required. Length/area thresholds are recorded and can be supplied
explicitly. Transform reflection and singularity are recorded.

Raw world signed volume reverses under a reflected object transform. The module
also records a determinant-adjusted volume to distinguish reflection from
inward-authored geometry. A mixed object containing one outward cube and one
inward cube has zero aggregate volume, but its inward surface is still found.
Surfaces touching only at a vertex or linked by a wire edge are also evaluated
separately. Their vertex-connected aggregate is not treated as a reliable shell.
Open or inconsistently wound geometry receives no volume-orientation decision.
An intentionally inward cavity shell still requires interpretation by the author.

`anchor_gap` measures a caller-chosen **fixed object-local anchor** against the evaluated target
triangle surface, in metres, at the current frame. Its result reports whether
that one unsigned distance lies within the caller's explicit maximum gap. It does
not infer attachment from parent hierarchy and does not prove contact area,
penetration clearance or a linkage. There is no automatic all-pairs scene scan.
The local point follows the object's evaluated transform; it does **not** follow
skinning, shape keys or mesh modifiers. A deforming garment's surface attachment
must be measured from an actual evaluated surface point or a transform-driven
anchor that follows that attachment.

Metric calculations use Python double arithmetic in a nearby common frame,
before world translation, and do not pass absolute-world coordinates through
float32 mathutils matrix multiplication or a float32 BVH. World coordinates in
the report are separate display values. A threshold that overlaps the reported
arithmetic error interval returns `withinDeclaredGap: null` and
`gapStatus: indeterminate`. A mesh tolerance below supported calculation
precision raises. These operations cannot reconstruct information already lost
in Blender's evaluated input data.

## Actual execution

```bash
REFAS_BLENDER_TESTS=1 \
REFAS_MESH_AUDIT_EVIDENCE=docs/development/evidence/usable-assets/mesh-audit \
python3 -B -m unittest discover -s tests -p test_production_mesh_audit.py -v
```

Blender 4.3.2 executed the complete seeded geometry probe. **Fourteen tests passed,
zero failed or skipped.** The unittest process reported 1.599 seconds
(1.679 seconds for the measured host command). This is a
single local regression execution, not a modeling-speed benchmark.

| Counterexample or control | Observed result |
| --- | --- |
| Outward closed cube | No listed topology findings; positive 8 m³ component volume |
| Cube with one face removed | Four located boundary edges and one closed boundary loop |
| One reversed cube face | Four inconsistent-winding edges |
| Outward and inward cubes in one object | Two components; one negative component despite zero aggregate volume |
| Different-size outward/inward shells sharing one vertex | One nonmanifold vertex and two surface components; the inward shell is found despite a positive aggregate volume |
| Outward/inward shells connected by a wire edge | Two surface components retain separate orientations; the vertex aggregate is indeterminate |
| Negative nonuniform object scale | Raw negative world volume and positive determinant-adjusted authored orientation |
| Inward cube plus negative scale | Inward-authored component remains detectable |
| Loose vertex and separate wire edge | One loose vertex, one wire edge and three index-connected components |
| Collinear triangle | One degenerate triangle |
| Three faces sharing an edge | One nonmanifold edge, separate from boundary counts |
| Intentional open cloth sheet | Boundary observed without automatic defect or readiness verdict |
| Evaluated Solidify modifier | Closed evaluated surface is inspected; original source counts/modifier type stay unchanged |
| Centimetre input scale | Corresponding metric volume is 8 × 10⁻⁶ m³ |
| Zero object scale | Singular transform and degenerate triangles; orientation indeterminate |
| Parented anchor on surface, then 5 cm away | First within 1 mm; second exceeds 1 mm despite retaining the same parent |
| 1 cm anchor gap at common translations 0, 10,000, 100,000 and 1,000,000 m | Gap remains 1 cm and exceeds the declared 1 mm limit in every case |
| 2 cm cube at the same translations | Volume remains approximately 8 × 10⁻⁶ m³; no translation-induced degeneracy |
| Limit at the arithmetic uncertainty interval | Explicit indeterminate result; no false within-gap decision |
| Invalid units, unresolvable tolerance, detail bounds, anchors and unsupported curve/empty or all-degenerate target | All twelve invalid calls raise instead of silently passing |

Full results are in [observations.json](observations.json), with the actual Blender
process log in [blender.log](blender.log). [execution.json](execution.json) binds the
module, test and observation hashes and retains timing/usage limitations.

An additional target-surface counterexample found that Blender's nearest-surface
query can return a result for a collinear triangle. The initial implementation
therefore did not reject an all-degenerate attachment target. The retained
[failing run](degenerate-target-counterexample/execution.json) has one failing
test. The corrected function excludes degenerate target triangles, records that
exclusion and its area threshold, maps the result back to the original triangle
index, and raises if no usable surface remains. The final fourteen-test run above
includes this repaired case; the earlier passing subset is under `initial/`.

Independent review then identified a shared-vertex orientation cancellation and
float32 absolute-world precision loss. The old implementation and execution are
retained under `pre-review-fix/`; the newly added regressions fail three tests in
[review-counterexamples/](review-counterexamples/execution.json). The final run
repairs these cases using face-connected surfaces, explicit vertex fans and
rebased double calculations. The original independent review remains unchanged
in [code-review-initial.md](../code-review-initial.md).

This helper does not perform self-intersection, inter-object penetration, body
fit, animation-range, source-likeness or engine-consumer checks. Those observations
belong to the actual garment/arm tasks. A detected boundary can be an intended
neck, front, cuff or hem opening; a disconnected mesh can be a deliberate rigid
part. Neither is automatically approved or rejected here.
