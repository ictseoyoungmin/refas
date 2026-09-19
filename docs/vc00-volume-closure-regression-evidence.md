# VC00 — Volume-closure regression evidence lock

Status: implementation candidate on `test/vc00-volume-closure-regression-evidence`.

Baseline: `rc/post-1.1@4522406c8abaef12314f6ed3469a209cab8b53be`.

Primary planning source:
[RefAs · Planar Collapse Dogfood + API Discovery + Volume Closure Plan · 2026-09-18](https://app.notion.com/p/3dfc6a3b5bf181e09af5db2d6a131dca).

## Purpose

VC00 does not decide whether arbitrary geometry has collapsed. It freezes the
evidence cases that later VC01–VC09 work must separate correctly.

| Fixture | Provenance | Future expectation | Locked planar-collapse oracle |
|---|---|---|---|
| `gpt-planar-bird-surrogate` | historical observation + deterministic surrogate | volumetric | MUST_FAIL |
| `claude-volumetric-bird-surrogate` | historical observation + deterministic surrogate | volumetric | MUST_NOT_FAIL |
| `intentionally-thin-panel` | deterministic synthetic control | intentionally-planar | MUST_NOT_FAIL; thinness MUST_PASS |
| `synthetic-degenerate-volume` | deterministic synthetic negative | volumetric | MUST_FAIL |

## Historical evidence boundary

The planning record preserves two materially different fresh-worker outcomes.

The GPT run matched the source-facing view reasonably but collapsed strongly in
SIDE/TOP/GRAZING, behaving like a billboard or thin 2.5D solution for major
masses. The same historical run nevertheless reached `certified / DONE`.

The Claude run retained body/head volume, instantiated an unseen far-side wing
as inferred geometry, and retained body mass, wing separation, underside
volume, and leg lateral separation in non-source views.

At VC00 implementation time the exact historical GPT and Claude GLB bytes were
not available in the current repository or Library evidence surface. Therefore
the repository deliberately records both bird fixtures as
`historical-surrogate` with `exactHistoricalArtifactAvailable: false`.
Their generated GLBs preserve the regression pattern only; they are not
represented as recovered historical artifacts.

## Deterministic surrogate geometry

`tests/fixtures/volume-closure-regression-fixtures.mjs` constructs every case
using RefAs public geometry/GLB APIs and produces deterministic GLB bytes.

The bird surrogates share a comparable front-facing footprint. The GPT
surrogate keeps all major masses close to one depth plane. The Claude surrogate
uses real depth for torso/head, separates near/far wings, and laterally
separates the legs.

The two synthetic controls deliberately prevent an invalid shortcut:

- the intentionally thin panel is **thinner** than the GPT planar-bird
  surrogate, yet must not be classified as planar collapse;
- the synthetic degenerate volume is also extremely shallow but carries a
  future volumetric expectation and must fail.

These dimensions are fixture-construction facts. They are not thresholds and
must not be copied into VC03 as production classification rules.

## Machine-readable authority

The oracle manifest is:

`tests/fixtures/volume-closure-regression-manifest.json`

It is regression authority only. The future runtime must derive its result from
candidate-bound spatial evidence plus the appropriate pre-bound spatial
expectation. It must not read or infer the expected verdict from this test
manifest.

## Verification

`tests/volume-closure-regression.test.mjs` locks:

- the exact four-case matrix;
- honest provenance for unavailable historical bytes;
- valid, watertight generated fixture meshes;
- byte-deterministic GLBs;
- distinct fixture digests;
- the anti-threshold control where legitimate thin geometry is thinner than
  the planar historical surrogate but has the opposite oracle.

`examples/volume-closure-regression/run.mjs` provides a standalone harness and
can optionally materialize the generated GLBs for later VC slices.

## Handoff to VC01

VC01 may consume the deterministic GLBs to develop candidate-bound spatial
measurements such as canonical XYZ extent, projected support, cross-section
occupancy, front/back distribution, and local thickness/depth distributions.

VC01 must remain observational: it may emit geometry evidence, but it must not
self-declare `PASS`, read the VC00 oracle to choose a verdict, or introduce a
global depth/width cutoff.
