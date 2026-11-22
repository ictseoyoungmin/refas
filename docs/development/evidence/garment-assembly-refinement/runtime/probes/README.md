# Production worker scope audit probes

These are small in-memory Blender 4.3.2 probes made during the 2026-11-22
RefAs continuation. They do not alter author assets, save native files, export
GLB, or render images. The parent agent owns the actual worker regression tests.

## Frozen baseline evidence

Baseline commit: `94930b3d3dade455336ce6240805ea96d7a13e53`.

The baseline worker and its review validator were read with `git show` into
`baseline-94930b3d/production`. No repository files were modified.

Baseline worker SHA-256:
`a3d0c85e8a733487605c20bac5f41d1b06a15ead07dda4c7bca12caa231f3e1a`.

- `probe_worker_scope.py`: the original probe statements for unrealized
  Geometry Nodes instances and render-only bevel settings.
- `probe_subdivision_levels.py`: adjacent subdivision-level probe.
- `baseline-probe-results.json`: exact executed argv, timestamps, durations,
  return codes, script/worker hashes, output paths and parsed observations.
- `baseline-gn-bevel.stdout.log` / `.stderr.log`: baseline invocation output.
- `baseline-subdivision.stdout.log` / `.stderr.log`: baseline invocation output.

The baseline wrapper preloads the frozen `blender_worker` module before
running each probe. The probe's original import statement therefore reuses
that cached module even though the live repository worker changed during the
audit. Both frozen-baseline commands exited 0.

Observed baseline results:

| Case | Accepted by existing guards | Inventoried geometry | Additional evidence |
| --- | --- | --- | --- |
| Base cube joined with eight unrealized GN instances | Yes | 8 vertices, 12 triangles | Dependency graph reports 8 instances; object.instance_type is NONE |
| Bevel with viewport disabled and render enabled | Yes | 12 triangles | show_viewport=false; show_render=true |
| Enabled SUBSURF with levels=1 and render_levels=2 | Yes | 48 triangles | Evaluating at subdivision level 2 yields 192 triangles |

The subdivision probe changes the viewport level in memory to measure the
geometry at the render subdivision amount. It is not an actual rendering
measurement. The worker's export uses the viewport dependency graph, while
its diagnostic render invokes Cycles with render settings.

## Concurrent live-worker repeat

`probe-results.json`, `gn-bevel.*.log` and `subdivision.*.log` retain an earlier
repeat against the live worker during the parent's fix. By that moment the
evaluated-instance guard had landed: GN is correctly rejected with the
InstanceCarrier name and Realize Instances guidance. Subdivision was still
accepted by that probe. These logs are an intermediate observation, not final
patched-worker regression acceptance.

## Proposed regression boundary

Reject evaluated instances until explicitly realized, and reject differing
viewport/render enablement or active subdivision levels before both edit
publication and inspection. A realized GN case and matching modifier case
should remain accepted. Exercise edit and inspect, preserve source bytes, and
assert no accepted GLB or PNG is emitted for the unsupported case.

The parent's current small diff implements those checks in the two execution
paths, and adds actual-Blender regression tests for GN rejection/recovery and
render-only, viewport-only and different-subdivision rejection. Read-only
review found no blocking issue in that diff. Test execution is owned by the
parent and must be reported from its actual results.
