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
