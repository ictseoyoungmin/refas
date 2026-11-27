# RefAs 2.0 plan progress

## Current recorded checkpoint — published v2.0.0 installation package

**97% — 36 of 37 fixed checklist-v2 criteria demonstrated.** Actual release
and package publication add **D3 only**, completing **Delivery 3/3**. R2-06
remains **6/7, WIP**; R2-07 remains **5/5, REVIEW**; **0/7 tasks are CLOSED**.
All nine previous JSON checkpoints retain their exact text; criterion
meanings, checklist versions and projections are unchanged. **E2 remains
open.** This percentage measures demonstrated criteria, not finished-art
quality or effort completed.

The [v2.0.0 Release](https://github.com/ictseoyoungmin/refas/releases/tag/v2.0.0)
was published on **2026-11-27 at 08:02:42 UTC** from exact main
[`d48ef51a`](https://github.com/ictseoyoungmin/refas/commit/d48ef51ad213ce2d7df3664965fc9dc283783737),
after [release preparation #438](https://github.com/ictseoyoungmin/refas/pull/438).
The successful [publication workflow](https://github.com/ictseoyoungmin/refas/actions/runs/45962623370)
binds that source to the recorded tag and Release assets under the publisher's
conflict-rejection policy. `sourceCommit`
identifies this published runtime/source snapshot, not the later documentation
commit. [Issue #439](https://github.com/ictseoyoungmin/refas/issues/439) records
this D3 decision under [milestone 2.0.0](https://github.com/ictseoyoungmin/refas/milestone/4).

| Actual receipt | Verified result |
| --- | --- |
| Release and exact source | Release **460308601**, tag/target `d48ef51ad213ce2d7df3664965fc9dc283783737`; published, not draft or prerelease. |
| Installation archive | [refas-2.0.0.tgz](https://github.com/ictseoyoungmin/refas/releases/download/v2.0.0/refas-2.0.0.tgz), asset **799547991**, **87,637 bytes**, SHA-256 `9be599330e8be6fb01180d1c6deec3bc27ab4b24c6ad8b9396a32011018b1581`. |
| Checksum file | [refas-2.0.0.tgz.sha256](https://github.com/ictseoyoungmin/refas/releases/download/v2.0.0/refas-2.0.0.tgz.sha256), asset **799548095**, **82 bytes**, SHA-256 `e6bfec65c832bb29fb2d3acc3bee3fc5f857c2ed84fad1d8b870353960c42544`. |
| Public download and installation | Both unauthenticated downloads match the prepared bytes/digests and GitHub asset digests; checksum content is exact. Installation of that downloaded archive passes the isolated CLI and copied-skill checks with identical source files: **19 skill / 23 package files**, **302,654 unpacked bytes**. |
| Exact-main prerequisites | [Full CI](https://github.com/ictseoyoungmin/refas/actions/runs/45948863434) and [production CI](https://github.com/ictseoyoungmin/refas/actions/runs/45948863322) pass at d48: Node 22/24 and all 17 full-QA gates. Release preparation also passed all five required local gates and 967 JavaScript tests. Existing source-bound Blender/Godot evidence is retained without claiming a new asset or 187-test execution. |

The published installation channel is the production npm-format archive and
its checksum on GitHub Release. **No npm registry publication is claimed.**
The release identity and package checks do not reassess models or establish
visual-quality, speed or cost superiority.

| Slice | Current coverage | Status |
| --- | --- | --- |
| R2-01 / R2-02 / R2-04 / R2-05 | 4/4 each | REVIEW |
| R2-03 | 6/6 | REVIEW |
| R2-06 | 6/7 | WIP |
| R2-07 | 5/5 | REVIEW |
| Coordinated delivery | 3/3 | Main integration and GitHub package publication accepted |
| **Total** | **36/37 = 97% rounded** | **0/7 tasks CLOSED** |

[E2 follow-up #436](https://github.com/ictseoyoungmin/refas/issues/436) remains
blocked under [milestone 2.0.1](https://github.com/ictseoyoungmin/refas/milestone/5).
Actual prospective timing, provider/model/usage and attributable billed-cost
evidence under matched resources is still missing; its telemetry/cost fields
remain null. The U1 visual ties and failed/missing comparisons, separate
U2/U3/U6 acceptance, all diagnostic failures and recovery resources retain
their scope. Optional [PR #425](https://github.com/ictseoyoungmin/refas/pull/425)
remains Draft and excluded.

## Historical checkpoint — accepted main integration, 2026-11-27

The complete previous summary below records the 35/37 state before publication.
Its then-open D3, alpha.1 source identity and integration receipts remain
historical; actual publication adds no retrospective asset or E2 credit.

**95% — 35 of 37 fixed checklist-v2 criteria demonstrated.** The completed
main integration adds **D2 only**. R2-06 remains **6/7, WIP**; R2-07 remains
**5/5, REVIEW**; **0/7 tasks are CLOSED**. All eight previous checkpoints,
criterion definitions, checklist versions and projections remain unchanged.
**E2 and D3 remain open.** This percentage records demonstrated criteria,
not final-art quality, effort completed or a published release.

[PR #435](https://github.com/ictseoyoungmin/refas/pull/435) first integrated the
reviewed native-production foundation at `c2831abb…`.
[PR #399](https://github.com/ictseoyoungmin/refas/pull/399) then integrated the
reviewed remainder into main at
[`fbe4821f`](https://github.com/ictseoyoungmin/refas/commit/fbe4821fb04ff72f44a69761dd5ddfc22cdbc3dd).
The synchronized `dc7f37e9…` head and the final merge preserve the exact reviewed
`bafa777e…` tree. Issue #398 closes the accepted source-integration scope;
remaining measurement and publication work have their own records.

| Verification | Accepted result and boundary |
| --- | --- |
| Foundation and remainder | Each passed fresh `npm test`, `test:python`, `check`, `dogfood` and `release:audit`; each JavaScript run passed 948 tests with zero failures/skips and completed 11 dogfood checkpoints. |
| Distribution at integration | Foundation: 16 skill / 20 package files, 258,556 unpacked bytes. Remainder: 19 skill / 23 package files, 301,916 bytes. Both retain the 2.0.0-alpha.1 identity at their recorded source snapshots. |
| Current-head CI before final merge | [RefAs CI](https://github.com/ictseoyoungmin/refas/actions/runs/45946321807) and [production CI](https://github.com/ictseoyoungmin/refas/actions/runs/45946321772) pass at dc7f37e9. Existing actual Blender/Godot capability evidence is reused; these source gates do not claim a new real-asset or 187-test run. |
| Source budget | The original 1,150,150 / 1,048,576-byte cumulative-main **FAIL remains historical evidence**. The independently reviewed integration PRs pass at 976,655 bytes (#435) and 590,356 bytes (#399), against their actual sequential bases. The fixed grandfather anchor and limits are unchanged. |

| Slice | Current coverage | Status |
| --- | --- | --- |
| R2-01 / R2-02 / R2-04 / R2-05 | 4/4 each | REVIEW |
| R2-03 | 6/6 | REVIEW |
| R2-06 | 6/7 | WIP |
| R2-07 | 5/5 | REVIEW |
| Coordinated delivery | 2/3 | Main integration accepted; publication unfinished |
| **Total** | **35/37 = 95% rounded** | **0/7 tasks CLOSED** |

[E2 follow-up #436](https://github.com/ictseoyoungmin/refas/issues/436) is blocked
on actual prospective provider/model/usage, useful-edit/full-time and attributable
billed-cost evidence under matched resources. Missing observations remain null
with reasons. No new model run, speed or cost advantage is credited.
[Release preparation #437](https://github.com/ictseoyoungmin/refas/issues/437)
prepares coordinated **2.0.0** metadata and publication checks; **D3 remains
uncompleted until formal release and package publication actually succeed**.
The checkpoint above records the merged alpha.1 source, not that future release.

The U1 ties, failed and missing comparison results, separate U2/U3/U6 asset
acceptance, all diagnostic failures, recovery resources and unfinished-art
boundaries retain their original scope. Optional [PR #425](https://github.com/ictseoyoungmin/refas/pull/425)
remains Draft and excluded. Source integration does not accept that helper or
reassess any model.

## Historical checkpoint — matched continuation comparison, 2026-11-27

The complete previous checkpoint below records the 34/37 state before main
integration. Its then-open D2 and cumulative-budget FAIL remain historical;
the new integration decision above does not rewrite its evidence or verdicts.

**92% — 34 of 37 fixed checklist-v2 criteria demonstrated.** The independently
reviewed matched continuation comparison adds **U1 only**. R2-06 advances to
**6/7, WIP**; R2-07 remains **5/5, REVIEW**; **0/7 tasks are CLOSED**. All seven
previous checkpoints, criterion meanings, checklist versions and projections
remain unchanged. **E2, D2 and D3 remain open.**

The [matched comparison report](evidence/usable-assets/matched-comparison.md)
records the frozen task, common inputs/resources, independent review and
durable evidence. It is recorded in [Issue #432](https://github.com/ictseoyoungmin/refas/issues/432)
after the [wearable checkpoint merge](https://github.com/ictseoyoungmin/refas/commit/f3c44c1fea7f099bd50db1fa36c407ead2239d6e).
U1 credits evaluating both tasks across source likeness, mesh/attachment
condition, useful motion, functional retopology and optimization. Its acceptance
does not require a winning condition or accept the comparison models for use.
The later repaired wearable delivery remains a separately reviewed artifact.

All authors received the same garment `c67633a2…`, arm `badf3fd5…`, complete
original reference images and continuation task. The product snapshots remain
**no skill**, **fixed 1.x `a29bcc42…`** and **2.0 `f174f6b1…`**. Each condition
had the same 24-process / 1,800-active-Blender-second cap, Blender 4.3.2 with two
CPU threads, Cycles 512px/16 samples and Godot 4.7.2. Independent observation was
outside author budgets. The tested shared observer source `d02f6188…` does not
replace the frozen product snapshots.

| Comparison result | No skill | Fixed 1.x | 2.0 |
| --- | --- | --- | --- |
| Blinded source/visual review, both tasks | Tie | Tie | Tie |
| Garment consumer, default 20µm profile | FAIL | FAIL | FAIL |
| Garment consumer, predeclared 100µm profile with unchanged matrix limit | FAIL | FAIL | FAIL |
| Arm actual-consumer motion, 121 frames | PASS within observed scope | PASS within observed scope | PASS within observed scope |
| Selected-candidate local-edit evidence | Scoped exercise retained | **NOT_EVALUATED**; executed exercise used supplied baseline | Scoped exercise retained |

All six outputs meet their fixed polygon/material and finite sampled-error
budgets; both supplied models already met the polygon caps. Both tasks remain
visually tied after independent inspection of both full references and all 54
output images. Each garment retains 10,765 opacity-confirmed hair/cloth contacts
at each common sampled pose. The 2.0 arm's exact-coincident-position diagnostic
remains **FAIL/unresolved**, with 35 nonmanifold and 60 inconsistent-winding
edges; its consumer PASS does not clear geometry or mechanical contact gates.
The 2.0 garment still has 388 original unused-hair-bone matrix failures at
100µm; no all-bone exemption is applied to the comparison. Earlier observer
failures and uniformly corrected observations are both retained.

This is one continuation run per condition using existing geometry and useful
motion. Provider/model snapshots, tokens and billed cost are unavailable;
interrupted plain telemetry is conservatively bounded, not invented exact
timing. **E2 stays open.** No speed, cost, GPU frame-time, reconstruction-from-
scratch or general product-superiority result is claimed. Later informed
repairs do not replace failed frozen comparison outputs.

| Slice | Current coverage | Status |
| --- | --- | --- |
| R2-01 / R2-02 / R2-04 / R2-05 | 4/4 each | REVIEW |
| R2-03 | 6/6 | REVIEW |
| R2-06 | 6/7 | WIP |
| R2-07 | 5/5 | REVIEW |
| Coordinated delivery | 1/3 | Main merge and release unfinished |
| **Total** | **34/37 = 92% rounded** | **0/7 tasks CLOSED** |

The earlier selected wearable's 100µm use-profile acceptance remains separate
from the comparison's all-profile FAIL results. Its default20, strict avatar/
Blender reimport, direct raw/live static equality and original contact-binder
failures remain recorded with their separately bounded supplemental routes.
The selected asset budgets, detailed BODY/COLLAR mappings, arm branding/UV
exceptions and unfinished-art boundaries are unchanged. PRs #425 and #399
remain Draft; **the cumulative-main 1 MiB source-artifact budget remains FAIL**.
No rewrite/main merge, formal release, task closure or new runtime behavior is
granted by this comparison checkpoint.

## Historical checkpoint — declared-use wearable delivery, 2026-11-27

The complete prior summary below records the separate U2/U3/U6 acceptance and
the criteria that were still open then. Its scope, limitations and evidence
remain unchanged by the later U1 comparison decision.

**89% — 33 of 37 fixed checklist-v2 criteria demonstrated.** The declared-use
wearable delivery adds **U2, U3 and U6** after independent review of the exact
selected native `624a1a90…` and GLB `af91555a…`. R2-07 is **5/5, REVIEW**;
R2-06 remains **5/7, WIP**. **0/7 tasks are CLOSED.** The six previous
checkpoints, all criterion definitions and checklist versions remain unchanged.

Read the [wearable delivery and acceptance report](evidence/usable-assets/wearable-delivery.md)
for exact artifact hashes, independent decisions, selected views, recoverable
sources and durable downloads. The tested source is
[`d02f6188`](https://github.com/ictseoyoungmin/refas/commit/d02f618801167040145087812abfaa3ff5e69dcc);
the installed production/save/export/edit-restore runtime is
[`f174f6b1`](https://github.com/ictseoyoungmin/refas/commit/f174f6b1cf9ce19ce905b58490d117aca01cea4b).
The observer fix and the selected asset acceptance have separate scopes.

| Newly demonstrated criterion | Accepted evidence and boundary |
| --- | --- |
| U2: mesh condition and attachments | Actual native/GLB correspondence and source-bound physical checks over all 97 recorded poses, repaired major cloth and rigid-mount defects, exact consumer face/point identity and counterexamples, and actual whole/detail material review. Original contact policies and classified source exceptions remain unchanged. |
| U3: identified-character wearing and motion | Original 26-mesh avatar preserved; 30 cloth meshes retain Basis plus 49 unique phase keys; 446 hardware bones and 389 chain links remain. Native, raw export and actual Godot 4.7.2 exercise the declared 97-frame, 30fps clip and original 5-avatar-bone plus 446-hardware-bone profile. |
| U6: optimized delivery of both assets | Garment 122,898 triangles / 111 material primitives against fixed 125,000 / 150 budgets. Saved detailed BODY/COLLAR errors are 1.400601468 / 1.477630925 mm within 1.5 mm. Editable detailed sources and mappings are retained. All 92 manifest entries of the already accepted arm are reverified unchanged, preserving its 86,564 triangles, 99 primitives, 0.423727 mm sampled error and 121-frame use evidence. |

The detailed error check samples all saved vertices and triangle centroids in
both directions by outer/inner/rim/full surface; it is not a continuous
Hausdorff bound. The combined original-avatar and garment scene has 812,985
triangles, separate from the garment-only budget. The arm's **796 inherited
AURIX contour boundary edges** and **`Crown_A_mark` unused UVMap omission** remain
explicit exceptions, with the untouched original retained. No new arm execution
or GPU/frame-time benefit is claimed by this checkpoint.

**Retained failures are part of this acceptance record.** Default 20µm engine
playback still fails 5,883 checks; the predeclared 100µm profile separately
passes, without allowing unlisted physical intersections. Strict original-avatar
geometry and the 2µm Blender reimport route remain FAIL; raw source-index/weight
preservation and all-26-mesh raw GLB replay separately pass within the unchanged
2µm budget. Direct raw/live static-hair array equality remains FAIL. The exact
source-derived uint16 AABB compression route separately passes with no fitted
parameters, exact live equality and a one-ULP negative control. Original exact
contact-pair/rest-binding failures also remain; reviewed source lineage and
original finite construction domains do not introduce new contact exemptions.

| Slice | Current coverage | Status |
| --- | --- | --- |
| R2-01 / R2-02 / R2-04 / R2-05 | 4/4 each | REVIEW |
| R2-03 | 6/6 | REVIEW |
| R2-06 | 5/7 | WIP |
| R2-07 | 5/5 | REVIEW |
| Coordinated delivery | 1/3 | Main merge and release unfinished |
| **Total** | **33/37 = 89% rounded** | **0/7 tasks CLOSED** |

**U1, E2, D2 and D3 remain open.** The separately reviewed U1 comparison will
be handled in a separate Issue/PR after [#431](https://github.com/ictseoyoungmin/refas/pull/431)
merges; this checkpoint gives it no credit. Complete comparable timing/cost,
main merge and formal publication remain separate unfinished requirements.
Both final-art decisions remain unapproved. [#425](https://github.com/ictseoyoungmin/refas/pull/425)
and [#399](https://github.com/ictseoyoungmin/refas/pull/399) remain Draft, and the
**cumulative-main 1 MiB source-artifact budget remains FAIL**. There is no
runtime change, budget waiver, merge or release authorization here.

## Historical checkpoint — recovered articulated arm, 2026-11-23

The following checkpoint text retains the state and unresolved findings at
that earlier review. Its later garment continuation is assessed only by the
new checkpoint above; the historical evidence is not rewritten.

**81% — 30 of 37 fixed checklist-v2 criteria demonstrated.** The recovery
continuation at [`bb8e8aff`](https://github.com/ictseoyoungmin/refas/commit/bb8e8affbbb6b5cf53dcb637114710511d354913)
adds **U4 and U5** after independent review of the new articulated arm. It is
not a recovery of the lost historical 78,998-triangle candidate. R2-07 is
**2/5, WIP**; R2-06 remains **5/7, WIP**. All seven tasks remain unclosed.

The selected arm has 86,564 triangles and retains all 321 original parts through
99 delivered meshes. Its declared 121-frame reach/partial grip,133 surface pairs,
actual Godot playback, deliberate palm/annulus retopology, actual flipped-face
negative control, and exact 16-file restoration pass. Required materials and
parents remain; the unused generated Lambda UV omission is explicitly recorded.
See [the complete report](evidence/usable-assets/automail-resume/README.md),
[independent review](evidence/usable-assets/recovery/review-automail-candidate08.md)
and [durable delivery record](evidence/usable-assets/automail-resume/delivery-archive.json).

The jacket remains unaccepted. A promising 123,208-triangle geometry experiment
met its 1.5 mm vertex-distance limit but exposed nonmanifold rim junctions and
visible lining crossings under independent review. It is retained as a failed
intermediate. U2, U3 and U6 stay open until the garment's complete mesh, wearing,
attachment and consumer evidence passes. E2, U1, D2, D3 remain separately open.

Later high16/low29 contact-zero claims were also withdrawn: independent SAT
and strict edge/triangle solves corroborated 7,559 actual crossing pairs
missed by the task's metre-scale Blender ray filter. The corrected helper
passes 17 scale/translation and geometric controls, while both old models
remain rejected. See the [independent rejection](evidence/usable-assets/recovery/review-jacket-high16-low29.md)
and [predicate review](evidence/usable-assets/recovery/review-contact-predicate.md).
This observer repair earns no new criterion and does not invalidate the
arm's separately verified direct-BVH pair gate.

The replacement high42/low44 pair has since passed the
[individual rest-shell review](evidence/usable-assets/recovery/review-jacket-high42-low44.md).
Separate fitted candidates and the final all97 native/export and consumer
runs remain unaccepted. The [actual intermediate-phase GLB control](evidence/usable-assets/recovery/review-all-phase-correspondence.md)
validates broader correspondence coverage without adding criterion credit.

| Slice | Current coverage | Status |
| --- | --- | --- |
| R2-01 / R2-02 / R2-04 / R2-05 | 4/4 each | REVIEW |
| R2-03 | 6/6 | REVIEW |
| R2-06 | 5/7 | WIP |
| R2-07 | 2/5 | WIP |
| Coordinated delivery | 1/3 | Main merge and release unfinished |
| **Total** | **30/37 = 81% rounded** | **0/7 tasks CLOSED** |

The later runtime checkpoint at 1435ce1a passes 935 JavaScript and 95 Production
tests, including actual Blender/Godot and 13 consumer regressions. Both exact-head
remote workflows passed; the 19 installed package files still match. Runtime tests are
separate from model-use acceptance. PR #399 remains Draft; development identity
remains 2.0.0-alpha.1. This is criterion coverage, not effort or time remaining.

## Historical checklist-v2 scope baseline

**Checklist v2 scope-change baseline: 76% — 28 of 37 criteria demonstrated.**
On 2026-11-22 the user explicitly added actual wearing/mechanical use, mesh
condition, retopology and optimization to 2.0 and its comparison. The six added
criteria U1–U6 are fixed in the [execution protocol](evidence/usable-assets/PROTOCOL.md).
Their implementation and review are in progress; requirements alone earn no credit.

The earlier checklist remains **28/31 = 90%**, verified against
[`815e9f76`](https://github.com/ictseoyoungmin/refas/commit/815e9f76f36ee294ae3cb554215116a08adb168e).
Its 71%, 77%, 87% and 90% checkpoints, original meanings and evidence are retained.
That review accepted both assets only within the original prototype scope;
it does not approve the newly required wearing, motion or optimized delivery.

This measures binary acceptance coverage against the [Notion plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) and its separate delivery milestones. It does **not** estimate effort or time remaining, score visual quality, or equate to Notion CLOSED status. The [machine-readable ledger](refas-2-progress.json) is the canonical list of IDs, full criteria, source/evidence links and checkpoint history.

| Slice | Current coverage | Notion status |
| --- | --- | --- |
| [R2-01](https://app.notion.com/p/41fc6a3b5bf1811d9a2df89722fde724) | 4/4 | REVIEW |
| [R2-02](https://app.notion.com/p/41fc6a3b5bf181e0bcc1cdc55fc1d036) | 4/4 | REVIEW |
| [R2-03](https://app.notion.com/p/41fc6a3b5bf1814fb380f3d649a3fc10) | 6/6 | REVIEW |
| [R2-04](https://app.notion.com/p/41fc6a3b5bf181cd946ff7cd70581fb7) | 4/4 | REVIEW |
| [R2-05](https://app.notion.com/p/41fc6a3b5bf181999d88cac97f324601) | 4/4 | REVIEW |
| [R2-06](https://app.notion.com/p/41fc6a3b5bf1813191c0c59b6fff1aa8) | 5/7 | WIP |
| [R2-07](https://app.notion.com/p/420c6a3b5bf181cd8228ce6ff6174c5a) | 0/5 | WIP |
| Coordinated delivery | 1/3 | Main merge and release unfinished |
| **Total** | **28/37 = 76% rounded** | **0/7 tasks CLOSED** |

REVIEW means review remains; it does not earn an arbitrary fractional score. Both selected assets remain rejected for finished visual acceptance. Active development metadata is 2.0.0-alpha.1; retained legacy runtime is 1.4.2, the recorded published release remains v1.4.1, and PR #399 is Draft. Those boundaries are independent of runtime-test progress.

## Fixed baseline checklist

`1` means demonstrated within the stated scope; `0` remains open. These baseline decisions stay intact when later checkpoints are appended. Repository evidence is bound to the baseline commit; the JSON provides the full evidence paths.

The table below is the unchanged original 31-item baseline. Checklist v2 adds:

| ID | Owner | Additional acceptance |
| --- | --- | --- |
| U1 | R2-06 | Matched comparisons include source likeness, mesh condition, wearing/motion, retopology and optimization. |
| U2 | R2-07 | Selected native/exported mesh defects and attachments are inspected and repaired; seeded counterexamples exercise the detectors. |
| U3 | R2-07 | A real identified character wears the garment in useful/intermediate poses, with skin and animation exercised in a consumer. |
| U4 | R2-07 | The articulated arm performs useful synchronized motion with correct joint centers and maintained connections, including consumer playback. |
| U5 | R2-07 | Deliberate functional retopology is compared with its source, retains required data and works during actual use. |
| U6 | R2-07 | Both assets meet budgets fixed before selection, with measured error, appearance and motion after optimization and consumer execution. |

The full, fixed new definitions are in [new-criteria.json](evidence/usable-assets/new-criteria.json).

| ID | Baseline | Acceptance criterion | Evidence / requirement |
| --- | ---: | --- | --- |
| B1 | 1 | Pinned 1.x baseline and unchanged source identities. | [source](../../examples/uniform-jacket/reference.json) |
| B2 | 1 | Reproducible creation/local-edit briefs, constraints, budget and delivery. | [task](../../examples/uniform-jacket/TASK.md) |
| B3 | 1 | Defined measurement procedure and unavailable-data handling. | [protocol](evidence/garment-and-automail/PROTOCOL.md) |
| B4 | 1 | Defined same-GLB/camera/material renderer-isolation method. | [Notion plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) |
| W1 | 1 | Short entry supports ordinary Blender scripting. | [independent use](evidence/refas-2-mug/report.md) |
| W2 | 1 | Actual new-native creation and local editing. | [native workflow](evidence/refas-2-native/README.md) |
| W3 | 1 | Public script, input, output and revision identification. | [record](evidence/refas-2-native/demo-evidence.json) |
| W4 | 1 | Only successful candidates publish; execution is separate from visual approval. | [failure evidence](evidence/refas-2-native/README.md) |
| S1 | 1 | Actual captured-file snapshot hashes verified. | [record](evidence/refas-2-native/demo-evidence.json) |
| S2 | 1 | Failed/partial work preserves the last successful state. | [failure evidence](evidence/refas-2-native/README.md) |
| S3 | 0 | Atomic publication and coherent reads under concurrent changes. | [counterexample](#baseline-counterevidence) |
| S4 | 1 | Native reopening and verified revision recovery. | [recovery](evidence/garment-assembly-refinement/README.md) |
| S5 | 0 | Explicitly adopted reference/native/script/render changes expose dependent-evidence freshness. | [baseline code][baseline-runtime] |
| S6 | 1 | No automatic transfer of visual or target-readiness approval. | [baseline code][baseline-runtime] |
| O1 | 1 | Actual native reopening, rendering and export/reimport. | [actual output](evidence/garment-assembly-refinement/README.md) |
| O2 | 1 | Revision, camera/render conditions and output hashes linked. | [view records](evidence/uniform-jacket/evaluation.json) |
| O3 | 1 | Failed, unsupported and unverified results distinguished. | [scope guards](evidence/garment-assembly-refinement/runtime/README.md) |
| O4 | 1 | Technical, source and target-purpose assessments separated. | [review](evidence/garment-assembly-refinement/review/joined-fold-review.md) |
| K1 | 1 | Relevant optional recipes reached and applied in both task types. | [protocol](evidence/garment-and-automail/PROTOCOL.md) |
| K2 | 1 | Bounded default reading without mandatory full-document loading. | [independent use](evidence/refas-2-mug/report.md) |
| K3 | 1 | Local preservation and camera/geometry distinction demonstrated. | [preservation](evidence/garment-assembly-refinement/README.md) |
| K4 | 0 | Declared source identity and major construction requirements preserved. | [jacket](evidence/garment-assembly-refinement/review/joined-fold-review.md), [arm](evidence/garment-assembly-refinement/review/initial-review.md) |
| E1 | 1 | Three-condition source/editability/preservation/delivery comparisons. | [jacket](evidence/uniform-jacket/README.md), [arm](evidence/garment-and-automail/README.md) |
| E2 | 0 | Comparable actual useful-edit time, total time and resource/tool cost. | [measurement limits](evidence/garment-and-automail/PROTOCOL.md) |
| E3 | 0 | Executed same-GLB/camera/known-material renderer isolation. | [Notion plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) |
| E4 | 1 | Actual extracted package executes outside the repository. | [package](evidence/garment-assembly-refinement/checks/package.json) |
| E5 | 0 | Explicit 1.x import, preserved/lost scope and no certification transfer. | [migration plan](refas-2-plan.md#s4--packaging-and-explicit-migration) |
| E6 | 1 | Negative results, limitations and claim boundaries reported. | [reported limits](evidence/garment-assembly-refinement/README.md) |
| D1 | 0 | Coordinated 2.0 package/runtime/plugin/docs/distribution cutover. | [cutover plan](refas-2-plan.md#current-baseline-and-version-boundary) |
| D2 | 0 | Main merge accepted and completed. | [work status](../WORK_STATUS.md) |
| D3 | 0 | Formal release and package publication accepted and completed. | [release plan](refas-2-plan.md#s5--release-acceptance) |

## Baseline counterevidence

**S3 was open despite successful write-side concurrency tests.** A deterministic storage probe scheduled a legitimate new commit after `status()` captured the old state. Its separate `load_revision()` call then selected the new head. The response reported `ok: true` and the old head while returning the new revision's `top.png` and `inputs/base.blend` under the old directory; those paths did not exist. The probe used the existing fake worker and makes no Blender or visual claim. `verify_project()` had the same separate state/head read pattern. See the [pinned runtime][baseline-runtime], [baseline trace](evidence/reference-freshness/probes/baseline-restart-results.json) and [existing transaction tests][baseline-tests]. The verified checkpoint below retains regressions for the repair, including the initially empty-head case.

**S5 was a missing explicit-adoption workflow.** At baseline, initialization freezes references; an existing project cannot replace them through the CLI, and status has no dependent-evidence freshness report. Original external files changing or disappearing does not invalidate historical captured evidence. The implemented scope uses explicit reference intake and run/native/review/render inputs; it does not add file watchers, mutable native storage, inherited render defaults or automatic stale-lock recovery. Frozen-file integrity, stale publication rejection and current-context freshness remain distinct.

## Interpretation and remaining boundaries

- **B3/B4 versus E2/E3:** R2-01 asks for measurement and renderer-isolation methods to be *defined*, so definitions earn credit. Actual comparable timing/cost telemetry remains open in R2-06; the new same-asset renderer experiment demonstrates E3 within its stated scope. Fixed cameras on different candidate geometry are not renderer isolation.
- **K4:** The baseline reviews identified major jacket collar/ornament/strap and arm armor/mechanism/hand gaps. The source-identity checkpoint repairs those major prototype constructions, and a fresh anonymous review accepts both selected assets against the unchanged task. Relative preference alone is not the basis. Finished-art, UV, physics and engine readiness remain separate; no universal quality gate is added.
- **S6 versus E5:** Production assessments remain unevaluated; that earns non-inheritance credit. The explicit selected-asset import now demonstrates preservation/loss rules, unchanged legacy bytes and no certificate transfer. Whole history and untested authoring features are not implied.
- **E4 versus D1–D3:** A tested extracted 1.4.2 development package earns execution credit. The coordinated 2.0 alpha metadata/distribution conversion now demonstrates D1. Main merge and formal publication remain separate unfinished milestones. Publication still needs the applicable authorization.

## Verified checkpoint — reference adoption and coherent reads

**S3 and S5 are now demonstrated: 24/31 = 77%.** The original pending projection
is retained as fulfilled in the JSON, resolved by `r2-03-reference-freshness-d36a461e`.

| Validated change | Resulting coverage |
| --- | ---: |
| S3: status/verify return one coherent revision during concurrent changes | 23/31 = 74% |
| S3 plus S5: explicit adopted-input freshness, retained history, safe failure/concurrency and truthful restore behavior | 24/31 = 77% |

The [evidence report](evidence/reference-freshness/README.md) links 34 transaction/
CLI regressions, 15 actual Blender tests and the extracted-package jacket replay.
All 22 replay checks pass across 12 recorded commands: eleven CLI calls plus a
separate Blender Save As. All nine selected artifact/input files restore exactly.
The independent reviewer also rechecked historical-source and failed-response
rollback behavior. Local JavaScript regression remains 931 passed.

The exposed freshness field compares the **active reference content set**.
Native/script/review/render changes are explicitly adopted through `run`, which
captures the new inputs and regenerates their bound outputs. This earns S5
within its agreed scope, without implying external-file monitoring. R2-03 is
6/6 demonstrated and REVIEW; no task is CLOSED.

**At that earlier checkpoint, seven criteria remained open:** K4 (source identity/construction), E2 (actual
comparable timing/cost), E3 (same-asset renderer isolation), E5 (explicit 1.x
migration), and D1–D3 (coordinated cutover, main merge, formal publication).

## Verified checkpoint — production distribution, selected import and renderer isolation

**E3, E5 and D1 are demonstrated: 27/31 = 87%.** The fixed 31-item denominator,
criterion meanings and all historical decisions are preserved.

| Newly demonstrated criterion | Actual evidence |
| --- | --- |
| E3: same-GLB/camera/known-material renderer isolation | Four-material GLB, independent geometry/camera observations, 11 checks; light-direction and normal-precision findings with the initial failed check retained |
| E5: explicit 1.x import with preserved/lost scope and no certification transfer | Actual installed import/edit/restore, 18 checks, 247 old files unchanged, 65 objects preserved, 11 selected files restored; actual native/GLB and refusal cases |
| D1: coordinated 2.0 distribution cutover | Unpublished 2.0.0-alpha.1 identities; 264 old files moved outside the active skill, 17-file actual npm package, exact parity, isolated copied-skill/npm execution and legacy-insertion rejection |

Read the [complete evidence](evidence/v2-distribution-and-import/README.md) and
[independent scope review](evidence/v2-distribution-and-import/checks/cutover-scope-review.md).
Local gates pass 935 JavaScript tests and 65 production tests, including 18 actual
Blender cases without skips. Host-specific marketplace installation is not
independently exercised; plugin manifest routing is structurally checked.

R2-06 advances to **5/6** but remains **WIP**. Coordinated delivery is **1/3**.
**Four criteria remain open:** K4 (declared source identity/major construction),
E2 (comparable actual useful-edit/total time and resource cost), D2 (main merge)
and D3 (formal release/publication). Both asset visual decisions and CLOSED 0/6
remain unchanged. File reduction and successful import do not close quality or
cost criteria.

## Updating the ledger

1. Keep the 31 IDs, definitions and denominator fixed for checklist version 1. Use binary credit; additional tests or documents do not themselves increase it.
2. Append a `checkpoints` entry in the JSON with its complete `demonstratedCriteria` set, recomputed `counts`, current review statuses and `evidenceUpdates` for changed decisions. Set `currentCheckpointId` to it. Do not overwrite the baseline entry or its evidence notes.
3. Stronger counterevidence can reopen an item. Record the reason and affected IDs; do not hide it by changing the denominator.
4. When the projection is validated, mark its `status` as `fulfilled` and set `resolvedBy` to the new checkpoint. Until then it remains `pending-validation` and contributes no credit.
5. Update this page's current summary and append the actual checkpoint/delta with evidence. Keep the fixed baseline table. A material scope change requires a new `checklistVersion`, an explicit mapping/reason and retained earlier counts.

The initial denominator covers the Notion first application: new assets and local edits. The broader repository roadmap's organic/reference breadth and conditional UV, rig, physics and engine profiles are not silently declared complete or made universal requirements by this percentage.

[baseline-runtime]: https://github.com/ictseoyoungmin/refas/blob/3217b46ee3670f2bc8acc1eff320981a539ce70c/skills/refas/scripts/production/project.py
[baseline-tests]: https://github.com/ictseoyoungmin/refas/blob/3217b46ee3670f2bc8acc1eff320981a539ce70c/tests/test_production_project.py


## Verified checkpoint — source identity and major construction

**K4 is demonstrated: 28/31 = 90%.** The criterion meanings and previous
checkpoints remain unchanged. R2-05 is **4/4, REVIEW**.

The [source-identity report](evidence/source-identity/README.md) preserves the
literal prompts, all rejected iterations, matched actual renders, isolated
visual review and code-review repairs. The reviewer inspected both full source
sheets and all 44 anonymous candidate renders. Jacket identity-04 and arm
candidate-05 meet their declared visual prototype scope, while neither is
accepted as finished art. Actual cuff/cover local edits preserve unrelated
state; all 18 jacket and 19 arm selected artifact/input files restore exactly.
Native reopening, independent GLB import/render and bounded joint samples pass.

The active production runtime and 15-file skill / 17-file npm distribution
remain unchanged. Existing regression gates pass with 935 JavaScript tests;
new asset workflows execute in actual Blender. The prior checkpoint's 65
production tests remain historical execution, not a new run attributed here.

**Remaining criteria: E2, D2 and D3.** E2 still lacks prospective matched
three-condition controls and actual model/tool billing. Recorded continuation
times, including first render and observed completion, do not substitute for
those measurements. Main merge and formal release are separate unfinished
steps. PR #399 remains Draft and 0/6 Notion tasks are CLOSED.
