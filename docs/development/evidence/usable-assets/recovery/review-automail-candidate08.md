# Independent final automail review — candidate 08

**Recommendation: accept U4 and U5 for the declared rigid-arm use and local
construction retopology.** The arm's U2 defect and export checks are supported,
and its portion of U6 meets the fixed budgets. Whole-project U2 and U6 remain
dependent on the jacket. This is an informed continuation review, not U1's
matched blind comparison or a claim that the unavailable earlier 78,998-triangle
candidate was recovered.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| Selected `scene.blend` | `badf3fd5134ea44c77bef19890cf0f3157c8e2dbe622484eba7df713791d36f1` |
| Selected `asset.glb` | `08c4f510e903891eab2c0eee276b55de71abf6f1cda3d584a880ee508e3e63f5` |
| Detailed functional precursor | `85012f440e0e58b33b0d184d20fddcab1b259ac6b360b38040f39c9f92a3d219` |
| Recovered original native | `e7b2ac7cbd671d979af6e178ec85efc574ad9860c9695000980cf4a29f8a2dd7` |

Selected files are in `work/automail/candidate-08/`; selected production revision
is `a6a2e5dec7884effa9c42821e19549b6`. The reviewer independently recomputed the
selected native and GLB hashes and ran read-only source/geometry probes with
Blender 4.3.2 and `--threads 2`. The command, stdout and JSON are retained as
`review-automail-candidate08-mechanism.*`. No candidate input was saved or edited
by this reviewer.

## Source identity, retained parts and documented changes

The actual recovered original and detailed precursor both contain all **321
source meshes**. The independent comparison finds no missing source meshes or
new unrelated meshes. All 321 source parts now have a unique delivery mapping,
and all 99 mapped delivery meshes exist. There are no invented `Elbow_link_*`
objects.

For **289 source parts**, every corresponding evaluated neutral world vertex,
triangle count and original parent is exactly unchanged. The 32 explicitly
repaired parts are:

| Scope | Parts | Reason and preserved information |
| --- | ---: | --- |
| Palm chassis | 1 | Connected section topology recesses the dorsal core below the four original plates; local thumb-side clearance retains the original knuckle support. |
| Wrist annuli | 2 | Periodic shared boundaries replace duplicated end seams and artificial caps. |
| Upper hydraulic end caps | 2 | Close inherited open ends while retaining the segment-local curved routing. |
| Short hex socket bevels | 26 | Limit bevel width before consolidation so a vanishing side band does not collapse to zero area. Socket silhouette, material, position and parent remain. |
| Lambda glyph caps/rim | 1 | Remove actual overlapping cap tessellation while preserving the visible outline and small inner gap. |

The glyph repair uses the union of the original covered cap triangles, excludes
49 uncovered constraint regions, merges one overlap region and shares the 60 µm
extrusion rim. A rejected attempt that filled the gap was retained before the
corrected candidate was selected.

The optimization stage separately reduces bevel detail and small round hardware,
then consolidates only common rigid parent/material groups. This is not
presented as retopology. Actual pre-consolidation geometry for all 321 source
parts maps to all saved-native triangles with cyclic orientation; the largest
reported part-to-delivery vertex error is 6.036e-8 m. This is stronger than a list
of part names alone.

## U4: useful action and actual mechanical continuity

The arm performs a reach, partial grasp and return over 121 frames at 30 fps:
elbow 0–90 degrees, wrist ±12 degrees, four fingers with 45/55/30-degree joint
flexion, and thumb 18/35/20 degrees. The shoulder mounting stays fixed; this is
not a full upper-body reach or a closed-fist demonstration.

All 46 source parts selected by mechanism-related names remain. Source geometry
bounds and original authoring code substantiate segment-local upper/forearm
hydraulics and finger tendon guides. There was no original two-anchor elbow
bridge to remove. The separate design amendment rejects only the invented
external scaffold, retaining the source's compact rotary elbow.

The saved native contains the actual fixed axle and rotating rotor about the
elbow axis. Their modeled bounds overlap at the bearing. The original wrist
pivot was 9 mm below its real gimbal; moving it to z = 0.193 m leaves unchanged
neutral descendant geometry intact. Across all 121 poses, corresponding
delivered axis-center separation is at most **1.264e-9 m at the elbow** and
**4.215e-8 m at the wrist**. Detailed precursor axes remain parallel throughout.
These are geometric attachment observations, not load or manufacturing claims.

The final inspector checks **133 declared external armor/contact pairs at all
121 frames**, including cross-digit armor and palm/core against digit armor, and
reports zero crossings. This expanded scope was necessary: candidate 05's
proximal thumb armor crossed the palm in 49 frames. Independent exact triangle
intersection tests located that contact 8.28–15.45 mm from the hinge axis,
outside its 7.82 mm knuckle radius, with sampled penetration up to 1.326 mm.
That was a real moving-cover clash rather than intended seating. Local core
relief resolved it in candidate 06 without reducing thumb motion; the same
independent 121-frame test then found no crossings. The final 08 geometry keeps
that repair.

Root independently executed the actual final GLB in Godot 4.7.2:

- 119 nodes sampled at all 121 times, including all 20 pivots and all meshes.
- 14,399 native/consumer matrix probes; maximum matrix-component difference
  8.168e-7 against the unchanged 2e-5 tolerance.
- 86,564 imported triangles, 99 mesh nodes and actual animation movement.
- Zero failed checks. No GPU performance or frame-rate benefit is inferred.

The corresponding evidence is `work/automail/root-consumer-08/summary.json` and
its retained command/result files. The reviewer read this evidence rather than
duplicating the engine execution.

## U2: saved native, actual GLB and repaired failures

