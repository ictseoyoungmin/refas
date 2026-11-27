# Independent automail contact and glyph follow-up

This extends the failed candidate 04 review with exact observations. It does not
select a final asset or replace the remaining consumer and visual checks.

## Proximal thumb cover: real intrusion, locally resolved

Candidate 05 native SHA-256:
`da55dbd4cd8d0831b593984df24750ccbb07c04dc12228e22971c2e3e8a0162b`.

The 05 grip thumb and palm renders alone showed a plausible seated bearing and
did not establish whether the reported contact was intended. The independent
`review_automail_thumb_probe.py` therefore tested both sets of triangle edges
against the other triangle, bounded intersections to the actual segments, and
reported contact in the current `THUMB_J0` frame. This confirmed real crossings
in all 49 reported frames, 37–85. At peak frame 61, all 21 BVH candidate pairs
were verified crossings.

The peak intersection extends 8.284–15.451 mm radially from the hinge's X axis.
The original knuckle radius is only 7.82 mm. Contact reaches 14.696 mm along the
negative local Z direction of the proximal cover, and sampled cover vertices and
triangle centroids penetrate the palm by up to 1.326 mm. Therefore this is moving
external-cover intrusion beyond the seated knuckle, not intentional bearing
contact. Full numeric observations are in
`review-automail-candidate05-thumb-contact.json`. Sampled depth is not an
exhaustive maximum penetration bound.

Candidate 06 native SHA-256:
`0c38bbf8927cf3e1e72443b61d09ffee4fa11e9a5dfcdf202c6acdfa623670a8`.

The candidate 06 builder changes the left/dorsal core only at z = 120–139 mm,
retaining the thumb support at z = 147 mm and the original thumb angles. Running
the same independent contact probe on these saved bytes found zero crossing
pairs at all 121 frames; see
`review-automail-candidate06-thumb-contact.json`.

The reviewer inspected the same-camera 06 grip thumb, palm and front renders plus
the whole arm at the 90-degree reach apex in
`work/automail/observations-candidate-06/grip/`. The visible plate silhouette and
seated knuckle remain coherent; no detached shell fragment is apparent. The
local relief is supported by both actual geometry and visual comparison. The
clip demonstrates a partial grasp rather than a closed fist, within the declared
elbow/wrist/digit ranges. These observations do not certify every possible pose
or every pair of internal mechanical surfaces.

## Lambda mark: inherited planar overlap is still a defect

The source's `Crown_A_mark` has 224 boundary edges and two inconsistent-winding
edges. `Crown_AURIX` has 796 boundary edges and no winding inconsistencies. Both
have zero degenerate triangles. These exact counts are retained in
`review-automail-source-lettering.json`.

The additional adjacency probe demonstrates why the two winding flags cannot be
excused simply because the text is an open, non-solid source surface:

- Front cap faces 9 and 10 share edge vertices 27 and 34 in the same direction.
  Both normals point toward -Y, and their third vertices lie on the same side of
  the common edge. The triangles geometrically overlap.
- Back cap faces 65 and 66 repeat that overlap with normals toward +Y.
- The shared edge is 185.129 micrometers long. The triangles have areas about
  2.9e-8 square meters, so they are small but not zero-area observations.

This is a cap-tessellation overlap. A normal recalculation cannot remove it, and
reversing one triangle would merely introduce an inward-facing patch. A local
cap repair that preserves the visible glyph outline is appropriate. Source
preservation establishes provenance, not a waiver of an unintended defect.
Exact coordinates, faces and normals are recorded in
`review-automail-source-lettering-adjacency.json`; the independent script is
`review_automail_lettering_probe.py`.

At the time of this review the author is repairing the glyph for a later final
candidate. U2 remains open until that saved native and actual GLB are rechecked.
