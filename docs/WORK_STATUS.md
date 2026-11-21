# RefAs work status

## Active work

RefAs 2.0 production rewrite — first native authoring and local-edit slice, [issue #398](https://github.com/ictseoyoungmin/refas/issues/398), branch [`rewrite/v2`](https://github.com/ictseoyoungmin/refas/tree/rewrite/v2).

The user approved implementation of the new production path, starting from `main@a29bcc42f4da666c812462eb130836f2d766b0a1`. The [implementation plan](development/refas-2-plan.md) and [Work OS plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) record the accepted direction. Status date: 2026-11-22, Asia/Seoul.

This is development work. The latest published release remains `v1.4.1`; package/runtime/plugin version `1.4.2` is retained until the coordinated 2.0 packaging milestone. No release or merge to main is part of this slice.

## S1 implementation and local acceptance

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

## Verification evidence

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

This slice proves a working native production loop on original scripted fixtures. It does **not** establish original-photo reconstruction quality, a newer model's superiority, complete character deformation or target-engine readiness. The independent mug exercise is a usability check, not a no-skill/1.x/2.0 quality comparison.

The supported export scene uses visible meshes, armatures/empties and packed still textures. Convert curves/text to meshes and keep hidden guides outside the asset scene. Linked libraries, external movie/audio/cache dependencies and non-armature modifiers on deformable meshes are unsupported. Procedural materials may need baking for matching GLB appearance. General rigs, drivers, animation, simulation and node-group behavior are not exhaustively verified.

Revision storage uses local full-file copies. Exercised recovery cases are process/IO failures, stale edits, file tampering and explicit restore. Power-loss durability, network filesystems, history compaction and automatic stale-lock recovery are not acceptance claims.

Next: establish permitted original-reference tasks and a controlled no-skill/1.x/2.0 comparison, then demonstrate a useful correction on a real reference asset. Keep model, prompt purpose, toolchain and resource budget comparable. Extend the editing/export profiles justified by those cases. Coordinated version cutover, migration and release remain later milestones.

## Resume order

1. Inspect branch HEAD, the active issue/PR and the working tree; preserve concurrent work.
2. Read this status, the plan, the production CLI/worker and the example evidence.
3. Continue real-reference evaluation; do not re-label fixture checks as a quality benchmark.
4. Keep 1.x compatibility checks while deciding the final 2.0 packaging boundary.
