# RefAs work status

## Active work

RefAs 2.0 production rewrite — native authoring and the first original-reference pilot, [issue #398](https://github.com/ictseoyoungmin/refas/issues/398), branch [`rewrite/v2`](https://github.com/ictseoyoungmin/refas/tree/rewrite/v2), [Draft PR #399](https://github.com/ictseoyoungmin/refas/pull/399).

The user approved implementation of the new production path, starting from `main@a29bcc42f4da666c812462eb130836f2d766b0a1`. The [implementation plan](development/refas-2-plan.md) and [Work OS plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) record the accepted direction. Status date: 2026-11-22, Asia/Seoul.

This is development work. The latest published release remains `v1.4.1`; package/runtime/plugin version `1.4.2` is retained until the coordinated 2.0 packaging milestone. No release or merge to main is part of this slice.

## Current: uniform-jacket pilot and fixed review controls

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

The native workflow is exercised on original scripted fixtures and the jacket's source-image creation/local-edit tasks. The jacket pilot does **not** establish production-quality reconstruction, a newer model's superiority, complete character deformation or target-engine readiness. The independent mug exercise remains a usability check; the later jacket comparison has its own bounded evidence.

The supported export scene uses visible meshes, armatures/non-instancing empties and packed still textures. Convert curves/text to meshes, realize object instances, and keep hidden guides outside the asset scene. Linked libraries, external movie/audio/cache dependencies and non-armature modifiers on deformable meshes are unsupported. Procedural materials may need baking for matching GLB appearance. General rigs, drivers, animation, simulation and node-group behavior are not exhaustively verified.

Revision storage uses local full-file copies. Exercised recovery cases are process/IO failures, stale edits, file tampering and explicit restore. Power-loss durability, network filesystems, history compaction and automatic stale-lock recovery are not acceptance claims.

Next: refine connected garment curvature, collar/lapel folding and appearance;
turn useful construction lessons into concise guidance and forward-test it on
an unfamiliar asset. Extend editing/export profiles only for actual needs.
The first source task and useful correction are now recorded; broader repeated
evaluation, explicit migration, coordinated packaging and release remain open.

## Resume order

1. Inspect branch HEAD, the active issue/PR and the working tree; preserve concurrent work.
2. Read this status, the plan, the production CLI/worker and the example evidence.
3. Continue real-reference evaluation; do not re-label fixture checks as a quality benchmark.
4. Keep 1.x compatibility checks while deciding the final 2.0 packaging boundary.
