# All-phase native / actual GLB correspondence checker

**Prepared and validated: every integer frame 1–97 at the unchanged 2 µm
geometric tolerance.** The extension uses a complete oriented/material face
bijection at rest, then checks its fixed vertex identities at every later
phase. It does not assume that the return half of the clip is symmetric.

This is checker validation on a small purpose-built exported fixture. No
rejected or unfinished garment was used for a final acceptance claim.

## Exact implementation boundary

The task-local helper is
`work/garment/export-review/inspect_correspondence.py`, SHA-256
`542f51b1061fd0f29256e3a6a2ae1ebc863414630cd548771ff0bff71b0b7eb2`.
The previous sampled implementation is retained unchanged as
`inspect_correspondence_before_all_phases.py`, SHA-256
`89d6285e2d0e9bcee791facdd9d755b24c4a735f9be3e74639729faeeada9a0f`.
No production observer, exporter, animation threshold or repository runtime
was changed for this extension.

Use `--all-baked-frames` for all 97 frames. The existing default continues to
perform full independent matching at frames 1, 49 and 97. An explicit frame
list beginning with 1 can also request `--fixed-rest-correspondence`; final
use will choose all 97 frames.

At frame 1, the original maximum-cardinality triangle matching retains every
face's distinct identity, cyclic winding and named material assignment. No
coordinate welding or index canonicalization is introduced. The fixed map
records one native triangle for each imported triangle and the exact native
vertex corresponding to each imported cyclic corner. All native and imported
vertices must participate in triangles; loose points are not silently omitted
or assigned a guessed nearest match.

At each later frame:

- Both evaluated vertex counts must match rest.
- Every native and imported triangle index triple must remain unchanged.
- Every named per-face material assignment must remain unchanged.
- Every fixed corner must stay within 2 µm of its paired native corner.
- The paired faces must retain matching orientation at that pose, and exact
  zero-area faces cannot produce an oriented match.

Any topology/material change fails the fixed identity rather than triggering
a potentially misleading fresh geometric rematch. Rest ambiguities remain
conservatively pinned; a later mismatch requires diagnosis and is not a
reason to change the tolerance. A failed rest bijection stops subsequent
assessment, records the unassessed frame list and remains a failed result.

The complete map is saved as a compressed numeric NPZ, with its SHA in the
report. Native capture retains every frame's positions and shares the rest
topology/material arrays only after checking the freshly evaluated values.
Actual GLB import still sets 30 fps before import and disables bone widgets.
All source input hashes are checked again after the run.

## Actual intermediate-phase corruption control

The fixture has 100 small boxes, 1,200 triangles, two named materials and real
normal/UV display splits. One box has a baked intermediate morph pulse;
the other 99 are static. The morphing box has 8 native vertices and 31
imported display vertices. This exercises complete correspondence without
using an avatar or a garment candidate.

| Actual run | Result | Observed scope |
| --- | --- | --- |
| Unchanged GLB, all 97 frames | Pass | All 100 meshes at every frame; zero measured position error |
| Corrupted GLB, frames 1/49/97 | Pass | The old three-pose sampling misses the changed phase |
| Same corrupted GLB, all 97 frames | Expected fail, exit 2 | Only frame 25 and only the morphing mesh fail |

The mutation changes **one actual GLB binary byte, offset 19118**, in the
morph animation sampler's frame-25 key. Its encoded weight changes from
**1.0 to 0.75**. Rest, apex and end key values remain unchanged; no mesh
positions, index buffers, other sampler or original native file is edited.

The all-phase checker observes a **1.000000164 mm** error at native vertex 6
and all five of its imported display-split copies. Its native world point is
`(0.009999999776, 0.009999999776, 0.114000000991)` metres, while the imported
point is `(0.009999999776, 0.009999999776, 0.113000000827)` metres. The triangle
orientation and named material assignments remain intact: the failure is an
actual intermediate deformation error, not a topology change.

Every other **9,699 mesh/frame result records** exactly matches the baseline.
This demonstrates why full phase coverage is necessary despite matching
rest/apex/end and equal total triangle counts.

| Fixture bytes | SHA-256 |
| --- | --- |
| Original actual GLB | `f7f58b5e065b703e7b38ac01c3b90c265d862cc22da76080f9d7daeb5c2f583b` |
| Intermediate-phase corrupted GLB | `ffbe4eabbdd838fc496e7cbd1b431845f33d4689f51d98f0577195f9c40cd1f0` |

The unchanged baseline run took 4.826 seconds and the all-phase negative run
4.579 seconds on this deliberately small fixture. These are not performance
claims for the final garment. Full actual native/GLB evaluation still runs
at all 97 times; only repeated face-search work is avoided.

## Retained ineffective control and consumer scope

An initial control changed the weight from 1.0 to 1.25. It did not alter
Blender's evaluated imported geometry because the imported shape key was
clamped to its maximum of 1.0. Direct inspection confirmed active animation:
the box changes from a 10 mm local maximum height at rest to 14 mm at frame
25, with the expected adjacent phases. The over-range key nevertheless
evaluates as 1.0. This attempted control is retained and explicitly does not
count as a valid negative control.

The successful replacement stays inside the supported range and changes
actual evaluated geometry. The observed clamp is also a real scope boundary:
this checker observes Blender's actual GLB import/evaluation, not a separate
implementation of raw glTF animation semantics. Final morph-key range and
interpolation observations must remain explicit, and actual Godot playback
remains an independent consumer gate.

The earlier real one-face-flip control remains unchanged at SHA-256
`18c4b9a2d2c5e87b57f634e464604edb69dbaa4e1bbfc26ba1c2351dac1c07eb`.
Its existing one-missing / one-extra / one-reversed result is retained; the
new phase control supplements it rather than replacing it.

## Evidence and final use

[The evidence directory](review-all-phase-correspondence/) retains the tested
helper, prior helper snapshot, fixture native/GLB bytes, exact mutation
records, active-animation diagnosis, complete fixed maps, commands, UTC
boundaries and stdout/stderr. Full result JSONs are stored losslessly as
`report.json.gz`; [control-summary.json](review-all-phase-correspondence/control-summary.json)
contains the compact comparison and exact changed world point.

Final execution awaits the frozen integrated garment's own native file,
actual exported GLB and manifest. Every integer baked phase will be checked,
but no arbitrary subframe or continuous-time guarantee follows. Surface
validity, source-bound appearance, body/shirt clearance, attachments, original
avatar preservation and consumer precision remain separate required gates.
