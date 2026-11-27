# Independent classification of lining-07 collar contacts

The frozen diagnostic collar's ten nominated contacts are **actual nonadjacent
triangle crossings**. They cannot be exempted as ordinary shared edges or
rounding noise. This remains a rejected intermediate, not a selected garment.

The review loads only `Collar | standing back and neck facing` from
`work/garment/geometry-repair/lining-07/repaired-detailed.blend`. Its evaluated
vertex coordinates exactly match the author's retained `full-audit/collar.npz`.
The input and audit SHA-256 hashes are in the accompanying JSON.

An independent float64 finite-edge/triangle intersection calculation finds two
strict edge-and-face interior hits for every nominated pair. None shares a
vertex index. Their intersection segments measure **31.286–253.260 µm**;
the nearest vertices between paired triangles remain **456.8–567.3 µm** apart.
Crossing edge endpoints straddle the other triangle's plane by at least
**75.6 µm** on their nearer side in this set, far beyond a submicron numerical
contact. The triangle normals also establish noncoplanar contact.

Four pairs involve outer triangle 7979 and rim triangles 243993, 243992, 243983
and 243982. The other six pairs involve inner triangles 129771, 129768 and
129435 against neighboring rim triangles at the same front-return fold. The
author's planned smooth local leaf/cap correction is therefore warranted.

This bounded check classifies the existing ten reported pairs. It does not
repeat the complete shell audit, assert that other contacts are absent, or
grant topology, silhouette, optimization, attachment or motion acceptance.
No authored file was edited, and no avatar geometry or appearance was loaded
or published.

Reproduction: `review_jacket_rim_contacts.py`, invoked through Blender 4.3.2
with `--background --threads 2`. Exact per-pair triangle IDs, barycentric
coordinates, signed plane distances and intersection spans are retained in
`review-jacket-lining07-rim-contacts.json`.
