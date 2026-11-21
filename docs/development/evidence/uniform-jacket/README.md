# Uniform jacket pilot: evidence and limits

**The original RefAs 2.0 candidate did not win the visual comparison.** The independent anonymous review preferred plain Blender, then RefAs 1.x, then RefAs 2.0 as a starting point for further work. All three remained unfinished. The separate v2 follow-up repaired the dominant shoulder gaps with shared mesh boundaries, but underarm pinching and other reference differences remain.

한국어 요약: 최초 블라인드 평가에서는 일반 Blender 결과가 v2보다 전체 의상 형태에서 우세했다. 세 결과 모두 완성품으로 승인되지 않았다. 이후 v2의 어깨 연결을 실제 공유 경계로 수정했지만, 이는 원래 비교에서 제외한 후속 작업이며 겨드랑이의 꺾임은 남아 있다.

## Inspect the evidence

- [Visual comparison](comparison.html): the complete original sheet, six synchronized diagnostic views of the three conditions, and the separate follow-up BEFORE/AFTER.
- [Structured evaluation](evaluation.json): source and report hashes, observer provenance, exact per-view camera/render records, normalization records, local edit checks and explicit limitations.
- [Original blind review](blind-review.md) and [machine-readable blind review](blind-review.json): copied byte-for-byte without rewriting the verdict after unblinding. Anonymous `A/`, `B/`, `C/` paths in these originals correspond to the mapping below.
- [Common assignment](../../../../examples/uniform-jacket/TASK.md), [reference manifest](../../../../examples/uniform-jacket/reference.json), and [unaltered source sheet](../../../../examples/uniform-jacket/source/reference.png).

## What this trial tested

Each condition independently produced one editable jacket attempt from the same original design sheet, using locally available Blender 4.3.2 and no existing garment mesh. The budget was a **15-minute soft limit**, one initial whole-model candidate and **at most one geometry correction after visual review**. Each condition used one correction and retained its initial candidate. The agents inherited the same model configuration; the provider/model ID, exact tokens and complete tool-call counts were not instrumented. No model identity or token estimate is inferred from the transcript or file sizes.

The deliverables included native source, GLB, construction scripts, actual renders and a local cuff-edit/restore exercise. Jacket construction—not a body, mannequin, rig, cloth simulation or engine integration—was the scope. The authoritative front, back and labelled-left source views placed the ornament on the wearer's left (+X). Chest/hem values were treated as inferred closed circumferences for an open-front garment. Conflicting cuff and collar labels were recorded rather than forced into incompatible geometry.

| Condition | Blind label | Recorded wall time | Assigned guidance accessed | Blind whole-garment finding |
|---|---|---|---|---|
| Plain Blender | B | 12 min 01 s (721.1 s) | No RefAs guidance | Preferred development prototype; pinched armholes, compact proportions and unresolved collar |
| RefAs 1.x | C | **At least 590.8 s** | 12 Markdown files, 155,409 unique bytes accessed | Usable development prototype; rear armhole defects, unclear sleeve shield and simplified cuffs |
| RefAs 2.0 production | A | **At least 573.1 s** | 9,090-byte SKILL.md plus a diagnostic worker excerpt | Major visible shoulder separation; substantial reconstruction required |

Legacy and v2 recorded their first reliable clocks **after** the first guidance read. Their reported intervals are lower bounds, not exact totals; v2's approximate pre-read time is not a measured start. No overrun was observed, but exact total-budget compliance for those conditions cannot be established. Guidance bytes measure file access, not tokens or complete consumption of truncated responses. The legacy report records oversized reads and rereads. These data do not support a speed ranking.

There is one attempt per condition and one qualitative blind review. This is exploratory evidence of concrete behavior, defects and workflow friction, **not a statistically supported claim of workflow superiority**. No numerical likeness scores were produced.

## The observer correction is part of the result

The first common observer silently omitted native `CURVE` objects. That affected piping and other details in plain and legacy; the original `/tmp/refas-jacket-evaluation/common` images are **rejected comparison evidence**. A later `common-complete` directory is also superseded because its normalization audit was overwritten.

The authoritative observations are in **`/tmp/refas-jacket-evaluation/common-final`**. The corrected procedure realized curves to meshes in separate observation copies: **44 plain, 76 legacy, 0 v2**. It did not resave the original native candidates. The recorded source SHA-256 hashes still match all three inputs, and each normalization record's hash matches its observation record. All six corresponding camera, lighting, framing and renderer records are identical across the three conditions. The unchanged PNGs from those observations are presented in `renders/{plain,legacy,production}/`.

The observer used six fixed orthographic views, 512 × 512 pixels, Cycles CPU, 24 samples, no denoising, AgX and a shared three-area-light rig. The images are **unregistered to the design sheet**. Shared render settings make candidate-to-candidate qualitative inspection useful; they do not calibrate the source, validate dimensions, establish topology from pixels or isolate material response from lighting. Transparent PNGs are shown on a light background without cropping or repainting.

