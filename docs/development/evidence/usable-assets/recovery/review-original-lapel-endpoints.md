# Original lapel endpoint defect and bounded repair decision

Reviewed 2026-11-23 (Asia/Seoul). This is an explicit source-defect repair
decision, not acceptance of a finished garment or an optimization error result.

The retained original jacket native has SHA-256
`528a8b67b2cd74dd5724225a6da4065281f6cfdf033d52a0b28123eab804cafd`.
The original reference sheet has SHA-256
`d8b85deb544c58009823ed8ed1478f20389c7a57cedc40870f64046cce76c7c5`.

## Evidence

The original collar cage has 347 longitudinal rows and 12 width columns.
At rows 0–2, the attachment is at approximately Y = -0.076 m while the
free edge is at Y = +0.069 m. The cross-section width is approximately
145 mm. At row 3, the free edge returns to Y = -0.0787 m and the width
falls abruptly to 2.54 mm. Rows 344–346 contain the mirrored defect at
the other lapel end. The same discontinuity survives the mapped and fitted
stages, where the long endpoint strips remain approximately 136 mm wide.
Exact original, mapped and fitted coordinates are retained in
`source-lapel-endpoint-coordinates.json`.

I inspected the original multi-view reference sheet. Its front, side and
detail views show a narrow front facing ending at the front waist, with
continuous silver piping. They do not show a facing strip extending from
the front attachment through the torso to the rear. The coordinate jump and
source outline support classifying the long endpoint strip as an inherited
construction defect. Retaining that accidental free-edge coordinate forced
extreme local curvature and obstructed a physically separated lining.

## Chosen scope

Restore only the affected endpoint profile rows to the continuous front-facing
profile established by their neighbors and the reference. Preserve the visible
lapel length to the waist and the intended sewn attachment. Remap the affected
piping endpoints and other attached details through the same declared source
repair. Do not remove the front facing or shorten it to make contact tests pass.

The earlier fixed-free-edge constraint was an implementation choice and is
superseded locally for this diagnosed defect. Original source bytes and all
failed candidates remain unchanged. The large displacement of those erroneous
points must be reported honestly; it must not be hidden inside the separate
1.5 mm approximation comparison between a repaired detailed reference and its
reduced counterpart.

The resulting candidate still requires robust whole-shell contact checks,
sampled high/low comparison, matched visual review, full wearing motion,
attachment checks and actual export/consumer validation. No result from those
future gates is claimed here.
