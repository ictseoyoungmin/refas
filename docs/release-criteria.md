# RefAs release criteria

## Published 2.1.0 release boundary

The release extends native whole-form authoring with spatial cage brushes
and editable mesh/path Boolean operations, alongside the existing surface,
mounting, recess, projection and local-edit tools. Methods remain optional and
can be combined or revisited as the shape requires. Metadata is **2.1.0**;
reviewed feature and renderer sources are validated. Preparation
[#468](https://github.com/ictseoyoungmin/refas/issues/468) and main integration
[#469](https://github.com/ictseoyoungmin/refas/pull/469) are complete.
The [actual publication #470](https://github.com/ictseoyoungmin/refas/issues/470)
and [canonical receipt](development/refas-2.1-release.json) record the separate
successful exact-main publisher and actual public-download installation.

### Actual v2.1.0 publication receipt

- Release [v2.1.0](https://github.com/ictseoyoungmin/refas/releases/tag/v2.1.0), ID **461510302**, was published at **2026-11-28T11:31:15Z (20:31:15 KST)**. The lightweight tag and release target both equal `37564be1bb58c2462020b5dfcc5fe97b627e66e1`; the tagged changelog matches release metadata.
- [Exact-main CI](https://github.com/ictseoyoungmin/refas/actions/runs/46139735130) passed Node 22/24 and all 17 named full-QA gates, and [production CI](https://github.com/ictseoyoungmin/refas/actions/runs/46139735126) passed. The existing [manual publisher](https://github.com/ictseoyoungmin/refas/actions/runs/46140239756) succeeded with that unchanged main SHA and `PUBLISH`.
- [refas-2.1.0.tgz](https://github.com/ictseoyoungmin/refas/releases/download/v2.1.0/refas-2.1.0.tgz), asset **804326240**, is **152,283 bytes**, SHA-256 `c4dff416b2100fcfee222adbacb3469091f1bb757a845330efad134e2cd78dec`. The [checksum](https://github.com/ictseoyoungmin/refas/releases/download/v2.1.0/refas-2.1.0.tgz.sha256), asset **804326298**, is **82 bytes**; both full hashes are in the canonical receipt.
- Both unauthenticated downloads match the prepared exact-main bytes and GitHub asset digests, with exact checksum content. Installing the actual downloaded archive passes isolated npm CLI and copied Python without Node/site packages; all **32 package / 28 skill files** match the tagged source, **524,737 unpacked bytes**. The receipt was verified at **2026-11-28T11:32:21.768Z**.

This receipt does not change the immutable tag or archive, whose documentation
is the pre-publication source snapshot. It does not upgrade any model, native
crash or measured-cost finding to accepted.

The admitted [#465](https://github.com/ictseoyoungmin/refas/issues/465) native
authoring contract has 14 actual Blender/copied-skill operation tests, five
discovery tests and fresh car/garment native continuation and delivery evidence.
Native and GLB reopened with actual renders; the garment demonstrated exact
native restore and identical GLB re-export. Source fidelity remains unapproved
under the original [#456](https://github.com/ictseoyoungmin/refas/issues/456)
criteria. Passing local operations and useful editing does not accept the
whole asset. Follow the [2.1 plan](development/refas-2.1-plan.md) and
[work status](WORK_STATUS.md) for source identities, asset evidence and limits.

Complete the required repository checks and exact package allowlist/identity
verification before main integration. The existing manual publisher requires
the exact current main SHA, `PUBLISH`, successful Node 22/24 main-push CI and
all seventeen named full-QA gates. It prepares and installs the archive from
that exact source, then publishes or verifies the GitHub Release and matching
TGZ/SHA-256 assets. Conflicting existing tags or assets are not overwritten.
Record the actual source, release/workflow identity, public-download bytes and
installation result before calling publication complete. Local packing and a
version change alone do not publish a release; npm registry publication is
outside this channel.

The narrower [#466 / PR #467](https://github.com/ictseoyoungmin/refas/pull/467)
fix restores diagnostic render context after Python failure, with a reproduced
baseline failure, five actual Blender tests and one unchanged-pixel copied-skill
car render. It does not establish the C-level cause of the intermittent crash.
#456 and [#448](https://github.com/ictseoyoungmin/refas/issues/448) remain open in
[2.1.1](https://github.com/ictseoyoungmin/refas/milestone/7).
[E2 #436](https://github.com/ictseoyoungmin/refas/issues/436) remains blocked on
actual matched timing and billing evidence under 2.0.1, independently of this
bounded release. Keep previous visual comparisons and final-art decisions intact.
The 2.0 and original 2.1 ledgers retain their meanings; they do not turn into
a whole-asset quality percentage at release.

## Production 2.0 release boundary

The [v2.0.0 GitHub Release](https://github.com/ictseoyoungmin/refas/releases/tag/v2.0.0)
and its `2.0.0` installation package are published. The installed skill contains
only the production workflow, directly used guidance, metadata and resources.
Verified distribution evidence includes the actual public npm-format archive's
intended file set, matching package/runtime/plugin versions, the isolated npm
entry and copied-skill execution without the repository or retained 1.x
implementation. This installation channel does not claim npm registry
publication.

Use the [2.0 plan](development/refas-2-plan.md) and its
[fixed acceptance checklist](development/refas-2-progress.md) for the declared
production scope. Actual Blender creation/edit/import/restore, source retention,
failure/concurrency handling and honest visual/target assessments remain
required. An explicit 1.x import must preserve selected bytes, report lost scope
and leave both legacy project bytes and legacy certification authority separate.
Broader rig, physics and engine profiles require evidence when promised.

A development metadata cutover or successful package audit does not publish
a release. The explicit manual publication authorization, exact current main
SHA at dispatch, publisher tag/asset conflict-rejection policy and required
current CI remain in force. Main merge
and formal publication are separate delivery criteria: #435/#399 completed
integration, #438 completed release preparation, and the actual publication
record in [#439](https://github.com/ictseoyoungmin/refas/issues/439) completes
**D3 only**. The fixed ledger is **36/37 = 97% rounded**, Delivery **3/3**;
**0/7 tasks are CLOSED** and E2 remains open.

### Actual v2.0.0 publication receipt

- Release **460308601** was published at **2026-11-27T08:02:42Z** from tag/target [`d48ef51ad213ce2d7df3664965fc9dc283783737`](https://github.com/ictseoyoungmin/refas/commit/d48ef51ad213ce2d7df3664965fc9dc283783737), after the successful [manual workflow](https://github.com/ictseoyoungmin/refas/actions/runs/45962623370). The receipt's source identity stays fixed when later documentation changes.
- Exact-main [full CI](https://github.com/ictseoyoungmin/refas/actions/runs/45948863434) and [production CI](https://github.com/ictseoyoungmin/refas/actions/runs/45948863322) passed, including Node 22/24 and all 17 full-QA gates. Source-bound model/Blender evidence keeps its earlier scope.
- [refas-2.0.0.tgz](https://github.com/ictseoyoungmin/refas/releases/download/v2.0.0/refas-2.0.0.tgz), asset **799547991**, is **87,637 bytes**, SHA-256 `9be599330e8be6fb01180d1c6deec3bc27ab4b24c6ad8b9396a32011018b1581`. The matching [checksum file](https://github.com/ictseoyoungmin/refas/releases/download/v2.0.0/refas-2.0.0.tgz.sha256), asset **799548095**, is **82 bytes**.
- Both unauthenticated public downloads match the prepared bytes/digests and GitHub asset digests, with exact checksum content. Installation of the downloaded archive passes the isolated CLI and copied-skill checks with identical source files: **19 skill / 23 package files**, **302,654 unpacked bytes**. The [canonical receipt](development/refas-2-progress.json) records both full asset hashes and preserved acceptance boundaries.

The publication artifact is the verified production npm archive attached to
the matching GitHub Release with its SHA-256 file. It is not the full repository
source archive and does not imply npm registry publication. The upload must
match the reviewed main commit, package allowlist and actual tested archive.
An existing asset must match exactly; conflicting assets are not overwritten.
This is the publisher's overwrite protection; the GitHub Release API reports
`immutable: false`, so server-side release immutability is not claimed.

Comparable first-useful-edit time and actual model/tool cost remain open in
[Issue #436](https://github.com/ictseoyoungmin/refas/issues/436), blocked under
[milestone 2.0.1](https://github.com/ictseoyoungmin/refas/milestone/5), while the
accepted release scope is tracked in [milestone 2.0.0](https://github.com/ictseoyoungmin/refas/milestone/4).
Missing provider/model/usage and billed-cost observations remain null. This
bounded production release makes no speed/cost superiority claim. The selected assets'
declared use and retained failures remain as recorded in their acceptance
reports; neither release identity nor package integrity grants final-art,
universal fitting, continuous-motion collision or physical-retention approval.

## Earlier release contracts

The [historical 1.x release contracts](https://github.com/ictseoyoungmin/refas/blob/285413169bf8fd5aeb666061ff6a113ef364f6f3/docs/archive/v1/release-criteria.md) describe
the earlier implementation and its published formats. Use them only for that
version boundary; they do not add requirements to the 2.0 production workflow.
