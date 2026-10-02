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
`irregular-nonmechanical`. The current deterministic AD05 contract worker uses
a common source fixture, so these timings are an operational-cost proxy, not a
claim that one reference class is faster or harder than another. The real
cross-model/reference-class comparison belongs to #250.

`refas.first-multiview-observation/v1` is deliberately observation-only. It
cannot satisfy a visual review, capability closure, quality gate, or
certificate, and there is no pass/fail threshold attached to the timing.
