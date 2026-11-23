# R00/R01 — Architecture reopen and metric authority

Baseline: `rc/post-1.1@ca95c63a6f02042473159f309ae796724e8bbc4b`.

## R00: authority reset

RefAs 1.1 orchestration is REOPENED. AD00–AD06 and VC00 remain closed regression evidence, but their closure no longer means that the correspondence-first workflow is sufficient for reference reconstruction.

The rebuilt correctness model has independent obligations:

1. **correspondence** — registered source/model relationships;
2. **resemblance** — construction and perceptual identity;
3. **spatial coherence** — a 3D candidate must remain coherent outside the hero projection;
4. **physical readiness** — required only when the asset makes physical/runtime claims.

A passing correspondence ledger cannot substitute for resemblance.

## R01: metric/objective authority

Every metric consumer has a use: objective, ranking, correspondence gate, diagnostic, resemblance, or certification. Metrics may not silently cross those boundaries.

### IoU policy

Single-view IoU is retired from RefAs decision-making.

- fewer than two independently source-backed registered views: **FORBIDDEN**;
- two or more independently source-backed registered views of the same candidate: **CORRESPONDENCE_AID** only;
- IoU is never a parameter-fit objective;
- IoU never ranks candidates;
- IoU never proves resemblance;
- IoU never certifies a result by itself.

Legacy single-view reports may temporarily retain serialized IoU fields for compatibility, but R01 removes them from active ranking, finding, repair, and contradiction paths. Later migration slices may remove the legacy fields entirely.

### Close conditions

R01 closes only when:

- the generic parameter fitter rejects IoU and IoU-derived objectives;
- discrepancy ranking has no IoU default and rejects IoU metrics;
- single-view registered-comparison contradiction routing does not consume IoU;
- projection finding/repair paths do not consume negative-space or segment IoU;
- tests demonstrate that multiview IoU is correspondence-only and still cannot become an objective/ranking metric;
- AD00–AD06 and VC00 regressions continue to pass.
