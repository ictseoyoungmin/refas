# Independent PBR renderer

## Public boundary

Run the portable `render` gate first. Then run `render-pbr` or an external Blender, Three.js, Filament, glTF Sample Viewer, or VTK worker and normalize its outputs as `refas.pbr-render-report/v1`. The renderer is a separate process; RefAs owns the report, digest verification, resource guard, and closure decision, not the external engine.

The bundled fallback implements deterministic Cook–Torrance metallic-roughness shading with a fixed three-directional-light rig. It supports `base-color-factor`, `metallic-factor`, and `roughness-factor`. It does not claim texture, normal-map, clearcoat, transmission, or image-based-lighting support.

## Reproducibility and safety

- The exact GLB and canonical-frame digests bind every run.
- Lighting, color pipeline, renderer version/backend, feature support, and every output digest are recorded.
- Identical declared inputs must produce identical output digests for the bundled backend.
- Geometry decode and full-frame PBR scratch are checked against `--max-working-mb` before rasterization.
- An internal deadline and parent-process timeout stop stalled renders.
- Failed preflight or timeout runs do not publish a partial report.
- There is no implicit triangle-count ceiling; memory and time are independent safety limits.

## License boundary

RefAs does not bundle, link, or redistribute Blender, Three.js, Filament, glTF Sample Viewer, or VTK. Install or operate those renderers separately and communicate through CLI/files or a job API. If a renderer binary or container is redistributed, its own license and notice obligations belong to that distribution.

## Closure capsule

- Owner: `rendering`
- Input: embedded GLB, canonical object frame, fixed renderer settings
- Output: eight PNG views, review board, `refas.pbr-render-report/v1`
- Invariants: independent process, exact digests, explicit feature coverage, no partial publication
- Evidence: `examples/material-fixture/`
- Reopen when: shading equations, light rig, color transform, camera convention, supported-feature declaration, output determinism, or memory/timeout behavior changes
