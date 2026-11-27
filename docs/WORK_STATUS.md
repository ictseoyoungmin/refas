# RefAs work status

## Current resumption point

Status: **2026-11-27**. The fixed checklist is **33/37 = 89% rounded** after
independent declared-use acceptance of **U2, U3 and U6**. R2-07 is **5/5,
REVIEW**; R2-06 remains **5/7, WIP**; **0/7 tasks are CLOSED**. U1, E2, D2 and D3
remain open. This is binary criterion coverage, not finished-art quality,
effort completed or release readiness.

The current documentation checkpoint is
[PR #431](https://github.com/ictseoyoungmin/refas/pull/431). Overall rewrite and
delivery tracking remains [Issue #398](https://github.com/ictseoyoungmin/refas/issues/398)
and [Draft PR #399](https://github.com/ictseoyoungmin/refas/pull/399). Read the
[fixed progress ledger](development/refas-2-progress.md),
[canonical JSON](development/refas-2-progress.json),
[wearable delivery report](development/evidence/usable-assets/wearable-delivery.md),
[implementation plan](development/refas-2-plan.md),
[Work OS](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) and
[skill relationship map](development/refas-2-skill-map.md).

This file is a current resumption index. Its previous complete contents are
retained at the [immutable f174f6b1 work-status checkpoint](https://github.com/ictseoyoungmin/refas/blob/f174f6b1cf9ce19ce905b58490d117aca01cea4b/docs/WORK_STATUS.md),
which also links the earlier 28541316 history. Consolidation changes this
index, not the six historical progress checkpoints, retained evidence,
rejected models or earlier decisions.

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
- **Cumulative-main 1 MiB source-artifact budget: FAIL.** This checkpoint
  neither waives that budget nor makes the entire rewrite ready for main.

## Runtime and pending work

The source checkpoint is
[`d02f6188`](https://github.com/ictseoyoungmin/refas/commit/d02f618801167040145087812abfaa3ff5e69dcc),
whose [PR #431](https://github.com/ictseoyoungmin/refas/pull/431) repairs live
engine attachment observation. Actual installed production/save/export and
edit/restore use
[`f174f6b1`](https://github.com/ictseoyoungmin/refas/commit/f174f6b1cf9ce19ce905b58490d117aca01cea4b),
with 19 installed skill files / 23 package files. That runtime includes
[selective authoring discovery and thickness fields, #429](https://github.com/ictseoyoungmin/refas/pull/429).
This documentation change adds no runtime code, installed helper or new test
execution claim.

Active development identity remains **2.0.0-alpha.1**, retained repository-only
1.x is **1.4.2**, and the recorded published release remains **v1.4.1**. Main
merge D2 and formal release/publication D3 remain unfinished. PR #399 remains
Draft. The optional section-sweep [Issue #424](https://github.com/ictseoyoungmin/refas/issues/424)
and [Draft PR #425](https://github.com/ictseoyoungmin/refas/pull/425) retain their
own installed-use, matched-trial, source/visual and budget gates; this wearable
acceptance does not accept that helper.

Resume in this order:

1. Review the exact #431 documentation/evidence head and required source
   checks. Keep user models, render media, arrays, raw logs and recovery
   archives outside Git; preserve all historical tracked evidence.
2. After #431 merges, record the separately reviewed **U1** prospective
   comparison in its own Issue/PR and append-only checkpoint. U1 receives no
   credit in this stage. **E2** remains open for comparable useful-edit/full
   elapsed time and model/tool cost; later informed repair is not a substitute.
3. Continue optional authoring work only under its own declared scope and
   active-work ownership. Consult native revision state and the corresponding
   source-bound report before using or reopening a model.
4. Resolve cumulative source-budget and other outstanding review/release
   requirements independently. Do not close tasks, merge the rewrite, publish
   a tag/package or claim finished art from this criterion update.

## Retained history and recovery index

| Earlier work | Evidence retained for its exact scope |
| --- | --- |
| Initial rewrite, reference adoption, distribution/import and source identity | [Progress history](development/refas-2-progress.md), [reference freshness](development/evidence/reference-freshness/README.md), [distribution/import](development/evidence/v2-distribution-and-import/README.md), [source identity](development/evidence/source-identity/README.md). |
| Accepted arm continuation | [Asset report](development/evidence/usable-assets/automail-resume/README.md), [independent review](development/evidence/usable-assets/recovery/review-automail-candidate08.md), [durable delivery record](development/evidence/usable-assets/automail-resume/delivery-archive.json). |
| Rejected garment and contact observer | [High16/low29 rejection](development/evidence/usable-assets/recovery/review-jacket-high16-low29.md), [predicate review](development/evidence/usable-assets/recovery/review-contact-predicate.md), [retained arm impact](development/evidence/usable-assets/recovery/arm-contact-predicate-impact.json). |
| Rest shells and correspondence controls | [High42/low44 rest review](development/evidence/usable-assets/recovery/review-jacket-high42-low44.md), [candidate14 interfaces](development/evidence/usable-assets/recovery/review-jacket-candidate14-contact-map.md), [all-phase actual-GLB control](development/evidence/usable-assets/recovery/review-all-phase-correspondence.md). |
| Fixed-triangle recovery and old alpha checkpoint | [Topology continuation](development/evidence/usable-assets/recovery/topology-continuation/README.md), [2026-11-23 development report](development/refas-2-development-report-2026-11-23.md). |
| Native iteration, attachment, inspection, curves, CI, import, lattices, construction sources and fixed views | [Skill relationship map](development/refas-2-skill-map.md) and [immutable previous status and PR index](https://github.com/ictseoyoungmin/refas/blob/f174f6b1cf9ce19ce905b58490d117aca01cea4b/docs/WORK_STATUS.md). |

The current ledger names accepted scope; the linked immutable histories explain
why prior candidates or observations failed. Removing a current index entry
would affect discovery of that evidence, not runtime behavior or its recorded
acceptance. Source rules remain in [AGENTS.md](../AGENTS.md) and
[GitHub governance](github-governance.md).