Runtime handling now explicitly rejects unsupported object types and instances instead of silently omitting them. Independent runtime review also reproduced an instanced-curve fingerprint hole, and explicit rejection was added. This is a failure-reporting improvement, not a claim that curve instances are now supported. Current-frame inventories and fingerprints remain limited to the state they record.

## What the blind review establishes

The original label mapping is **A = v2, B = plain, C = legacy**. The reviewer saw the complete reference and six anonymous views per candidate. Its preference was **B → C → A** for continuing development, with the clearest distinction being A's disconnected shoulder appearance. B's advantage over C involved continuity, readable ornament and layered cuffs; C had favorable sleeve drop and some additional neck-edge flare. These tradeoffs are preserved in the original review.

All three failed finished visual acceptance. Shared defects included rigid collar/lapel construction, insufficient torso shaping, simplified ornament and fabric reading lighter/cooler than the source. The reviewer could not infer editability, exact measurements, manifoldness, rigging or engine readiness from PNGs. The trial's v2 runtime checks therefore must not be reported as evidence that its jacket looked better.

## Local cuff edit and restoration

Each condition changed only the intended wearer's-left cuff assembly from a nominal **6 cm to 7 cm** along the sleeve axis. The distal rim remained fixed, proximal piping moved 10 mm, and centered hardware moved 5 mm without stretching the buckle. The original report checks—not image resemblance—support the following preservation results.

| Condition | Protected objects checked | Measured band height before → after | Restoration evidence |
|---|---:|---|---|
| Plain | 78 | 0.0600000 → 0.0700000 m | Reopened/resaved candidate reproduces recorded geometry, transform and material fingerprints; native file byte identity is **not asserted** |
| Legacy | 104 | 0.060000008 → 0.070000009 m | Restored native file is byte-identical to candidate; protected state and materials also checked |
| v2 | 269 | 0.059987178 → 0.069987188 m | Native restore produces byte-identical candidate file and matching scene fingerprint; eight recorded artifacts pass integrity verification |

These object counts describe different scene decompositions and checking scopes; a larger number is not a quality score. Plain's fingerprint restoration is distinct from the other two conditions' file-byte restoration. The legacy native edit is not represented as an admitted legacy bounded-edit checkpoint transaction. Pre-existing cuff intersections and other visual defects are not cleared by successful edit isolation.

## Separate informed shoulder follow-up

The follow-up started from the original v2 candidate after its defects were known. It ran for approximately **363.5 seconds**, outside the initial budget, and is excluded from the trial ranking. All twelve original trial artifacts covered by the preservation record retained their hashes. One geometry correction and an unchanged diagnostic baseline supplied the BEFORE/AFTER comparison under the same six-view specification.

The repair extracted two 42-edge armhole boundaries and joined the sleeve caps using the body's actual vertex indices. **All 84 shared armhole seam edges now have exactly two incident faces.** It retained all 970 original body cage vertices and 440 lower-sleeve cage vertices per side from the 0.14 m ring onward. The shoulder tabs were fitted onto the evaluated cloth surface. The removed separate sleeves are now named vertex groups inside the unified cloth mesh.

**266 protected objects, all cuff pieces, chain/shield decoration and materials remained unchanged** under the recorded checks. Exported outer bounds stayed unchanged. However, the unified cloth uses subdivision level two instead of the body's previous level one: retaining body cage coordinates does not imply an unchanged evaluated body surface. Object-level sleeve selection also changed to vertex-group selection. Evaluated triangles increased from 161,820 to 189,172; this is a descriptive cost, not a quality metric.

The large gaps visibly close, supported by the shared-edge check. **Underarm pinching remains**, especially in back and rear three-quarter views. Collar/lapel stiffness, fabric appearance, approximate ornament and buckle placement also remain. Ten current artifacts pass the follow-up's recorded-file-integrity check; that check does not certify appearance, overall topology quality or production readiness. No deformation, rigging, simulation, cloth UV or target-engine validation was added.

## Verification checkpoint and next acceptance

Final local verification passed **931 JavaScript tests** and **34 production tests: 23 project/CLI plus 11 actual-Blender tests**. Python syntax, repository/distribution checks, the retained 11-checkpoint dogfood and the 397-file package audit also passed. Eight focused guidance/version checks passed after the final wording changes. The portable jacket example completed eight public CLI commands, changed only seven cuff objects, preserved 266 others, and restored all selected artifacts and captured inputs exactly; see [reproduction evidence](records/reproduction.json). Remote CI is reported separately on [Draft PR #399](https://github.com/ictseoyoungmin/refas/pull/399). Visual acceptance remains unpassed regardless of software-test status.

The actual 397-file npm package was also extracted and executed outside the repository. Six public CLI commands adopted the native jacket, rendered it in real Blender, edited the cuff, restored the captured baseline exactly and verified its artifacts. See [installed-package evidence](records/installed-package.json). This is an informed compatibility check, not a new blind trial or package publication.

Further garment work should first refine continuous armhole curvature and rebuild the folded collar/lapel relationship, then reconcile fitted proportions, ornament readability and dark fabric response across all six views. Any improved candidate requires another explicit source-based visual review. Preserve the original candidates, rejected observer attempts, blind verdict and this informed follow-up as separate evidence.
