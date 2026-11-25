# RefAs work status

## Active work

RefAs 2.0 production rewrite: [Issue #398](https://github.com/ictseoyoungmin/refas/issues/398),
[rewrite/v2](https://github.com/ictseoyoungmin/refas/tree/rewrite/v2),
[Draft PR #399](https://github.com/ictseoyoungmin/refas/pull/399).
See the [implementation plan](development/refas-2-plan.md),
[Work OS](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7),
[fixed progress ledger](development/refas-2-progress.md) and
[skill relationship map](development/refas-2-skill-map.md).
Status: 2026-11-25, Asia/Seoul. Active installed identity remains unpublished
2.0.0-alpha.1; repository-only 1.x remains 1.4.2; published release is v1.4.1.
No main merge, release or change in acceptance: **30/37 = 81%**, open
U1/U2/U3/U6/E2/D2/D3; both final visual decisions remain unapproved.

This is a current resumption index, not a second append-only evidence ledger.
All previous detailed status text is retained at the
[immutable 28541316 work-status checkpoint](https://github.com/ictseoyoungmin/refas/blob/285413169bf8fd5aeb666061ff6a113ef364f6f3/docs/WORK_STATUS.md).
No underlying evidence, rejected candidates or tracked historical payloads
are deleted by this consolidation. Read the linked reports for exact scope,
source identities, recovery instructions and negative results.

## Current runtime and next authoring work

Latest verified runtime as of this documentation candidate: rewrite/v2
[`28541316`](https://github.com/ictseoyoungmin/refas/commit/285413169bf8fd5aeb666061ff6a113ef364f6f3).
[PR #421](https://github.com/ictseoyoungmin/refas/pull/421) adds the optional
read-only fixed transparent-view coverage comparison. On an older static
jacket, normal +10 mm cuff correction preserves the opposite cuff in both
views; a 6 mm adverse opposite-cuff displacement changes 255/214 protected
pixels despite global IoU above 99.66%. No source camera registration,
target-improvement judgment, automatic acceptance or garment fit claim.
Recorded verification: 948 JS, 172 local Production with actual Blender/Godot,
11 dogfood checkpoints and remote merge CI pass; 17 installed skill / 21
package files (286,138 bytes). These are #421's historical execution receipts,
not new executions by this documentation change.

User-approved shift: prioritize optional reusable geometry authoring operations
that materially improve shape or effort over more workflow gates. First:
explicit section-profile sweep, then shared boundaries, constrained deformation
and attachment/clearance. Reference fitting, retopology/attribute transfer and
LOD follow only when justified. Keep ordinary bpy, native revisions, existing
observations, no mandatory inference/DSL, and external specialist boundaries.

- [Design PR #423](https://github.com/ictseoyoungmin/refas/pull/423): plan and
  current status documentation. Original one-file head passed artifact/Node
  22/24 CI; the updated documentation head must pass its own checks.
- [Issue #424](https://github.com/ictseoyoungmin/refas/issues/424) /
  [Draft PR #425](https://github.com/ictseoyoungmin/refas/pull/425): first sampled
  section-sweep candidate. At e3bc39c6, 12 local numeric tests pass with exact
  source/test Git blob identity. An 81-sample rectangular-profile axis-switch
  control reproduces the old v1 formula's 180-degree change and four folded
  quads; minimum-rotation candidate has zero in this case. This is not a
  complete v1 or Blender benchmark. Actual installed Blender use, matched
  garment/hard-surface trials, source/visual review, full gates and cumulative
  budget verification are required before merging. No installed helper credit.
- Garment correction remains a real-use task: lower-left piping centerline and
  section orientation, belt control sections, upper collar construction.
  Protect the actual avatar and fixed contact/shape budgets; use the sweep
  only if its measured effect is better than native alternatives. Final
  native/GLB/Godot and independent fit review remain unaccepted.
- The current session lacks a full Git checkout, Blender and Godot. Do not
  count historical full tests or synthetic numeric controls as a fresh
  integration/asset pass.

## Runtime history index

| Change | Exact evidence and removal impact |
| --- | --- |
| Fixed-view comparison | [#421](https://github.com/ictseoyoungmin/refas/pull/421): optional coverage checks, no geometry or acceptance mutation. |
| Construction source meshes | [#419](https://github.com/ictseoyoungmin/refas/pull/419): native Boolean/Shrinkwrap source dependencies and protection; 14 final meshes, 4,416 triangles in the synthetic housing exercise. |
| Lattice | [#417](https://github.com/ictseoyoungmin/refas/pull/417): native cage controls and evaluated geometry; explicit conversion/removal for delivery. |
| Ordinary GLB input | [#415](https://github.com/ictseoyoungmin/refas/pull/415): explicit self-contained starting scene; native follow-up and restore. |
| Current docs and adapter name | [#413](https://github.com/ictseoyoungmin/refas/pull/413): repository-only archive and asset_import.py; historical files preserved. |
| Topology summaries | [#411](https://github.com/ictseoyoungmin/refas/pull/411): counts by default, bounded details on request. |
| Focused CI | [#409](https://github.com/ictseoyoungmin/refas/pull/409): Node 22/24, costly legacy JIT separated. |
| Native Curve | [#407](https://github.com/ictseoyoungmin/refas/pull/407): native control data and evaluated surface; explicit mesh conversion for delivery. |
| Standalone native inspection | [#405](https://github.com/ictseoyoungmin/refas/pull/405): read-only input query. |
| Surface attachment | [#403](https://github.com/ictseoyoungmin/refas/pull/403): explicit triangle-bound local section transport, not collision solver. |
| Native iteration and bounded outputs | [#401](https://github.com/ictseoyoungmin/refas/pull/401): native default, explicit delivery, object protection and redundant staging cleanup. |
| Initial rewrite, pilot, cutover, reference adoption | [#399](https://github.com/ictseoyoungmin/refas/pull/399), [plan](development/refas-2-plan.md), [ledger](development/refas-2-progress.md), [full historical status](https://github.com/ictseoyoungmin/refas/blob/285413169bf8fd5aeb666061ff6a113ef364f6f3/docs/WORK_STATUS.md). |

## Preserved detailed asset and recovery checkpoints

The following original checkpoint text is retained verbatim as historical
evidence, not current execution or approval. Remote ea64de8a and subsequent
runtime merges did succeed as recorded in PR399; the earlier pending wording
below records that earlier point in time.

## Previous: development checkpoint frozen; alpha runtime verified, garment unaccepted

At the user's request, this session closes at the current development checkpoint.
Further model authoring, fitting and export experiments are paused. Completed
observations and failed candidates are retained without new acceptance credit.
Read the [Korean development report and next-work plan](development/refas-2-development-report-2026-11-23.md)
for the implementation boundary, fixed checklist, unresolved geometry and next
approval conditions.

Actual export exposed two independent data-loss paths in Blender 4.3.2. The
production worker now retains every sampled animation channel and every positive
skin influence. The skin cutoff has no public setting: a structurally guarded,
export-call-only replacement changes its isolated 1e-4 constant to zero and
restores the original function in finally. Installed Blender source and saved
native data are unchanged; unknown cutoff structures fail for explicit review.
All positive joint sets are exported.

Actual regressions retain the old failures and verify an 80-micrometre middle-pose
excursion, a 50-micrometre excursion driven by a tiny fifth influence, and cleanup
after an exception. The complete Production suite passed 98 tests with actual
Blender/Godot and zero skips; 935 JavaScript tests and all five required repository
gates passed. The extracted production package remains 19 files. An actual-asset
export-only preflight preserves 22,034 formerly dropped influences exactly and
passes raw original-avatar 26-mesh replay at all 97 frames under 2 micrometres.

The task contact observer now uses conservative float64 AABB candidates and the
reviewed SAT predicate. Blender BVHTree.overlap omits the retained small-coplanar
counterexample; older BVH-filtered zero-contact claims are superseded. Named
fixtures, 2,000 scalar parity cases and 30 brute-force candidate recall cases pass.
The declared accepted-arm 133 pairs over 121 frames also pass this corrected check.

The retained garment has 100 meshes and 122,898 triangles. A later native candidate
repairs the internal hardware contacts across all 97 frames and preserves all
389 chain links; local shoulder and short-belt corrections also have independent
phase observations. These are bounded component results, not whole-character
wearing acceptance. The earlier wearing observer covered only three original
avatar meshes. Checking the other 23 exposed real trousers/belt intersections
at the coat hem and opaque hair intersections at the neck. Original avatar
geometry, materials and visibility remain unchanged. The combined native c67633a
is unaccepted; ac419cd is a separate hardware-only lower-follow candidate, with
no completed matching lower-cloth correction. Neither has a matching final
GLB/consumer delivery pair. Final native/export/consumer verification must use
newly selected geometry after the remaining fit problems are repaired.
The avatar's inherited zero-area faces and numerically sensitive reimport
results stay explicitly recorded.

The latest lower v4 support review found new inner-sheet and rim contacts, so its
passing partial scopes do not accept that fit. The already-running v5 affine
alternative finished with BODY sampled reduction error 1.669290 mm, exceeding
the unchanged 1.5 mm budget. It is also unselected. Actual original-alpha testing
confirms 9,661 opaque hair contact pairs at rest; the separate hair proposals
remain failed and unadopted. No new lower-cloth native, independent 49-phase
target patch or final detailed-reference pair was completed before this pause.

The fixed checklist remains **30/37 = 81%**. U2/U3/U6, U1/E2, main merge and formal
publication remain open. Read the [bounded continuation report](development/evidence/usable-assets/recovery/topology-continuation/README.md).
The pre-update public baseline is 12076a3e; the verified local runtime core is
03b4a5c. Earlier automatic approval review rejected public uploads; that history
is retained. The user has now explicitly requested the PR update, so the prepared
executable source, synthetic controls and aggregate records are being readied for
PR #399. Actual remote success, the updated remote SHA and its CI results have
not yet been observed here. PR #399 remains Draft; merge and formal publication
remain separate. Private asset payloads are excluded, and the rejected broad
recovery commit is not an ancestor of this review tree.

## Previous: fixed triangles and recovery continuation

The recovered v5 chain was freshly reconstructed and all 4,177 recorded files
match their hashes and sizes. New source-bound work repairs five twisted trim
strips and freezes actual evaluated rest triangles for 100 garment meshes.
Independent native checks cover 97 frames; all 28 trim meshes have zero
self-contacts, degeneracy, orientation reversals or protected coordinate changes
over 2,716 object-frames. Read the [bounded topology checkpoint](development/evidence/usable-assets/recovery/topology-continuation/README.md).

The intermediate garment has 122,898 triangles. Chain assembly, final complete
wearing/GLB/consumer observations and installed-copy edit/restore remain open.
The fixed checklist is **30/37 = 81%**, with no new criterion credit. The original
avatar, accepted arm and rejected models remain preserved. All five required
repository gates passed again (935 JavaScript tests, 19 packaged files).

This public change contains source and aggregate summaries only, not the
previously rejected broad recovery payload. Runtime/distribution are unchanged.

## Previous: garment contact-observer correction; wearable gates remain open

The garment's earlier high16/low29 zero-contact claims are withdrawn. An
independent float64 SAT check and separate strict edge/triangle solves
corroborated all 7,559 crossing pairs missed by the metre-scale Blender ray
filter. The task-local contact helper now passes 17 retained scale,
translation, coplanar, separated and boundary controls. Degenerate geometry
remains a separate rejection gate. Read the
[rejected-candidate review](development/evidence/usable-assets/recovery/review-jacket-high16-low29.md)
and [predicate review](development/evidence/usable-assets/recovery/review-contact-predicate.md).
This correction does not expand the production topology observer into a
self-intersection checker.

The accepted arm used direct BVH overlap for its declared pairs, not the
faulty garment ray filter. Its exact delivered inspection bytes and scope
were checked in the
[impact review](development/evidence/usable-assets/recovery/arm-contact-predicate-impact.json).
Its existing acceptance is unchanged. The garment is still under repair:
valid individual rest shells, source-bound assembly, actual avatar fit,
all 97 poses and final consumer/export acceptance remain distinct gates.
The fixed checklist stays **30/37 = 81%**, with U2/U3/U6 open.

The frozen high42/low44 files now pass an independent review of each
individual closed rest shell. Their main-cloth subtotal is 60,176 triangles;
the sampled corresponding body/collar errors are at most 0.319266/0.954472 mm.
The source's erroneous rear-reaching lapel endpoints are separately repaired
and documented. This [bounded rest review](development/evidence/usable-assets/recovery/review-jacket-high42-low44.md)
does not accept the separate fitted candidate14, whose
[remaining interface contacts](development/evidence/usable-assets/recovery/review-jacket-candidate14-contact-map.md)
were independently localized without a blanket seam allowance.

The prepared [all-phase native/GLB checker](development/evidence/usable-assets/recovery/review-all-phase-correspondence.md)
now pins every oriented/material triangle corner at rest and evaluates all
97 frames at the unchanged 2 micrometre tolerance. An actual one-byte
intermediate morph corruption passes three-pose sampling but fails the new
check at precisely the changed frame. This is a fixture/control result;
final garment execution is still pending.

Runtime commit `1435ce1a` adds qualified two-rig scene paths and caches
per-sample rest associations without changing raw skin evaluation. Actual
Blender/Godot verification has 95 Production passes, zero failures/skips;
935 JavaScript tests and all five repository gates passed at that runtime
checkpoint. Both exact-head remote workflows succeeded. The
[CI receipt](development/evidence/usable-assets/recovery/remote-ci-observer-checkpoint.json)
and [19-file installed package identity](development/evidence/usable-assets/recovery/final-installed-package.json)
are retained. These runtime results do not accept unfinished garment
geometry, and the final installed-package garment edit remains pending.

## Accepted asset checkpoint: recovered articulated-arm delivery

The continuation at [`bb8e8aff`](https://github.com/ictseoyoungmin/refas/commit/bb8e8affbbb6b5cf53dcb637114710511d354913)
advances the fixed [plan ledger](development/refas-2-progress.md) to
**30/37 = 81%**, adding U4 and U5. R2-07 remains WIP at 2/5; the garment is still
being repaired. The old 78,998-triangle arm and later 97-frame jacket were not
found in the retained files. New work explicitly starts from the hash-verified
source-identity models. Earlier failed candidates and judgments remain.

The new arm has 86,564 triangles, 99 meshes/primitives and 20 controls. All 321 source
parts are accounted for; 289 detailed parts remain exact and 32 repairs are
identified. Declared133 surface pairs across 121 frames are clear. Actual Godot
playback verifies 119 nodes at 121 times. Native/export topology, a deliberately
flipped actual GLB triangle, fixed-camera visual review, and a cover edit that
preserves 114 unrelated objects and restores 16 files pass. Its connected palm and
periodic wrist annuli demonstrate deliberate construction retopology separately
from reduction. The one unused generated glyph UV omission is explicit.

Read the [asset report](development/evidence/usable-assets/automail-resume/README.md),
[independent review](development/evidence/usable-assets/recovery/review-automail-candidate08.md)
and [download record](development/evidence/usable-assets/automail-resume/delivery-archive.json).
The standalone ZIP has 93 verified entries and retains the untouched original,
detailed version, native/GLB, images, scripts and complete compressed observations.

The missing finite-positive vertex-tolerance option was restored at 5f2f39c6.
Its unchanged strictdefault and actualnegative controls pass in 92 Production
tests with Blender/Godot; 935 JavaScript tests and the required repository gates
pass. Production and Node 20/22/24 remote CI succeeded. The active 19-file package
is unchanged by the later repository-only asset scripts.

The jacket's distance-budget experiment remains rejected after independent
inspection found four-wall rim junctions and visible nape lining crossings.
The actual avatar remains present while geometry, motion and hardware are
repaired. U2/U3/U6 remain open; U1/E2 comparisons, main merge D2 and publication D3
also remain open. This checkpoint is not a release or whole-project completion.

## Current limits and resume order

1. Read current HEAD, active issue/PR, Work OS, status, skill relationship map
   and the smallest necessary current source/evidence. Preserve dirty state and
   verified rejected candidates. Consult the immutable historical status only
   for the corresponding historical question.
2. Continue actual source-specific broad-form/compound-surface and use-profile
   work under fixed budgets. Native supports visible meshes, classic curves,
   lattices, explicitly marked construction meshes, supported armatures and
   non-instancing empties, packed still textures; follow current SKILL and
   topology/assembly guides for restrictions. Delivery is mesh-only with
   explicit conversion and no automatic cage/curve motion bake. Unmarked
   hidden/excluded geometry, instances, linked/external dependencies and live
   non-armature modifiers on deformable meshes remain restricted. Do not infer
   exhaustive rig/driver/node/simulation support.
3. Prioritize actual garment repair and matched trials of direct authoring
   helpers. Preserve earlier no-skill/1.x/2.0 negative comparisons; test
   U1/E2 with matched resources. No general likeness, arbitrary motion,
   physics/engineering strength or FPS claim. Final delivery/approval and
   publication are separate.
4. Keep source-only PRs small. The 1 MiB cumulative budget continues to
   inspect every charged source file; generated models, renders, arrays,
   logs and archives remain prohibited. This status compaction removes
   repeated narrative, not evidence files or the policy. Local full-file
   revision recovery remains scoped to tested process/IO failures, stale edits,
   tampering and explicit restore; no power-loss/network-filesystem guarantee.
