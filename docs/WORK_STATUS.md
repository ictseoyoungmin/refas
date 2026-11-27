# RefAs work status

## Current resumption point

Status: **2026-11-27**. The fixed checklist is **36/37 = 97% rounded** after
actual v2.0.0 GitHub Release and installation-package publication, **D3 only**.
Delivery is **3/3**. All nine prior checkpoints and criterion meanings remain
unchanged. R2-06 is **6/7, WIP**; R2-07 is **5/5, REVIEW**; **0/7 tasks are
CLOSED**. **E2 remains open.** This is binary criterion coverage, not
finished-art quality or effort completed.

[v2.0.0](https://github.com/ictseoyoungmin/refas/releases/tag/v2.0.0) is published
from exact main
[`d48ef51a`](https://github.com/ictseoyoungmin/refas/commit/d48ef51ad213ce2d7df3664965fc9dc283783737).
[Issue #439](https://github.com/ictseoyoungmin/refas/issues/439) records the
actual publication and D3 evidence under
[milestone 2.0.0](https://github.com/ictseoyoungmin/refas/milestone/4).
[Release preparation #437](https://github.com/ictseoyoungmin/refas/issues/437)
was merged through [#438](https://github.com/ictseoyoungmin/refas/pull/438).
[E2 follow-up #436](https://github.com/ictseoyoungmin/refas/issues/436) remains
blocked on actual prospective timing/model-usage/billing evidence, now assigned
to [milestone 2.0.1](https://github.com/ictseoyoungmin/refas/milestone/5).

Read the [fixed progress ledger](development/refas-2-progress.md),
[canonical JSON](development/refas-2-progress.json),
[matched comparison report](development/evidence/usable-assets/matched-comparison.md),
[wearable delivery report](development/evidence/usable-assets/wearable-delivery.md),
[implementation plan](development/refas-2-plan.md),
[Work OS](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) and
[skill relationship map](development/refas-2-skill-map.md).

The [pre-publication status](https://github.com/ictseoyoungmin/refas/blob/d48ef51ad213ce2d7df3664965fc9dc283783737/docs/WORK_STATUS.md)
and [complete pre-integration status](https://github.com/ictseoyoungmin/refas/blob/fbe4821fb04ff72f44a69761dd5ddfc22cdbc3dd/docs/WORK_STATUS.md)
retain the preceding delivery decisions, wearable/comparison evidence and
earlier runtime history. No historical checkpoint, retained evidence, rejected
model or earlier verdict is rewritten by this update.

## Accepted publication

The [manual publication workflow](https://github.com/ictseoyoungmin/refas/actions/runs/45962623370)
succeeded at exact main **d48ef51ad213ce2d7df3664965fc9dc283783737**.
Release **460308601** was published at **2026-11-27T08:02:42Z**, with the same
tag/target source, after exact-main
[full CI](https://github.com/ictseoyoungmin/refas/actions/runs/45948863434) and
[production CI](https://github.com/ictseoyoungmin/refas/actions/runs/45948863322)
passed. The main CI includes Node 22/24 and all 17 full-QA gates. Release
preparation passed the five required local gates, 967 JavaScript tests and
11 dogfood checkpoints. Existing source-bound Blender/Godot evidence is reused;
publication does not claim another model review or 187-test execution.

Both public assets were downloaded without credentials and matched the
prepared bytes/digests and GitHub asset digests:

| Public artifact | Actual receipt |
| --- | --- |
| [refas-2.0.0.tgz](https://github.com/ictseoyoungmin/refas/releases/download/v2.0.0/refas-2.0.0.tgz) | Asset **799547991**, **87,637 bytes**, SHA-256 `9be599330e8be6fb01180d1c6deec3bc27ab4b24c6ad8b9396a32011018b1581`. |
| [refas-2.0.0.tgz.sha256](https://github.com/ictseoyoungmin/refas/releases/download/v2.0.0/refas-2.0.0.tgz.sha256) | Asset **799548095**, **82 bytes**, SHA-256 `e6bfec65c832bb29fb2d3acc3bee3fc5f857c2ed84fad1d8b870353960c42544`; exact checksum content verified. |

Installing this downloaded archive also passed the isolated CLI and copied
skill checks with all source files identical: **19 skill / 23 package files**,
**302,654 unpacked bytes**. The publication is a GitHub installation package;
no npm registry publication is claimed. The [canonical D3 receipt](development/refas-2-progress.json)
retains source identity, asset hashes and acceptance boundaries without adding
raw package bytes or logs to Git.

## Accepted source integration

Both foundation and remainder passed fresh `npm test`, `test:python`, `check`,
`dogfood` and `release:audit`: **948 JavaScript tests each**, zero failures or
skips, and **11 dogfood checkpoints each**. The foundation package is 20 files /
258,556 bytes; the remainder is 23 files / 301,916 bytes. These checks cover
their exact 2.0.0-alpha.1 source trees. The final
[CI](https://github.com/ictseoyoungmin/refas/actions/runs/45946321807) and
[production CI](https://github.com/ictseoyoungmin/refas/actions/runs/45946321772)
passed at dc7f37e9 before the tree-identical main merge. Historical actual
Blender/Godot capability evidence is reused with its original scope; this does
not claim another real-asset review or 187-test execution.

The original cumulative-main **1,150,150 / 1,048,576-byte FAIL** is retained.
Integration was resolved by the independently reviewed foundation and remainder
PRs, with **976,655** and **590,356 charged bytes** against their actual
sequential bases. No budget limit or fixed grandfather anchor changed, and no
private model, media, raw log, numerical array or recovery archive was added.

## Independently matched comparison

The [comparison report](development/evidence/usable-assets/matched-comparison.md)
credits evaluating both existing task types across all five original U1 axes:
source likeness, mesh/attachment condition, actual use, functional retopology
and optimization. All three isolated authors received the same garment
`c67633a2…`, arm `badf3fd5…`, full references and task. Product snapshots remain
**none / fixed 1.x a29bcc42 / 2.0 f174f6b1**. Caps were 24 Blender processes and
1,800 active Blender seconds per condition with the same declared environment;
the independent observer was outside author budgets.

The retained outcomes are part of the accepted comparison:

- **Visual ties on both tasks**, after all 54 output images and both full
  references were independently reviewed. No visible quality winner is claimed.
- **Every garment consumer profile is FAIL**: all three conditions fail both
  default 20µm and predeclared 100µm at the unchanged matrix threshold. The 2.0
  all-bone verdict retains 388 original unused-hair-bone failures. Each condition
  also retains 10,765 opacity-confirmed hair/cloth contacts at each common pose.
- **The 2.0 arm export-geometry diagnostic remains FAIL/unresolved**, with 35
  exact-coincident nonmanifold edges and 60 inconsistent-winding edges. All
  three arms' 121-frame consumer PASS does not clear mechanical or overall
  asset acceptance.
- **Fixed 1.x selected-candidate edit/restore is NOT_EVALUATED**. Its executed
  edit/restore used the supplied baseline before retopology; the other two
  selected-candidate exercises retain their bounded evidence.
- **E2 remains open**: one run per condition, absent provider/model snapshots,
  tokens and billed cost, plus incomplete interrupted plain telemetry. No
  speed, cost, GPU or general product-superiority claim follows.

The experiment measures continuation from supplied useful models and motion.
It does not measure reconstruction or animation creation from scratch. Later
informed wearable repairs do not replace these frozen comparison outputs or
clear their failures. Conversely, comparison failures do not describe the
separately selected and reviewed final wearable below.

## Selected use and recoverable evidence

The [wearable delivery report](development/evidence/usable-assets/wearable-delivery.md)
is the entry point for exact artifacts, the independent decision, selected
whole/detail material views, detailed source/mapping resources and durable
recovery/download links. Selected native SHA starts `624a1a90`; selected GLB
starts `af91555a`. The installed cuff edit exercise restored the exact selected
eight artifact files and two captured inputs; the temporary 10 mm cuff edit
has only its stated native frame-1 evidence, not a new full-clip approval.

| Accepted scope | Fixed limits and retained boundary |
| --- | --- |
| Garment mesh and mounting | 100 garment meshes; 30 cloth meshes with Basis plus 49 unique phase keys; 446 hardware bones and 389 chain links. Major unintended defects repaired under unchanged 23 hardware / 37 hardware-cloth policy rows; actual native/export and physical checks cover 97 recorded poses. |
| Identified-character use | Original 26-mesh avatar preserved. Frames 1–97 at 30fps, actual Godot 4.7.2 with the original 5-avatar-bone plus 446-hardware-bone profile. Exact source identity covers 72 critical pairs and 458 selected point labels; consumer contacts retain zero unlisted physical allowance. |
| Garment optimization | 122,898 triangles / 111 primitives against fixed 125,000 / 150, maximum 3 positive skin influences against 4. BODY/COLLAR finite sampled errors 1.400601468 / 1.477630925 mm against 1.5 mm. All saved vertices and triangle centroids, both directions, outer/inner/rim/full; no continuous Hausdorff claim. Avatar-plus-garment total 812,985 triangles is separate. |
| Unchanged articulated arm | All 92 accepted manifest entries reverified; no new arm run. 86,564 triangles / 99 primitives, sampled error 0.423727 mm against 0.6 mm, retained 121-frame action and consumer evidence. The 796 inherited AURIX contour boundary edges and unused `Crown_A_mark` UVMap omission remain scoped exceptions with the original retained. |

The wearing decision does not grant finished-art approval, universal sizing,
arbitrary-pose or continuous-time collision coverage, physical cloth/chain or
fastener simulation, all unused hair-bone/facial-target coverage, or GPU/FPS
benefits. Variable rigid-mount clearance over curved cloth remains reported.
Both final visual-art decisions stay unapproved.

### Retained failed diagnostics

- **Default 20µm consumer playback: FAIL**, 5,883 point checks. The original
  predeclared 100µm profile separately passes; neither profile changes contact
  policy or creates an allowed intersection width.
- **Strict original-avatar geometry and Blender reimport: FAIL.** The strict
  geometric route stops at frame 1; `Body.001` reimport reaches 2.017388303µm
  at frames 28/70 against the unchanged 2µm limit. Exact source-index/positive
  weight preservation and all-26-mesh raw GLB replay separately pass within
  2µm, without modifying the avatar or relabelling the strict results.
- **Direct raw/live static-hair equality: FAIL.** The independently verified
  source-derived uint16 AABB compression route separately passes exact live
  equality with zero fitted parameters; a one-ULP copied-array corruption is
  detected. This does not turn lossy direct equality into a pass.
- **Original exact contact-pair/rest binder: FAIL retained.** The accepted
  supplemental route uses unchanged oriented/material/sheet/source lineage
  and original finite construction domains, with no added policy exemption.
- **Historical cumulative-main source-artifact budget: FAIL**, 1,150,150 /
  1,048,576 bytes. Its verdict is retained; the separate accepted integration
  PRs above resolved main integration under the unchanged limits.

## Runtime and pending work

The published production source is
[`d48ef51a`](https://github.com/ictseoyoungmin/refas/commit/d48ef51ad213ce2d7df3664965fc9dc283783737),
with coordinated **2.0.0** metadata and a verified 19-file skill / 23-file
package. This later documentation checkpoint does not replace the source
identified by the recorded v2.0.0 tag.

The earlier accepted main-integration snapshot `fbe4821f…` remains an
**alpha.1** historical record. Selected-asset delivery and edit/restore remain
bound to installed implementation
[`f174f6b1`](https://github.com/ictseoyoungmin/refas/commit/f174f6b1cf9ce19ce905b58490d117aca01cea4b);
the repository-only consumer correction remains
[`d02f6188`](https://github.com/ictseoyoungmin/refas/commit/d02f618801167040145087812abfaa3ff5e69dcc).
Retained 1.x runtime identity stays **1.4.2** and its previous published release
baseline stays **v1.4.1**. Publication grants no new model acceptance.

Remaining work:

1. Keep [E2 #436](https://github.com/ictseoyoungmin/refas/issues/436) blocked in [milestone 2.0.1](https://github.com/ictseoyoungmin/refas/milestone/5) until an execution route provides actual provider/model/usage and attributable billed-cost data with a declared matched resource and spending limit. Preserve missing values as null, all U1 failures and its single-run limits. The existing protocol is sufficient; no general billing framework or production-runtime change is needed.
2. Keep optional section-sweep [#424](https://github.com/ictseoyoungmin/refas/issues/424) / [Draft #425](https://github.com/ictseoyoungmin/refas/pull/425) outside the accepted distribution until its separate installed-use, matched-trial, source/visual and budget gates pass. Publication does not accept that helper.
3. Retain the selected asset resources and source-bound recovery histories. New source or visual evidence may reopen their owning finding; package publication cannot clear an existing model failure or close the seven Notion tasks automatically.

## Retained history and recovery index

| Earlier work | Evidence retained for its exact scope |
| --- | --- |
| Published installation package | [v2.0.0 Release](https://github.com/ictseoyoungmin/refas/releases/tag/v2.0.0), [publication workflow](https://github.com/ictseoyoungmin/refas/actions/runs/45962623370), exact source d48ef51a and the immutable [pre-publication status](https://github.com/ictseoyoungmin/refas/blob/d48ef51ad213ce2d7df3664965fc9dc283783737/docs/WORK_STATUS.md); D3 only, E2 remains open. |
| Accepted main integration | [Foundation #435](https://github.com/ictseoyoungmin/refas/pull/435), [remainder #399](https://github.com/ictseoyoungmin/refas/pull/399), exact main fbe4821f and [pre-integration status](https://github.com/ictseoyoungmin/refas/blob/fbe4821fb04ff72f44a69761dd5ddfc22cdbc3dd/docs/WORK_STATUS.md); D2 only, E2/D3 still open. |
| Matched continuation comparison | [U1 report and durable evidence](development/evidence/usable-assets/matched-comparison.md); frozen none/a29/f174 conditions, failed and missing outcomes, no superiority or E2 credit. |
| Selected wearable acceptance | [U2/U3/U6 report](development/evidence/usable-assets/wearable-delivery.md), [immutable preceding status](https://github.com/ictseoyoungmin/refas/blob/f3c44c1fea7f099bd50db1fa36c407ead2239d6e/docs/WORK_STATUS.md). |
| Initial rewrite, reference adoption, distribution/import and source identity | [Progress history](development/refas-2-progress.md), [reference freshness](development/evidence/reference-freshness/README.md), [distribution/import](development/evidence/v2-distribution-and-import/README.md), [source identity](development/evidence/source-identity/README.md). |
| Accepted arm continuation | [Asset report](development/evidence/usable-assets/automail-resume/README.md), [independent review](development/evidence/usable-assets/recovery/review-automail-candidate08.md), [durable delivery record](development/evidence/usable-assets/automail-resume/delivery-archive.json). |
| Rejected garment and contact observer | [High16/low29 rejection](development/evidence/usable-assets/recovery/review-jacket-high16-low29.md), [predicate review](development/evidence/usable-assets/recovery/review-contact-predicate.md), [retained arm impact](development/evidence/usable-assets/recovery/arm-contact-predicate-impact.json). |
| Rest shells and correspondence controls | [High42/low44 rest review](development/evidence/usable-assets/recovery/review-jacket-high42-low44.md), [candidate14 interfaces](development/evidence/usable-assets/recovery/review-jacket-candidate14-contact-map.md), [all-phase actual-GLB control](development/evidence/usable-assets/recovery/review-all-phase-correspondence.md). |
| Fixed-triangle recovery and old alpha checkpoint | [Topology continuation](development/evidence/usable-assets/recovery/topology-continuation/README.md), [2026-11-23 development report](development/refas-2-development-report-2026-11-23.md). |
| Native iteration, attachment, inspection, curves, CI, import, lattices, construction sources and fixed views | [Skill relationship map](development/refas-2-skill-map.md) and [immutable f174 status and PR index](https://github.com/ictseoyoungmin/refas/blob/f174f6b1cf9ce19ce905b58490d117aca01cea4b/docs/WORK_STATUS.md). |

The current ledger names accepted scope; the linked immutable histories explain
why prior candidates or observations failed. Removing a current index entry
would affect discovery of that evidence, not runtime behavior or its recorded
acceptance. Source rules remain in [AGENTS.md](../AGENTS.md) and
[GitHub governance](github-governance.md).
