# Production-only distribution, explicit 1.x import and renderer isolation

Verified on 2026-11-22 against the development work on `rewrite/v2`, starting
from `ef1d6b8acb944b545bebb486571d7841a3eea1b6`. This record supports the fixed
E3, E5 and D1 criteria in the [plan ledger](../../refas-2-progress.json).
The ledger's implementation checkpoint identifies the tested commit.

The active package, Python runtime and plugin metadata use **2.0.0-alpha.1**.
This is an unpublished development cutover, separate from main merge and formal
release. Neither jacket nor automail receives a new visual-acceptance decision.
Comparable full authoring-time/model/tool-cost measurement remains open.

## 1. What is installed

The old mixed skill contained 277 files. All 264 classified 1.x-only files move
to the one repository-only `legacy/v1/` implementation. The active skill retains
the production code and guides and gains two directly used import files.

| Scope | Before this change | Current |
| --- | ---: | ---: |
| `skills/refas` files, including two cache-exclusion files | 277 | 15 |
| Uncompressed skill bytes, including those files | 3,516,060 | 121,947 |
| Substantive installed skill files | 275 | 13 |
| Actual npm package files | 399 | 17 |
| Separate repository-only legacy files | 0 | 265 |

The legacy count is 264 moved files plus the original 1.x `SKILL.md` restored
from the pinned starting main. The active skill has this structure:

| Location | Role |
| --- | --- |
| `SKILL.md` | Start, create, review, edit, recover and deliver |
| `scripts/produce.py` | Production CLI |
| `scripts/production/` | Version, project/revision storage, Blender worker, review configuration, explicit legacy asset reader |
| `references/production-{assemblies,garments,review,import}.md` | Four problem-specific guides, read when needed |
| `agents/openai.yaml`, `assets/icon.svg` | Agent discovery and icon |
| Two `.npmignore` files | Exclude generated Python cache files |

`legacy_import.py` is new, active production code that reads selected old project
data. It does not call or wrap the old runtime. No old JavaScript CLI/library,
certification graph, template tree, CPU renderer, old requirements or schema
tree remains inside the installed skill. Root schemas, legacy tests and
comparison examples are repository-only. All plugin adapters discover the same
active `./skills/` folder.

The npm package contains the 13 skill files plus `bin/refas.mjs`, `package.json`,
README and LICENSE. The launcher invokes the same Python CLI. The former
`refas-host` bin and JavaScript API exports are removed. Direct skill use needs
Python standard library and Blender; the npm adapter additionally needs Node.
The [distribution inventory](checks/distribution-summary.json) and
[264-file move inventory](checks/move-inventory.json) record the exact boundary.

All 131 moved JavaScript library modules and the old renderers retain their
bytes. Seven graph/routing/verifier files change their explicit locations; old
runtime behavior checks remain. The legacy graph has 40 nodes and 121 executable
interfaces after removing its three production-only guide routes. The retained
legacy runtime keeps version 1.4.2.

## 2. Real package installation and execution

An actual `npm pack` archive was installed offline into a separate prefix outside
the repository. **All 17 installed files match the tested repository bytes.**
The archive contains 139,434 uncompressed bytes and is 41,389 bytes compressed.
See [pack inventory](package/pack.json), [exact parity and archive hash](package/parity.json)
and the installation stdout/stderr in that directory.

Distribution tests also execute the installed launcher with spaced/Korean
arguments and check exit statuses 0, 1, 2 and 127. A plain copied skill runs with
Python `-S` and an empty PATH, proving the host CLI does not depend on Node or
site packages. Actual Blender work is separately exercised below and in the
integration suite.

The exact active-file and tarball allowlists reject an undeclared old file.
The regression test physically restores and packs `canonical.mjs`, then verifies
that both folder and archive validation fail. This prevents silent mixed-version
packaging rather than merely documenting the intended layout.

## 3. Actual saved 1.x asset: import, local edit, exact restore

The [portable demonstration](../../../../examples/legacy-import/README.md)
executes eight public CLI commands through the installed npm launcher. It uses
a frozen actual wing-cover project previously created by the old runtime:

- Selected checkpoint: `cp_a744fb4e4fae0cd60712`.
- Selected artifact: `assets/wing-cover.glb`, archived SHA-256
  `3fcf70e36a0b42723c3abed6ebc60cdfea0143e19c047ba802258753ee41fdec`.
- Old project: 247 files, 17,427,862 bytes, all unchanged after the entire run.
- Source acquisition: **generated contract reference**, not a source photograph.
- Imported scene: 66 mesh objects, 38,354 triangles.
- Local edit: move only `panel:cell-00` by 0.005 Blender units along Z;
  the other 65 recorded object fingerprints remain equal.
- Exact restore: all 11 selected artifact/input files match the imported bundle.

All **18 workflow checks pass**. The saved old project's certificate is null;
the separate claimed-certificate unit case is synthetic and explicitly labeled
as such. It proves the import code does not promote an old claim into a new
approval. This record does not present a generated fixture or a synthetic
certificate as independent real-photo or certified-production evidence.

Read the [actual result](installed-import/result.json),
[commands](installed-import/commands.json), whole old-project inventories,
and initial/edited/restored revision records. The `captured-inputs` directory
retains the exact chosen GLB, old manifests, original source and migration report;
it is a selected provenance bundle, not the entire legacy project. Native scene
and exported GLB hashes are in the revision records. The complete run projects
were used during execution; this repository evidence retains their compact
reports, source inputs and actual PNGs rather than duplicating all native files.

The root reviewer opened the imported and edited hero renders. Both show the
same cover. The 0.005-unit change is deliberately small and the low-sample views
are noisy; they are execution evidence, not a judged quality improvement. The
locality and restoration conclusions come from the recorded scene/bundle checks.

