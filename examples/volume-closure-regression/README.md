# VC00 volume-closure regression fixtures

This harness freezes the four cases required before RefAs implements spatial
closure evidence or planar-collapse classification.

Run the in-memory integrity harness:

```bash
node examples/volume-closure-regression/run.mjs
```

Materialize deterministic GLBs when a later slice needs concrete inputs:

```bash
node examples/volume-closure-regression/run.mjs --out-dir /tmp/refas-vc00
```

The two bird cases are deterministic **surrogates** for historical dogfood
observations. The original GPT/Claude GLB bytes were not available in the
current repository/Library evidence surface when VC00 was opened, so this
fixture set does not claim byte- or geometry-level reproduction of those runs.

The manifest is an oracle for future VC01-VC09 regressions, not a production
classifier. In particular, the intentionally thin control is deliberately
thinner than the planar-bird surrogate while its expected outcome is the
opposite. A global depth/width cutoff therefore cannot satisfy the locked
matrix.
