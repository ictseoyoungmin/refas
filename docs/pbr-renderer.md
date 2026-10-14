# Independent PBR renderer

## Public boundary

Run the portable `render` gate first. Then run `render-pbr` or an external Blender, Three.js, Filament, glTF Sample Viewer, or VTK worker and normalize its outputs as `refas.pbr-render-report/v1`. The renderer is a separate process; RefAs owns the report, digest verification, resource guard, and closure decision, not the external engine.

The bundled fallback implements deterministic Cook–Torrance metallic-roughness shading with a fixed three-directional-light rig. It supports `base-color-factor`, embedded PNG `base-color-texture` with `texcoord-0`, `metallic-factor`, and `roughness-factor` in beauty mode. It does not claim normal-map, clearcoat, transmission, or image-based-lighting support. Neutral-clay intentionally suppresses textures and cannot satisfy appearance evidence.

## Canonical neutral-clay presentation

Use `refas render-pbr --neutral-clay` for R04 early shape resemblance. This mode is implemented by the bundled independent renderer and overrides every primitive's beauty/albedo material with the runtime-owned `refas-neutral-clay-v1` material preset while keeping normal and object-ID outputs.

The registered `frame.hero` camera (position, target, up, fovY) is used for the PBR hero projection, just as in the portable renderer; missing hero falls back to the canonical diagnostic direction. Side, top and other standard views remain object-frame diagnostics, and **cannot override the source-selected registered hero**. The report records `presentation.mode: neutral-clay`, the canonical preset ID/digest, bundled renderer profile, fixed neutral-clay lighting digest, canonical frame digest, exact candidate digest, and all standard output digests. The report's `claimScope` is `shape-resemblance-only`, so it cannot substitute for normal visual-fidelity PBR evidence.

Do not reproduce the preset by hand or pass custom material values while claiming canonical clay. The runtime validates the exact preset, renderer identity, lighting rig, color pipeline, and required views.

## Reproducibility and safety

- The exact GLB and canonical-frame digests bind every run.
- Lighting, color pipeline, renderer version/backend, feature support, and every output digest are recorded.
- Identical declared inputs must produce identical output digests for the bundled backend.
- Geometry decode and conservative tiled PBR scratch are checked against `--max-working-mb` before rasterization. The rasterizer processes `--tile-size 128` screen tiles by default and shades depth-visible pixels only; peak memory no longer depends on the entire projected bounding rectangle of a giant triangle.
- An internal deadline and parent-process timeout stop stalled renders.
- Failed preflight or timeout runs do not publish a partial report. A failed render should be recorded as a blocked/failed attempt, never interpreted as a source or material PASS.
- A representative nondegenerate geometry regression checks multiple tile sizes, pixel-digest parity, restricted-memory rejection, and timeout rejection; reported peak times remain environment-specific.
- There is no implicit triangle-count ceiling; memory and time are independent safety limits.

## Avoid duplicating human-facing review boards

The **render evidence is not the review board**. Both the portable geometry pass and bundled PBR renderer produce SHA-bound individual frames and reports. Rendering eight neutral-clay views remains mandatory under the frozen R04/final resemblance contract. A PBR appearance pass should retain the required material and view evidence, not masquerade as neutral clay.

When a portable multiview board has already been generated and separately retained, pass `--no-board` to the PBR CLI if a second montage is unnecessary. The PBR report and all eight digested frames still publish, but `pbr-review-board.png` is omitted and the informational CLI `board` field is null. Omit `--no-board` when the PBR board is the useful human-facing presentation. This presentation-only switch does not reduce any visual review, R04, certification or strict source-bound handoff requirements.

```bash
node skills/refas/scripts/refas.mjs render --glb candidate.glb --out portable --frame frame.json
node skills/refas/scripts/refas.mjs render-pbr --glb candidate.glb --out pbr --frame frame.json --no-board --tile-size 128
```

