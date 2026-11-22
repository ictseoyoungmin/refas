# Independent geometric diagnosis of jacket candidate 03

The reviewer opened the actual `candidate-03/wearable-precheck.blend` in Blender
4.3.2 with two threads. No native file was saved or modified. The read-only
probe and complete numeric observations are retained as
`review_jacket_intersections.py` and
`review-jacket-candidate03-intersections.json`; the latter pins the input SHA-256.

## Finding: reduction removed useful deformation topology

The dominant collision cause is long triangles crossing the sleeve and elbow,
not simply a small hem clearance or a reversed normal. At rest, 252 body
triangles intersect the shirt in 3,021 triangle pairs. Of those 252 affected
triangles, 244 lie in the sleeve/shoulder height band and eight near the hem.

- Left triangle 40415 spans approximately X=0.171 to X=0.500 m: its long edge
  is 328 mm. One end is weighted to the upper arm; the other to distal forearm
  and hand. That single triangle intersects 76 shirt triangles at rest.
- Right triangle 41377 has a 350 mm edge across the same sleeve span.
- At frame 49, body triangle 40119 has a 310 mm edge and crosses 185 shirt
  triangles. Its vertices follow upper arm, forearm and distal forearm bones,
  leaving the flat triangle as a chord through the bent sleeve.
- The body mesh's longest edge is 368.6 mm at rest; 830 triangles contain an
  edge over 50 mm. The collar's longest rest edge is 239.9 mm. At the apex,
  representative collar triangles span neck/spine to upper-arm weights over
  approximately 271 mm and also cross the shirt.

Frame 49 contains 11,205 body/shirt intersection pairs involving 1,032 garment
triangles, plus 132 collar/shirt pairs involving 14 collar triangles. These are
triangle-pair counts, not distinct defect counts. There are no body-skin
intersections in the author's preserved result at the same frames.

The concrete geometry supports repairing reduction and local deformation
sampling before tuning fit margins or restricting the motion. The author was
already adding maximum-edge bounds and projection to the detailed fitted
surface when these findings were delivered. Those changes require new evidence;
they do not retrospectively accept this candidate. Subdividing long edges must
also preserve surface orientation, internal lining separation, attachment
placement and the fixed delivery triangle budget.

## Execution

```bash
blender -b /workspace/scratch/61afcdd4e3c6/work/garment/candidate-03/wearable-precheck.blend \
  --threads 2 --python-exit-code 1 \
  --python docs/development/evidence/usable-assets/recovery/review_jacket_intersections.py \
  -- docs/development/evidence/usable-assets/recovery/review-jacket-candidate03-intersections.json
```

Exit code: 0. The review classification uses actual world triangle centroids;
the broad height labels are location aids, not anatomical registration or a
claim about every visible patch. No avatar image, texture or full mesh is
included in the public report.
