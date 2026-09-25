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

## Cross-model worker measurements

`run-workers.mjs` runs a fixed reference × worker × prompt matrix. A manifest
names at least three independent source files (with SHA-256 and distinct
classes), two distinct worker models, and a shared task prompt plus two distinct variant prompts. Every cell receives a fresh output directory.
Command arguments support `{reference}`, `{output}`, `{model}`, `{prompt}` (path
to the rendered prompt file), and `{promptText}`. Commands are spawned directly,
without a shell. Set a timeout for each worker.

```json
{
  "refasRoot": "/path/to/v1.1.1-checkout",
  "commonPrompt": "prompts/common.md",
  "references": [
    {"id":"articulated","category":"articulated-manufactured-organic","path":"/path/to/thinker.png","sha256":"<64 hex>"},
    {"id":"mechanical","category":"hard-surface-mechanical","path":"/path/to/raven.png","sha256":"<64 hex>"},
    {"id":"irregular","category":"irregular-nonmechanical","path":"/path/to/lantern.png","sha256":"<64 hex>"}
  ],
  "prompts": [{"id":"plain","path":"plain.txt"},{"id":"guided","path":"guided.txt"}],
  "workers": [
    {"id":"codex","model":"<pinned model>","executable":"codex","args":["exec","-m","{model}","--image","{reference}","{promptText}"],"timeoutSeconds":1800},
    {"id":"claude","model":"<pinned model>","executable":"claude","args":["-p","--model","{model}","{promptText}"],"timeoutSeconds":1800}
  ]
}
```

Point `refasRoot` to the exact checkout being measured; the runner records its
HEAD commit and passes its path to each worker. Use `--dry-run true` to verify all source digests and write `plan.json` before
spending model time. Omit it to execute the cells and write `matrix.json` after
each one. Outputs include the RefAs commit, manifest and prompt digests, worker
log digests, elapsed time, and evidence file digests. `complete: true` means
all worker processes returned zero and supplied well-formed, file-backed
outcomes; it does not pass the visual review or RefAs certification gate. A worker should write
`outcome.json` in its output directory with `r04`, `vc03`, `vc04`,
`certification`, `reopenCount`, `firstMultiviewSeconds`, and an `evidence` array
of relative file paths. The runner records incomplete cells rather than
inventing a verdict.

These outcomes are **worker-reported observations**. Inspect the referenced
RefAs artifacts and actual renders before using them as acceptance evidence.
The benchmark does not issue a RefAs certificate or combine outcomes into a
resemblance score. A source manifest without its original image cannot be run
as an independent reference, even if registered crops remain in a bundle.