For large real assets, record elapsed time, peak RSS, actual triangle count, frame size, render backend and any timeout/memory failure. Select an external independent PBR-capable backend for final material features unsupported by the bundled baseline. Never relabel evidence produced by a different renderer as the canonical bundled neutral-clay preset.

## Iterative previews vs authoritative closure

Do not pay for an eight-view full PBR report after each small geometry edit.
The explicit `preview-pbr` CLI renders only selected views (default `hero,side`)
in a dedicated output directory. `--reuse` verifies the exact candidate GLB,
canonical frame digest, output pixel hashes, lighting/exposure and view set
before reusing an existing preview. Changed source bytes, camera, settings or
tampered/missing PNGs trigger an actual rerender. A preview never produces
`render-report.json` and cannot be used as `refas.pbr-render-report/v1`
or satisfy a neutral-clay barrier, appearance, source resemblance or final
certification; its manifest is `refas.render-preview/v1`,
`claimScope: preview-only`. Do not reuse a canonical evidence directory for preview.

```bash
node skills/refas/scripts/refas.mjs preview-pbr --glb candidate.glb --frame frame.json --out previews/current --views hero,side --reuse --size 160
# When a candidate is visually ready, perform the real full evidence runs:
node skills/refas/scripts/refas.mjs render --glb candidate.glb --frame frame.json --out renders/portable
node skills/refas/scripts/refas.mjs render-pbr --glb candidate.glb --frame frame.json --out renders/clay --neutral-clay --no-board
node skills/refas/scripts/refas.mjs render-pbr --glb candidate.glb --frame frame.json --out renders/pbr --no-board
```

## One combined review board

After canonical evidence has rendered, compose one presentation-only board with
SHA-256 verification of **every included PNG** against its original report.
The portable, ordinary PBR and optional clay reports must bind exactly the same
asset SHA-256 and canonical frame digest. Preview manifests cannot enter.

```bash
node skills/refas/scripts/refas.mjs review-board --portable renders/portable --pbr renders/pbr --clay renders/clay --reference source.png --out reviews/combined.png
```

The companion `combined.json` has `claimScope: presentation-only` and the
included cells and image hashes; it is a viewer aid, not a certificate or a
replacement for any of the original eight-view reports or source-bound
comparisons. Source photo inclusion is visual only, never independent
source-identity attestation. Keep individual canonical frame/report outputs.
Do not use `preview-pbr` assets as `--pbr` or `--clay` inputs.

## Measured rendering cost and failure reasons

`npm run benchmark:render-pbr` builds a nondegenerate detailed GLB fixture
and captures full eight-view, iterative two-view and identical-input reuse
runs with process wall time and Linux `/proc` peak RSS when available.
For an **actual production asset**, use:

```bash
node skills/refas/scripts/measure_render_pbr.mjs --glb work/model.glb --frame work/canonical-frame.json --size 160 --timeout-seconds 180 --max-working-mb 512 --out work/reports/renderer-workload.json
```

Report schema `refas.renderer-workload-measurement/v1` records exact input GLB
SHA-256, measured wall milliseconds, RSS KiB (or null when unavailable),
backend, frame size, and typed failure category. The generated fixture is not
a real reference reconstruction: its results must not be promoted to
production-asset speedup or reliability claims. Render time and physical
quality are separate; `measurement-only` is never closure evidence.

## License boundary

RefAs does not bundle, link, or redistribute Blender, Three.js, Filament, glTF Sample Viewer, or VTK. Install or operate those renderers separately and communicate through CLI/files or a job API. If a renderer binary or container is redistributed, its own license and notice obligations belong to that distribution.

## Closure capsule

- Owner: `rendering`
- Input: embedded GLB, canonical object frame, fixed renderer settings
- Output: eight SHA-bound PNG views and `refas.pbr-render-report/v1`; an optional presentation board (the neutral-clay gate still needs every canonical view)
- Invariants: independent process, exact digests, explicit feature coverage, no partial publication
- Evidence: `examples/material-fixture/`
- Reopen when: shading equations, light rig, color transform, camera convention, supported-feature declaration, output determinism, or memory/timeout behavior changes