| Preserved or supported | Explicit limit |
| --- | --- |
| Archived selected native/GLB bytes, original source, project/checkpoint JSON and migration provenance | Other checkpoints and their old review/approval history do not become active 2.0 history |
| Fresh native scene, GLB export, requested actual renders and ordinary later edits | GLB cannot recover absent modifier stacks, construction scripts, procedural graphs or sculpt history |
| Uncompressed native `.blend` with packed image textures and no linked libraries | Linked/unpacked native resources are refused; animation, drivers and simulations are not universally certified |
| Embedded GLB resources, declared extension lists and actual Blender import | External resources are refused; an unsupported required extension fails without a published head; supported import is not per-extension export equivalence |
| Old certification/acquisition metadata retained as provenance | Visual resemblance and game readiness start `not-evaluated`; no certificate transfer |

Three actual Blender migration tests independently cover copied-skill native and
GLB success, linked-library/unpacked-texture refusal and unknown required GLB
extension refusal. Failure retains diagnostic candidate files with no successful
head. Thirteen import unit tests cover invalid selection, paths, data integrity,
capture races and non-inheritance. The existing revision transaction, source,
sequence and publication checks remain on the import path.

## 4. Same-input renderer experiment

The [repository-only harness](../../../../examples/renderer-isolation/README.md)
feeds one 27,120-byte GLB, four known material factors and one perspective camera
to the unchanged legacy CPU PBR and external Blender worker. Independent Blender
observations check actual imported geometry, materials, camera and projected
coordinates. It does not compare different authored models.

All **11 declared checks pass** in [run-02/result.json](renderer/run-02/result.json):

| Measurement | Observed |
| --- | ---: |
| Mesh objects / triangles | 4 / 3,840 |
| Maximum world-position error | 8.3447e-8 |
| Maximum independent projection error | 1.7128e-7 NDC |
| Maximum smooth-normal angle difference | 0.008950° against declared 0.1° tolerance |
| Coverage IoU | 0.9911606 |
| Coverage mismatch outside declared 2 px sampling/filter band | 0 pixels |

CPU light vectors point toward the light (`L`), whereas the external SUN vector
describes photon propagation (`-L`). The matched configuration uses the opposite
sign. A same-sign control visibly lights sphere rims/back surfaces and darkens
the viewed hemisphere. This is a comparison-configuration finding; renderer
algorithms and the production worker are unchanged.

The root reviewer independently opened all five PNGs. Albedo controls retain
matching order/placement/coverage within the declared sampling differences.
Beauty images still differ in world/background, reflections, analytic ambient,
shading approximation, sampling and tone mapping. Read the [full actual report](renderer/run-02/README.md)
for scope and individual render profiles. This is **not shader equivalence,
an art score, source likeness or 2.0 model superiority**. Its observed execution
times are not a fair renderer or authoring-cost benchmark.

The initial [failed normal check](renderer/run-01/result.json) and original
harness remain intact. A separate [custom-normal API round-trip](renderer/normal-roundtrip/result.json)
reproduced the roughly 0.00895° difference without glTF import or rendering.
The final check separates strict position tolerance from declared angular
normal tolerance and makes no bitwise-normal claim. Imported geometry is
retained losslessly as `renderer/run-02/blender-observed.json.gz`; decompress it
to obtain the exact JSON named in the raw run report.

## 5. Gates and claim boundaries

| Gate | Actual result |
| --- | --- |
| Full JavaScript suite | 935 passed, 0 failed/skipped |
| Full opt-in production suite | 65 passed: 47 unit/CLI and 18 actual Blender tests; 0 skipped |
| Python compilation, repository, plugin, active/legacy skill boundary | PASS |
| Skill format validator | PASS |
| Retained old dogfood | PASS, 11 checkpoints |
| Actual production npm audit/install | PASS, 17-file exact payload and source parity |
| Installed real import/edit/restore | PASS, 18 checks over eight commands |
| Renderer-isolation experiment | PASS, 11 scoped checks |

The initial JavaScript run's three failures are retained in the original log:
two old graph-node count expectations and a README read during its rewrite.
The corrected final full suite passes; no old runtime behavior test was removed.
Ordinary remote CI can skip optional Blender tests; the 18 actual Blender
successes above refer specifically to the recorded local execution.

The literal user request, engineering dispatches and fresh-session task are
saved under [prompts](prompts/), including hashes and pre-dispatch timestamps.
Implementation collaborators saw engineering context; they are not represented
as blind authoring controls. The fresh-session task sees only the installed
skill, raw source project and its requested local edit/recovery task.

The completed [fresh-session continuation](forward-use/README.md) uses the
installed skill without repository code/test context. It explicitly imports
the archived asset, chooses fixed hero/detail/grazing observations, lifts only
the requested panel and restores the original 11-file bundle. All 65 other
object records and the old project's 247 files remain equal. The target's
transform changes; its mesh/material data and GLB binary geometry stay equal.
The root reviewer also opened the two grazing renders, which show the exposed
raised edge. This proves the requested local edit and recovery, not mechanical
attachment quality or source-photo likeness. The skill's installed bytes remain
equal to the tested archive. The session's initial helper-path error and final
successful verification are both retained.

The [independent scope review](checks/cutover-scope-review.md) found no blocker
for E3, E5 or D1. It independently checked actual source/output identities and
the retained legacy regression changes. Copied-skill and npm installation are
executed; host-specific marketplace installation is not independently exercised.

No main merge, release/tag/public package, finished asset acceptance or new
time/cost advantage is claimed. Remaining fixed criteria are evaluated separately
in the plan ledger.
