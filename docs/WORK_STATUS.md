# RefAs work status

## Active work

RefAs 2.0 production rewrite — native authoring and the first original-reference pilot, [issue #398](https://github.com/ictseoyoungmin/refas/issues/398), branch [`rewrite/v2`](https://github.com/ictseoyoungmin/refas/tree/rewrite/v2), [Draft PR #399](https://github.com/ictseoyoungmin/refas/pull/399).

The user approved implementation of the new production path, starting from `main@a29bcc42f4da666c812462eb130836f2d766b0a1`. The [implementation plan](development/refas-2-plan.md) and [Work OS plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) record the accepted direction. Status date: 2026-11-22, Asia/Seoul.

This is development work. Active package/Python runtime/plugin identity is `2.0.0-alpha.1`; the retained legacy runtime remains `1.4.2`. The recorded published release remains `v1.4.1`. Main merge and formal publication are separate unfinished milestones.

## Current: source identity and major prototype construction

Implemented and verified at
[`815e9f76`](https://github.com/ictseoyoungmin/refas/commit/815e9f76f36ee294ae3cb554215116a08adb168e).
The fixed [plan ledger](development/refas-2-progress.md) advances from
**27/31 (87%) to 28/31 (90%)**, adding K4. R2-05 is **4/4, REVIEW**;
R2-06 remains **5/6, WIP**. No criterion or historical checkpoint changes.

The existing selected jacket now has chest-seated lapels/collar roll, restrained
cloth shaping, dark straps distinct from buckles, and coherent left crest,
chain and pendant construction. The arm now has nested shells, an exposed
actuator core, an actual recessed service compartment, and differentiated
palm/finger shells. A fresh anonymous reviewer inspected both complete sources
and all 44 candidate images, accepting both selected results within the original
prototype scope. Neither is accepted as finished art.

The jacket's 1 cm cuff edit preserves 92 non-cuff objects, distal cuff piping
and materials; all 18 selected artifact/input files restore exactly. The arm's
3 mm cover edit preserves 315 unrelated objects; all 19 selected files restore
exactly. All 300 original arm objects and 20 pivots remain, with declared crown
marking/material-assignment exceptions. Independent native/GLB checks and
actual readback renders pass; joint and surface checks remain explicitly sampled.

JavaScript regression is **935 passed**; existing Python, repository/plugin/
skill checks, retained 11-checkpoint dogfood and package audit pass. Actual
new asset workflows and final code review pass. The previous 65-production-test
execution remains historical. Active skill/runtime/distribution bytes remain
unchanged at 15 skill files and 17 packaged files, with no legacy reinsertion.

Read the [complete evidence](development/evidence/source-identity/README.md),
[isolated visual review](development/evidence/source-identity/review/isolated-visual-review.md)
and [final code review](development/evidence/source-identity/code-review-addendum.md).
The selected native/GLB, original sources, scripts, rejected candidates and full
recoverable project histories are retained in the delivery archives. Both main
projects verify after relocation to the delivery directory.

**Remaining: E2, D2 and D3.** Actual command clocks are recorded, but these
informed concurrent continuations lack complete pre-read clocks, matched
no-skill/1.x/2.0 resources and exposed token/model/tool costs. They cannot close
E2. Main merge and formal publication remain unfinished, PR #399 stays Draft,
and no Notion task is CLOSED.

## Previous: production-only skill, explicit 1.x import and renderer isolation

Implemented and verified at
[`d8bb5dc7`](https://github.com/ictseoyoungmin/refas/commit/d8bb5dc71a86fe1b5012735c89aca3fb32f8006e).
The fixed [Notion checklist](development/refas-2-progress.md) advances from
**24/31 (77%) to 27/31 (87%)**, adding E3, E5 and D1. R2-06 is **5/6, WIP**;
coordinated delivery is **1/3**. All previous counts and criterion meanings are
retained. No task is CLOSED and neither model receives finished visual approval.

The 264 old runtime/guide/template files move to one repository-only
`legacy/v1/`. The active skill changes from **277 to 15 files**, including two
cache-exclusion files. Its 13 substantive files are the production entry,
directly used Python modules, four focused guides, agent metadata and icon.
There are no old JS forwarders, certification graph, templates or schemas in
the active skill. The old runtime library and renderers retain their bytes;
seven boundary/routing files change their explicit repository locations.

The actual npm artifact changes from **399 to 17 files**. Package, runtime,
plugin and documentation versions agree at unpublished `2.0.0-alpha.1`. The
npm executable invokes the production Python entry. Exact allowlists reject
an injected old file, and all 17 installed file hashes match tested source.
Copied-skill and npm installation are exercised; host marketplace installation
is not independently executed.

The new `import-v1` selects a checkpoint and archived `.blend`/GLB explicitly,
verifies its source and bytes, and records exact provenance without inheriting
old approval. Actual installed wing-cover import/edit/restore passes 18 checks:
247 old project files unchanged, one mesh edited and 65 preserved, all 11
selected input/artifact files restored exactly. Native import, supported GLB
and unsupported-resource/required-extension failures run in actual Blender.
The fixture is a generated contract reference, not a source-photo quality case.

The renderer experiment uses one unchanged four-material GLB and verifies
geometry, materials, camera and projected coordinates independently. All 11
scoped checks pass. CPU surface-to-light vectors require opposite SUN
propagation signs in the external adapter configuration; algorithms remain
unchanged. Initial normal-threshold failure, a separate API precision probe
and final angular tolerance are all retained. Beauty differences do not become
claims of shader equivalence, model quality or performance advantage.

| Current verification | Result |
| --- | --- |
| JavaScript regression | 935 passed, zero failed/skipped |
| Production regression | 65 passed: 47 unit/CLI + 18 actual Blender; zero skipped |
| Python, repository, plugin, skill checks | PASS |
| Retained 1.x dogfood | PASS, 11 checkpoints |
| Actual npm audit/install/source parity | PASS, 17 files |
| Installed import/edit/restore | PASS, 18 checks / 8 commands |
| Same-input renderer experiment | PASS, 11 checks |
| Independent scope review | E3, E5 and D1 demonstrated within their stated boundaries |

A separate fresh session used only the installed skill and raw task/source to
import the asset, visibly lift the selected panel using fixed comparison views,
preserve 65 other objects, and restore the initial 11-file bundle. Literal
prompts, raw commands, actual renders, the session's initial helper-path error
and corrected result are retained. This is a practical skill-use check, not a
new no-skill/1.x/2.0 quality or timing comparison.

Read the [full evidence](development/evidence/v2-distribution-and-import/README.md),
[portable import example](../examples/legacy-import/README.md),
[renderer example](../examples/renderer-isolation/README.md) and
[legacy boundary guide](legacy-1x.md).
Remaining criteria are **K4, E2, D2 and D3**: source identity/major construction,
comparable actual time/cost, main merge and formal publication. Next production
work should address the recorded source-specific jacket/arm defects while
capturing an honestly comparable authoring budget and available telemetry.

## Previous: explicit references, evidence freshness and coherent reads

The remaining R2-03 workflow is implemented and verified at
[`d36a461e`](https://github.com/ictseoyoungmin/refas/commit/d36a461e08a9c905792d045a3eb26ad53778635c).
The fixed [Notion acceptance checklist](development/refas-2-progress.md) advances
from **22/31 (71%) to 24/31 (77%)**, adding S3 and S5. R2-03 is **6/6 demonstrated,
REVIEW**. No task is CLOSED; R2-05/06 remain WIP. Future reports must show this
same denominator, verified changes and open criteria. This percentage measures
acceptance coverage, independently of effort, visual quality and release status.

`references` adopts the complete active source set with a required sequence
lease. Model history and archived sources remain intact; equal contents are an
exact no-op. `status` and `verify` expose reference evidence as current, stale
or no-revision separately from recorded-file integrity. Restore reproduces the
old bundle exactly while retaining current references, so a restored bundle may
be stale. Explicit runs capture native/script/review/render changes and publish
their new outputs together.

The baseline concurrent-read bug could mix an old head with newer input/render
paths. Reads now use one declared state, including the initial empty state.
Historical source hashes, stale sequence leases and A-to-B-to-A reference changes
are checked. Independent review also found and verified a repair for reference
publication followed by a failed status response; the response is now validated
before committing the pointer.

| Current verification | Result |
| --- | --- |
| JavaScript regression | 931 passed; zero failed/skipped |
| Production regression | 49 passed: 34 project/CLI + 15 actual Blender; zero skipped |
| Python / repository / skill checks | PASS |
| Retained 1.x dogfood | PASS, 11 checkpoints |
| Package audit and exact extracted parity | PASS, all 399 files match; 43 reference leaves, 68 routed targets |
| Actual installed-package jacket replay | 12 commands (11 CLI + one Blender Save As), all 22 checks pass; nine artifact/input files restored exactly |

The existing joined jacket is the real input for the runtime exercise. Its
cuff changes by 1 cm, seven object fingerprints change and 260 remain equal;
materials and original native/source bytes stay unchanged. Review/render
conditions deliberately change to test adoption, so this is not another visual
comparison or a new selected asset. Both delivered assets retain their previous
unfinished visual decisions. Read the [complete evidence](development/evidence/reference-freshness/README.md)
and [portable example](../examples/reference-refresh/README.md).

Remaining criteria: source-specific identity (K4), actual comparable time/cost
(E2), same-GLB/camera/material renderer isolation (E3), explicit 1.x import with
preservation/loss and no certificate transfer (E5), and coordinated 2.0 cutover,
main merge and publication (D1–D3). Local atomic storage is verified; power-loss
durability, network filesystems and automatic stale-lock recovery are not added.

## Previous: joined jacket facing, compound automail and runtime scope guards

The reattached original sheets now have a new informed refinement with actual
editable native/GLB delivery. Both final selections are preferred to their
delivered baselines in isolated source-and-render reviews, while **both remain
rejected as finished assets**. The jacket's first tied candidate and its literal
review remain intact; a second structural correction receives a fresh review.
See the [complete evidence and offline viewer](development/evidence/garment-assembly-refinement/README.md).

The final jacket joins the collar and both lapels through 22 shared gorge
edges. It preserves 261 original object fingerprints and all six materials.
Its cuff exercise changes seven objects and preserves 260, then restores all
14 selected artifact/input files exactly. The current asset has 267 meshes and
418,540 evaluated triangles; named lapel/gorge vertex groups replace the former
separate lapel selections. Tailoring, the rear collar roll, straps and ornaments
still need source-specific work.

The arm gains layered socket surfaces, varying forearm sections and a real
side channel, plus a restrained volumetric palm. It changes 44 objects and
preserves 256. The 26-node cover moves 3 mm with 274 other objects exact;
cover/pose restoration preserves all 16 selected files. Four saved poses and
independent 300-node GLB import pass their declared checks. Sparse mechanisms,
simplified armor/hand construction and broad shoulder silhouette remain.

Two actual runtime defects are fixed: evaluated Geometry Nodes instances were
missed by the old object-instancing guard, and differing viewport/render
modifier settings could give inventory/export and renders different geometry.
Eight inspect/edit rejection subcases fail on the old worker and pass after
the repair. Realized instances export/import successfully. Both example
runners also preserve repeat-use observation histories.

| Current verification | Result |
| --- | --- |
| JavaScript regression | 931 passed; zero failed/skipped |
| Production regression | 37 passed: 23 project/CLI + 14 actual Blender; zero skipped |
| Python syntax / repository / skill checks | PASS |
| Retained 1.x dogfood | PASS, 11 checkpoints |
| Package audit | PASS, 399 files, 43 reference leaves, 68 routed targets |
| Actual extracted package | Initial jacket replay, final joined-jacket workflow and bounded arm compatibility checks pass; individual evidence states their different scopes |

Literal assignments, feedback, isolated review prompts and packaging requests
are saved before dispatch. The initial authoring uses a frozen skill; the
later joined jacket uses the tested extracted package. No new general
workflow superiority, token/cost result, rig/cloth/engine acceptance or release
is inferred. R2-05/06 remain WIP, PR #399 remains Draft, version metadata stays
at 1.4.2 development and the published release remains v1.4.1.

## Previous: interruption recovery (2026-11-22) — no new geometry acceptance

The unpublished next-step work on the jacket collar/lapels and AURIX overlapping
armor/hand was interrupted. Its reported local script/render/review outputs are
not available in the current durable GitHub branch, the existing Library delivery,
or the Work OS page. The latest published asset result remains **e265a35f**,
with the prior negative/unfinished visual judgments unchanged.

Recovered the **93,743,833-byte** published bundle and verified its ZIP CRC,
the complete 415-entry manifest, all hashes and exact file counts. This is
baseline evidence only; the recovery environment lacks Blender and did not
rerender any asset. Prompt provenance now separates literal persisted
assignment files, reports, actual messages reported in the interrupted session
but unavailable verbatim (reported six recovered/eight unrecovered), and *new
unsent* next-run instructions. No missing messages were reconstructed.

See [archive handoff](development/evidence/garment-and-automail/FOLLOWUP_HANDOFF.md),
[prompt provenance](development/evidence/garment-and-automail/PROMPT_PROVENANCE.md)
and [prepared new author/reviewer prompts](development/evidence/garment-and-automail/NEXT_EXECUTION_PROMPTS.md).
Shape edits, fixed-camera reviews, actual new native/GLB delivery and post-edit
acceptance **remain open**. Existing PR #399 stays Draft; 2.0 is unreleased.

## Previous: garment refinement and fresh automail validation — e265a35f

The user's two selected sources now have actual editable assets, partial-edit
and recovery exercises, native/GLB readback and anonymous visual reviews. Read
the [complete evidence and offline viewer](development/evidence/garment-and-automail/README.md).

The informed jacket refinement is visually preferred to its prior delivered
state for darker cloth and smoother rear shoulder/underarm transitions. Both
states remain unfinished: the revised front collar is still angular/crowded,
and cloth shaping and ornament identity remain weak. Its cuff edit increases
band height by 1 cm and changes seven objects, preserves 264 other object fingerprints and materials,
and restores all 14 selected artifact/input files exactly.

The fresh automail comparison is **ordinary Blender narrowly ahead of fixed
1.x, then candidate 2.0**, with all three rejected for finished visual
acceptance. The 2.0 arm has oversimplified large armor panels and sparse rear
mechanisms. This is one independent attempt per condition, not a statistical
model/skill benchmark. There is no measured quality or cost advantage for 2.0.

The 2.0 arm's 26-node service cover moves 3 mm while 274 objects are preserved.
Saved elbow 0/45/90 and wrist/index poses exercise a rigid hierarchy; independent
GLB import retains 300 named nodes/parents. Limited named-shell observations
do not prove full collision clearance. The final installed-package replay
completes 14 commands and verifies exact restoration of all 13 artifacts/inputs.
Both selected GLBs were independently imported and rendered again.

Two optional garment/assembly guides were added and used from a frozen skill
snapshot. The graph now has 43 reference leaves; 121 runtime interfaces and
the production implementation are unchanged. The common observer explicitly
records curve/text conversion and studio exclusions in disposable copies.
A new actual Blender regression covers transformed parent hierarchies, live
bevels, native/GLB reopening and analytic hinge movement.

| Current local check | Result |
| --- | --- |
| JavaScript regression | 931 passed, 0 failed/skipped |
| Production tests | 35 passed: 23 project/CLI + 12 actual Blender, 0 skipped |
| Python syntax / repository checks | PASS |
| Retained 1.x dogfood | PASS, 11 checkpoints |
| Package audit | PASS, 399 files and 43 reference leaves |
| Actual extracted package | 14 commands pass outside the repo with one configured Blender executable; full artifact/input restore and independent GLB checks pass |

The plain control restores state rather than claiming byte-identical files.
The 1.x control preserves exact candidate files, but its formal `validate`
result remains BLOCKED for seven missing source-bound checks; an imported-mesh
diagnostic also finds topology limitations. These results are preserved in the
raw reports, and no legacy certificate is claimed.

R2-05/06 remain WIP: guidance is usable but source-quality goals, broader
evaluation, migration and coordinated distribution work remain. Code/evidence
are ready for Draft PR review. The earlier jacket trial below remains intact.

## Previous: uniform-jacket pilot and fixed review controls — 00641291

The user's original jacket sheet now drives a completed exploratory
no-skill/1.x/2.0 construction and cuff-edit comparison. Read the
[evidence report and six-view board](development/evidence/uniform-jacket/README.md).
All three initial candidates remain visually unaccepted. The anonymous reviewer
preferred the no-skill prototype, followed by 1.x and then the initial 2.0
candidate. This one attempt per condition does not establish general model or
workflow superiority; two starts missed an exact pre-read clock and token/cost
telemetry was unavailable.

The separate informed 2.0 follow-up closes visible sleeve/body gaps with 84
shared seam edges and seats shoulder tabs while retaining 266 protected object
fingerprints and all materials. Underarm pinching, stiff collar/lapels, simplified
ornament and appearance differences remain. The original trial is preserved.

The case justified two runtime changes: `--review-spec` captures fixed cameras,
lighting and source-region provenance with each revision; inspection explicitly
rejects unsupported geometry and instancing. The first common observer omitted
native curves and is rejected. Corrected observations use separate realized
copies, retain all object counts and preserve source native bytes. All three
original GLBs pass actual reimport counts/bounds/basic-scope checks.

| Current local check | Result |
| --- | --- |
| Full JavaScript regression | 931 passed, 0 failed/skipped |
| Production tests | 34 passed: 23 project/CLI + 11 actual Blender tests, 0 skipped |
| Python syntax and repository checks | PASS; new jacket scripts also compiled |
| Retained 1.x dogfood | PASS, 11 checkpoints; existing render-integrity scope |
| Package audit and installed copy | PASS, 397 files and 41 routed reference leaves; extracted package completed six actual-Blender CLI operations outside the repository, including exact restore; no release |
| Informed jacket reproduction | Eight public CLI commands; seven cuff objects changed, 266 others unchanged, exact artifact/input restore |

Reproduce the informed example with `python3 -B examples/uniform-jacket/run.py
--root /absolute/new/project`. Its results are implementation verification after
the trial, not another blind comparison. Remote CI is linked on PR #399 and is
not inferred from the local results above.

## S1 implementation and local acceptance — baseline 601a7f93

| Area | Verified state |
|---|---|
| Default skill entry | Rewritten around Blender scripts, actual image review, local changes and native projects; 1.x instructions are an optional compatibility route. |
| Project and revisions | 18 standard-library tests cover sources, captured inputs, state leases, atomic pointer publication, failed-run retention, restore and copied-skill execution. |
| Blender worker | 8 actual Blender tests cover native/GLB reopen, local preservation, real PNG output, static modifiers, edited packed textures, unsupported visibility and execution failures. |
| Public CLI example | [Recorded headset workflow](development/evidence/refas-2-native/README.md): one part changed, 29 preserved, matched before/after cameras, failure state retained, six artifacts and captured inputs restored exactly. |
| Independent skill use | [Recorded mug exercise](development/evidence/refas-2-mug/report.md): copied-skill construction, handle edit with body/material preservation, and exact restore; followed by compatibility verification on the final candidate. |
| Existing runtime | 931 JavaScript regression tests passed; retained installation/reference/runtime contracts pass repository checks. |
| Distribution | Package audit passes with production files included. No package or release was published. |

`status` exposes the native file, GLB, scene inventory, actual render paths and captured script inputs. Restore creates a new revision containing the selected prior bundle. File identity does not decide whether a model is visually better.

The first slice is implemented and locally verified. The linked evidence includes original renders, command results, source-file hashes and scope limitations. Run `python3 -B examples/production-workflow/run.py` to reproduce the public CLI demonstration in a new output directory.

## Initial S1 verification evidence — baseline 601a7f93

Environment: Python **3.12.14**, Blender **4.3.2**, Node **24.22.3**. Diagnostic rendering uses **Cycles CPU**, explicit sample/resolution settings and no denoising. This Blender build does not provide OpenImageDenoise.

| Command or check | Local result |
|---|---|
| `npm test` | **931 passed**, 0 failed, 0 skipped. |
| `REFAS_BLENDER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 npm run test:production` | **26 passed**, 0 skipped: 18 project/CLI tests and 8 actual Blender tests. |
| `npm run test:python` | **PASS**, existing Python syntax gate; this command alone is not an execution test. |
| `npm run check` | **PASS**, repository, plugin, installed boundary, instruction graph, interface and discovery checks. |
| `npm run dogfood` | **PASS**, retained 1.x wing-cover workflow with 11 checkpoints. Its claim scope remains render integrity. |
| `npm run release:audit` | **PASS**, retained version boundaries and production files in the package. |
| Focused instruction/version tests after guidance edits | **12 passed**. |

Ordinary production CI intentionally skips the eight Blender tests unless `REFAS_BLENDER_TESTS=1` is set and Blender is available. The local result above opted in and ran them. Remote CI is reported on the pull request; it is not inferred from these local checks.

### Correctness repairs found during independent review

- Restore can replace a damaged current payload with an intact committed revision. It still verifies source copies, the selected target and the state lease.
- A symlinked run directory is rejected before the runtime writes outside the project.
- A persistent run-log write error after publication returns the committed revision and a warning instead of falsely reporting a failed edit.
- Static modifiers are evaluated for GLB while the native modifier stack remains editable. A mixed Bevel/shape-key case protects against globally applying away morph data.
- Dirty packed pixels are repacked before native save; independent native/GLB pixel readback confirms the edits survive both outputs.
- Hidden/excluded meshes are explicitly unsupported in this alpha, preventing a successful GLB/render pair with different visible object sets.

## Current limits and next work

The native workflow is exercised on original scripted fixtures, jacket creation/refinement/local edits and fresh rigid-arm creation/local edits/pose samples. These cases do **not** establish production-quality reconstruction, a newer model's superiority, complete character deformation or target-engine readiness. The independent mug exercise remains a usability check; each later source comparison has its own bounded evidence.

The supported export scene uses visible meshes, armatures/non-instancing empties and packed still textures. Convert curves/text to meshes, realize object instances, and keep hidden guides outside the asset scene. Linked libraries, external movie/audio/cache dependencies and non-armature modifiers on deformable meshes are unsupported. Procedural materials may need baking for matching GLB appearance. General rigs, drivers, animation, simulation and node-group behavior are not exhaustively verified.

Revision storage uses local full-file copies. Exercised recovery cases are process/IO failures, stale edits, file tampering and explicit restore. Power-loss durability, network filesystems, history compaction and automatic stale-lock recovery are not acceptance claims.

Next: improve source-specific broad form and compound surfaces using the
recorded failures: folded collar/lapel readability, layered armor volume and
mechanical negative space. Preserve the current negative comparison as a
baseline for the next independent trial. Extend editing/export profiles only
for actual needs. Broader repeated evaluation, explicit migration, measured
costs, coordinated packaging and release remain open.

## Resume order

1. Inspect branch HEAD, the active issue/PR and the working tree; preserve concurrent work.
2. Read this status, the plan, the production CLI/worker and the example evidence.
3. Continue real-reference evaluation; do not re-label fixture checks as a quality benchmark.
4. Keep 1.x compatibility checks while deciding the final 2.0 packaging boundary.
