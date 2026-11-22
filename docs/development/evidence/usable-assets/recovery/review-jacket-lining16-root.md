# Root review of the repaired detailed collar and body

**Superseded contact acceptance:** a later independent float64 triangle audit
found real nonadjacent contacts in these frozen files. High16 and low29 are
rejected geometry checkpoints. The earlier metre-scale ray helper missed
small-triangle crossings; its zero-contact observations below are historical
failed detector output, not current acceptance. Numeric topology, source hashes
and sampled approximation observations are not invalidated by this finding.

Reviewed 2026-11-23 (Asia/Seoul). The frozen detailed file has SHA-256
`9eb977d1a3c8bd7ff1e565e2640fa03cd3c0e507ccc5ba290e9b9ed4662994fc`.
This review supports it as the next fitted detailed reference. It does not
accept an optimized garment, its animation, or an exported file.

## Visual observations

I inspected the whole collar front and nape, matched front/side/top views of
the return leaf, the earlier side view, and an isolated collar side view.
The nape forms a continuous upright band without the rejected stretched
protrusions. The lapel and front opening remain readable as the source design.
The former protruding return-leaf spike is substantially reduced by the local
cage repair; this is an explicit functional repair before optimization.

A thin orange strip remains in the diagnostic gorge views. I asked for its
actual face identity before treating it as a new defect or removing it.
Native camera rays identify connected inner collar faces, with the original
black satin lining material, on the turned return leaf and its free edge.
The strip remains when the body is absent. It is exposed underside at the
fold, rather than a detached fragment or the body penetrating the collar.
The retained construction is appropriate for this detailed reference. The
orange color is the diagnostic interior override, not the delivered material.

The author reports that attachment and crest columns stayed fixed during the
return-leaf cage repair. Its maximum evaluated outer displacement is 4.229 mm,
mean displacement 0.071 mm, with 51,102 of 62,325 collar exterior vertices
unchanged. These repair displacements must remain distinct from the subsequent
1.5 mm optimization comparison against this repaired reference.

## Saved audit and its limits

I checked the frozen file hash and read the saved-file full audit. Both meshes
report zero nonadjacent full-shell crossings, outer self-crossings,
nonpositive thickness faces, loose vertices, nonmanifold edges/vertices,
inconsistent winding, degenerate triangles and negative closed components.
The detailed body has 152,656 triangles and the collar 249,296. This paragraph
reports that saved audit; it is not a second independent all-triangle rerun.

The minimum face-normal projected separation is approximately **0.04825 mm
for the collar and 0.18279 mm for the body**. These are smaller than the
paired vertex offset lengths. A 0.25 mm lower bound on offset magnitude must
not be advertised as a uniform normal thickness or global clearance.

The optimized lining still needs its own full-shell and source-distance
validation. Rebinding, corrective motion, reseated decorations, material
appearance, body/shirt/vest clearance and actual export can each change the
result and require final observations. No rest-only geometry result clears
those remaining gates.

Input hashes are in `review-jacket-lining16-root-inputs.json`; the native face
classification is retained in `jacket-lining16-gorge-face-classification.json`.

## Later attachment view: separate visible body intrusion

A closer front-oblique attachment view exposed a **different** feature from
the orange lining strip classified above: a blue body-surface sliver is visible
through the collar. I inspected the matched original and fitted views in
`seam-source-review-v3`. The original also has a disrupted gorge, but inherited
overlap does not accept the fitted visible defect. The free rolled collar edge
remains continuous. The detailed reference remains an intermediate repair
input, pending this local attachment correction.

The author's camera-ray localization places the visible patch on body triangle
23918 at approximately (-69.489, -35.521, 1414.960) mm, about 0.470 mm proud of
the collar near rows 930–931, width column 27. This is a body surface patch,
29.7 mm from the body's free neckline boundary. It must not be confused with
the buried width-column-zero hinge anchors. Original-source correspondence
shows that those anchors were already buried: the worst original anchor is
12.097 mm inside the body surface, compared with 5.321 mm in the fitted model.
Those source comparisons identify construction history; they do not waive the
visible sliver or authorize globally moving the collar.

The planned repair is a smooth bounded body-only displacement, applied equally
to paired exterior/lining vertices and consistently to the detailed and reduced
meshes. It still requires its own visual, full-shell, avatar-clearance and
1.5 mm high/low error checks. No repair completion is claimed here.

## Independent contact rejection

The independent rest audit reports 6,326 collar / 4 body contact pairs in high16
and 1,224 collar / 5 body contact pairs in low29. These counts are tested
nonadjacent triangle contacts, not distinct defect-region counts. Shared-index
vertex adjacency is excluded; no geometric welding or arbitrary clearance
waiver is used. Float64 edge/triangle linear solves independently confirm strict
interior intersection segments of 1.128533 mm for low collar faces 15033/15037
and 1.387795 mm for low body faces 4481/22202. The metre-scale mathutils ray
helper misses those same pairs; translating and scaling them by 1,000 makes
the ray implementation find both segment endpoints. The frozen model bytes
remain unchanged.

The source body's four contacts are lining/lining; the high collar also has
147 exterior/exterior contacts. Correcting only the reduced lining cannot
resolve the reference itself. The next geometry revision must repair the high
reference and reduced result using a robust contact predicate, then repeat the
shape-error, visual, avatar-fit, motion and export gates. The production mesh
topology observer explicitly excludes self-intersection from its scope; this
finding concerns the task's additional contact helper.

Exact reports and counterexamples are retained in
`work/garment/export-review/frozen-cloth-review/` in the private recovery work.
