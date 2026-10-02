# Independent-reference benchmark matrix

The harness keeps raw references outside the repository and binds each source
path to its SHA-256 digest:

```bash
node examples/benchmark-matrix/run.mjs \
  --articulated /path/to/thinker.png \
  --mechanical /path/to/wing-cover.png \
  --irregular /path/to/lantern.png
```

The output matrix records the three materially different classes. To attach
actual run evidence, provide the project roots (and optional baseline assets):

```bash
node examples/benchmark-matrix/run.mjs \
  --articulated /path/to/thinker.png \
  --mechanical /path/to/wing-cover.png \
  --irregular /path/to/lantern.png \
  --articulated-project examples/articulated-figure/output/project \
  --articulated-baseline /path/to/baseline.glb \
  --mechanical-project examples/wing-cover/output/project \
  --irregular-project examples/material-fixture/output
```

Each attached result binds baseline/final GLBs, actual-render comparison
boards, diagnostics, fitting ledgers, typed findings, rollback evidence, and
visual review by digest. A certificate is retained only when the project
provides an explicitly passing visual review. A reusable capability is closed
only after it demonstrates value on at least two classes; otherwise it is
labelled a domain adapter.

## Time-to-first-multiview observation

Issue #249 adds a separate operational observation. Run:

```bash
npm run benchmark:first-multiview
```

The measurement harness runs the existing isolated full fresh worker three
times and watches for the first canonical neutral-clay render report. It
records:

- `firstNeutralClayMultiviewMs` from a monotonic wall clock;
- the unique public interface operation IDs used before the first
  `createPbrRenderReport` invocation;
- turns and tokens only when the caller actually supplies those counters;
- the digest-bound neutral-clay report and rendered view IDs.

The three category labels exercise benchmark routing for
`articulated-manufactured-organic`, `hard-surface-mechanical`, and
`irregular-nonmechanical`. The deterministic AD05 contract worker uses a
common source fixture, so these timings are an operational-cost proxy, not a
claim that one reference class is faster or harder than another.

`refas.first-multiview-observation/v1` is deliberately observation-only. It
cannot satisfy a visual review, capability closure, quality gate, or
certificate, and there is no pass/fail threshold attached to the timing.

## Cross-model worker matrix

Issue #250 uses `run-workers.mjs` to run a fixed independent-reference × worker
model × prompt-variant matrix. A manifest must name at least three references
from three different benchmark classes, at least two distinct provider/model
identities, and at least two prompt variants.

The measured RefAs checkout is **commit pinned**. `expectedRefasCommit` is
required and the runner refuses to start if `git rev-parse HEAD` does not match
it. This allows the same harness to measure the released v1.1.1 baseline and a
later v1.2.0 candidate without silently changing the skill implementation.

Example manifest shape:

```json
{
  "refasRoot": "/path/to/refas-v1.1.1",
  "expectedRefasCommit": "c9fed91e26aa6b26744e6c471732ed308e7a2247",
  "commonPrompt": "prompts/common.md",
  "references": [
    {"id":"articulated","category":"articulated-manufactured-organic","path":"/path/to/articulated.png","sha256":"<64 hex>"},
    {"id":"mechanical","category":"hard-surface-mechanical","path":"/path/to/mechanical.png","sha256":"<64 hex>"},
    {"id":"irregular","category":"irregular-nonmechanical","path":"/path/to/irregular.png","sha256":"<64 hex>"}
  ],
  "prompts": [
    {"id":"plain","path":"prompts/plain.md"},
    {"id":"guided","path":"prompts/guided.md"}
  ],
  "workers": [
    {"id":"worker-a","provider":"provider-a","model":"<pinned model>","executable":"<agent cli>","args":["..."],"timeoutSeconds":1800},
    {"id":"worker-b","provider":"provider-b","model":"<pinned model>","executable":"<agent cli>","args":["..."],"timeoutSeconds":1800}
  ]
}
```

Preflight without model spend:

```bash
node examples/benchmark-matrix/run-workers.mjs \
  --manifest /path/to/manifest.json \
  --out /new/output/directory \
  --dry-run true
```

A full execution writes `plan.json`, a fresh directory for each cell, and
`matrix.json` after every completed cell. `--only REFERENCE--WORKER--PROMPT`
exists for smoke testing; such a report has `fullMatrix:false` even when that
single cell completed successfully.

Every worker writes `outcome.json` containing only structured outcomes:
`r04`, `vc03`, `vc04`, `certification`, `reopenCount`,
`firstMultiviewSeconds`, and digest-bound evidence paths. Score, rating,
ranking, winner, or aggregate fields are rejected. The runner also records
worker logs and wall-clock elapsed time, but it never converts any field into
an overall score or selected winner.

`complete:true` means only that the expected worker processes returned usable
structured outcomes with readable evidence. It **does not** mean the
reconstruction passed visual review, RefAs certification, or human inspection.
Actual render/evidence review remains required before a matrix result is used
as acceptance evidence.
