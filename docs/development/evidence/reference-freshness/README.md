# R2-03: explicit reference adoption and coherent revision reads

Verified on 2026-11-22 against the development changes after
`3217b46ee3670f2bc8acc1eff320981a539ce70c`. The exact tested files are identified
in [verification.json](checks/verification.json). This slice implements the
remaining R2-03 input-freshness path and repairs a reproduced concurrent-read
bug. It does not change the selected jacket or automail's visual acceptance.

## Implemented behavior

```bash
python3 scripts/produce.py status --root PROJECT
python3 scripts/produce.py references --root PROJECT \
  --reference ORIGINAL_IMAGE --reference UPDATED_BRIEF --expected-sequence SEQUENCE
```

`references` adopts the complete requested set. It retains every committed model
bundle and prior source copy, increments the project sequence for a content-set
change, and leaves the native head intact. Use `--clear` for an explicitly empty
set. Equivalent contents, including duplicate files, alternate names and order,
preserve the exact project pointer bytes. A required sequence lease rejects an
outdated update even when the native head has not changed. `run` and `restore`
also accept an optional sequence lease.

`status` and `verify` expose `evidenceFreshness.status` as `current`, `stale` or
`no-revision`. Its declared scope is **active-reference-content-set**. An intact
old bundle can therefore return `verify.ok: true` and `stale` together. Neither
result transfers visual approval. Restore reproduces the historical artifact
and input bytes while keeping the currently active references; it may produce
stale evidence until references are explicitly re-adopted or new work is run.

Native, script, review and render changes use the existing explicit `run`
boundary. A successful run captures its inputs and regenerates a complete
bound bundle. External originals do not remain live dependencies of their
historical copies. There is no filesystem watcher, mutable revision file,
automatic inherited render default or new visual-approval mechanism.

## Concurrent reads and transaction review

The baseline's `status` read the state and latest revision independently. A
legitimate intervening publication could return the old head with new view and
input names under the old directory, including nonexistent paths. `verify`
had the same separate-read pattern. The new internal loader uses the supplied
state and explicit revision, including an explicit empty head.

The [baseline restart trace](probes/baseline-restart-results.json) records the
failure. Current project regressions cover both readers before and after an
initial head exists, declared edit-input identity, reference mutation during
execution, and A → B → A sequence changes. Historical source hashes are checked
when loading or restoring that revision. Failed copying, pointer publication
and conflicting updates preserve the prior authoritative state.

Independent review found another concrete issue in the first implementation:
with a damaged older manifest, reference replacement could commit and then
report an error from its final status read. The final implementation prepares
and validates its response before pointer publication. The reviewer repeated
the case and confirmed exact pointer/source preservation and cleaned staging.
Both the [initial finding](probes/independent-review-before-fix.json) and
[repair confirmation](probes/independent-review-after-fix.json) are retained.

The transaction probes use the existing fake worker. They establish storage
and publication behavior, not Blender output or visual quality. The historical
probe scripts retain their literal original environment paths; use the current
unit tests for portable regression execution.

## Actual Blender and extracted-package reproduction

The [portable example](../../../../examples/reference-refresh/README.md) uses
the public CLI without importing repository runtime modules. The actual npm
archive was extracted separately; **all 399 packaged files match the repository
bytes**. The installed runner processes the previously selected joined jacket
native and original user reference. See [package parity](checks/package-parity.json),
[all twelve commands](installed-jacket/commands.json) and
[the 22 passing checks](installed-jacket/result.json).

| Stage | Sequence | Reference freshness | Observed result |
| --- | ---: | --- | --- |
| Initialize | 0 | no-revision | Original reference copied |
| Import selected native | 1 | current | Native, GLB and two actual 192 px / 4-sample observations |
| Adopt original plus change brief | 2 | stale | Head and old bundle unchanged; integrity valid |
| Save As and explicitly import local edit | 3 | current | New native/script/review captured; two new 256 px / 5-sample observations |
| Restore original bundle under new references | 4 | stale | All nine artifact/input files restored exactly; active references retained |
| Explicitly re-adopt original reference | 5 | current | Reference set matches the restored bundle |
| Reimport renamed/duplicated original bytes | 5 | current | Exact pointer no-op; restarted status consistent |

The separate native edit increases the wearer-left cuff by
`0.010000010399380699 m`. Seven objects change; 260 retain their recorded
fingerprints. Materials, the opposite cuff and the distal piping remain
unchanged. The [native edit checks](installed-jacket/cuff-edit-checks.json)
separately count 259 protected objects outside the entire left-cuff group.
The existing selected native and original source image remain byte-identical.

Actual observations are retained: [original front](installed-jacket/before-view-front.png),
[original three-quarter](installed-jacket/before-view-front-three-quarter.png),
[updated front](installed-jacket/after-view-front.png), and
[updated three-quarter](installed-jacket/after-view-front-three-quarter.png).
Resolution, sampling and background/alpha intentionally change to test input
adoption. These are workflow evidence, not a controlled visual comparison or
new preferred asset selection. The full temporary project is reproducible from
the original native delivery and the example.

## Verification

| Local gate | Result |
| --- | --- |
| `npm test` | 931 passed; zero failed/skipped |
| Opt-in production suite | 49 passed: 34 project/CLI + 15 actual Blender; zero skipped |
| Python syntax and new example compilation | PASS |
| Repository, plugin, installed-boundary and instruction checks | PASS |
| Skill validation | PASS |
| Retained 1.x dogfood | PASS, 11 checkpoints; existing render-integrity scope |
| Release audit | PASS, 399 files, 43 reference leaves, 68 routed targets |
| Actual extracted-package lifecycle | PASS, 12 commands, 22 checks, nine files restored exactly |

Environment: Python 3.12.14, Blender 4.3.2, Node 24.22.3, Cycles CPU. Raw logs
and source hashes are under [checks](checks/verification.json). The package is
886,211 bytes, SHA-256
`faa4bbea67d1fb11634dfc2aa3ef556ee2aa760e91578d17f97e0842e5ba7eb3`.
These are local execution results; remote CI must be checked at the published
head separately. Ordinary production CI skips the opt-in Blender tests.

## Plan impact and limits

The verified coherent-read repair satisfies S3, and the explicit adopted-input
workflow satisfies S5 in the fixed [Notion acceptance checklist](../../refas-2-progress.md).
Those two binary items advance demonstrated coverage from 22/31 (71%) to
24/31 (77%). R2-03 reaches 6/6 demonstrated, with REVIEW distinct from CLOSED.

Local atomic pointer replacement and retained files are the tested scope.
Power-loss durability, network filesystems, automatic abandoned-lock recovery,
history compression and a mutable native workspace are not added here. The
source-specific visual identity, comparative cost/time, same-asset renderer
experiment, explicit 1.x migration and coordinated release remain separate
open criteria. Package metadata remains 1.4.2 development; no main merge or
formal release is performed.