The selected saved native has zero nonmanifold edges/vertices, zero degenerate
triangles, zero inconsistent-winding edges and zero inward closed components.
The only boundary exception is **796 inherited contour seams in the AURIX
lettering**. It is an explicitly non-solid decorative surface, not a solid
fabrication model. The repaired Lambda has no winding exception.

This result follows actual rejected cases rather than an unexercised check:

- Candidate 04 had 384 exactly zero-area recess triangles after consolidation.
  The independent probe found duplicate world-coordinate points in all 384.
  Local bevel limits prevent this final-mesh defect.
- Original Lambda cap pairs overlapped on the same side of a shared 185 µm edge.
  Being inherited and open did not make that benign. Corrected covered-region
  retessellation removes the overlap instead of merely reversing one triangle.
- The independently measured thumb-cover intrusion described above was repaired
  in the actual moving geometry.

The actual GLB reimport maps **every one of 86,564 oriented triangles across all
99 meshes** to saved-native geometry. Maximum mapped vertex error is 6.007e-8 m.
Normal/UV display splits are accounted for; they are not mistaken for cracks.
The final negative control reverses one real GLB triangle's binary indices,
detects exactly that mesh/triangle mismatch and returns status 2, while all other
meshes still match. The selected native and GLB hashes remain unchanged. See
`work/automail/verification-negative-candidate-08/`.

No exhaustive all-object self-intersection claim is made. Bearing seating,
fasteners and other intentional intra-segment contact are outside the 133-pair
external-clearance check. The fixed views, mechanical bounds/attachment probe,
topology audit, failed-case measurements and actual export/consumer evidence
jointly support the declared arm use.

## U5: deliberate topology and required attribute scope

The palm is an inspectable connected construction mesh: nine longitudinal rings
of 16 vertices, **144 vertices, 272 edges, 130 polygons and 284 triangles**. It has
one closed surface component and no boundary, loose, nonmanifold, winding or
degenerate observations. The periodic wrist annuli and capped hydraulic ends
are deliberate construction repairs. Outer armor is retained, and the rebuilt
palm is exercised through the demonstrated grip. Polygon reduction alone is
not credited as this retopology evidence.

The independent attribute probe compares all 321 original and detailed parts:
all original material assignments and rigid parents remain; no source part has
skin vertex groups, and no material has an image-texture node. Existing UV layer
names remain on every part **except `Crown_A_mark`**. Its automatically generated
`UVMap` is omitted by the cap retessellation. The glyph's current material uses
no image texture, so its current appearance is unaffected. This unused UV loss
is explicitly accepted within the untextured scope; this review does **not**
claim that every original UV layer was preserved or transferred. The palm and
wrist construction rebuilds have no authored UV atlas to transfer. The detailed
original remains available for later texturing work.

See `review-automail-candidate08-attributes.json`. That probe establishes layer
presence and material/parent semantics, not UV-coordinate equivalence across
changed tessellation.

## Fixed-view and export visual review

The reviewer inspected the original concept sheet and selected revision's
actual neutral hero, elbow detail, dorsal hand and palm views. The compact
rotary elbow, original major silhouette, four continuous dorsal plates, thumb
support and material grouping remain coherent. No detached cover fragment is
visible in the examined hand views.

The reviewer also inspected final native grip/motion, hand wireframe, the
declared inside-shell observation, same-camera Lambda before/after material and
wire views, actual-GLB neutral hand, actual-GLB thumb grip and corrected actual-GLB
whole motion. Lambda's visible gap and outline are retained. The inside-shell
view removes the core only in an unsaved diagnostic scene; it is not the asset
being delivered.

The initial GLB screenshot helper imported at the factory 24 fps before setting
30, creating mismatched diagnostic frame numbers. Those images were rejected
and retained separately. The reviewer inspected the completed corrected views
after the helper set 30 fps **before import**, so frame 61 represents 61/30 =
2.033333 seconds. This rendering issue did not change the selected GLB bytes or
the actual Godot evaluation at explicit times.

Visual observations are in `work/automail/observations-candidate-08/`; neutral
production views are in selected revision `a6a2e5dec7884effa9c42821e19549b6`.
These are diagnostic 512-pixel views, supplemented by actual geometry evidence.

## Arm portion of U6 and remaining limits

| Measurement | Selected result | Predeclared limit or interpretation |
| --- | ---: | --- |
| Detailed functional triangles | 270,704 | Editable precursor retained |
| Native/evaluated/export triangles | 86,564 | At most 110,000 |
| Material primitives | 99 | At most 180 |
| Largest bidirectional sampled surface distance | 0.423727 mm | At most 0.6 mm |
| GLB bytes | 2,026,408 | Measured delivery size; no performance inference |
| Selected native bytes | 6,862,756 | Native delivery retained |
| Detailed native bytes | 5,990,496 | Editable detailed source retained |

The distance compares the detailed functional precursor and optimized parts in
both directions using vertices and triangle centroids. It is a stated sample,
not an exhaustive Hausdorff bound, and it does not conceal the separately
documented functional changes to the original source. Source-preserving fixed
views and exact untouched-part comparisons are separate evidence.

A final public production-CLI cover edit preserved 114 unrelated objects while
editing five selected objects, then restored 16 input/artifact files exactly;
its summary is retained under `work/automail/verification-cover-candidate-08/`.
This supports editable delivery and recovery, independently of geometric
acceptance.

The accepted scope is a reference-derived, untextured, rigid-part arm prototype
with a bounded reach/partial-grip animation. It does not certify arbitrary poses,
physics, actuator load, a skinned human attachment, a production UV bake, or a
runtime frame-time improvement. It does not complete the jacket-dependent U2/U6
checks or the separate U1 blind comparison.
