# Consistent production geometry scope

The continuation exposed two gaps in the current alpha's stated contract:
geometry can appear in a native diagnostic render without belonging to the
mesh snapshot used for inventory and GLB export.

## Reproductions at the frozen baseline

The independent audit ran Blender 4.3.2 against the worker at `94930b3d`.
Its [probe record](probes/baseline-probe-results.json) preserves exact commands,
timestamps, script hashes and output. These small probes are in-memory checks,
not rendered visual evidence.

| Fixture | Accepted baseline observation | Missing distinction |
| --- | --- | --- |
| Geometry Nodes base mesh plus eight instances | One scene object, `instance_type=NONE`, 12 inventoried triangles and eight dependency-graph instances | Checking object instancing alone misses evaluated instances. |
| Render-only Bevel | Viewport disabled, render enabled, 12 inventoried triangles | Inventory/export and Cycles evaluate different modifier settings. |
| Subdivision level 1 / render level 2 | 48 inventoried triangles; 192 after evaluating the render level | Matching enabled flags alone does not align subdivision geometry. |

The complete worker regression then exercised both `edit` and `inspect`.
At the frozen baseline, both new test methods fail with **eight rejection
subcases incorrectly succeeding**. See [before-regression.log](before-regression.log).
The candidate passes both methods, including a positive recovery that realizes
the eight instances and retains all **108 triangles** through GLB export and
independent import: [after-regression.log](after-regression.log).

## Bounded repair

Before creating native/export/render outputs, the worker now rejects remaining
dependency-graph instances, including Geometry Nodes instances. It also
rejects differing viewport/render modifier visibility and differing enabled
`SUBSURF`/`MULTIRES` levels. Errors identify the responsible object and explain
how to make the intended geometry explicit. The worker does not silently alter
the user's modifier settings.

The same guards apply to inspection and editing. Tests verify that rejected
inputs keep their original bytes and produce no successful GLB or PNG. Existing
matching static modifiers and articulated hierarchy tests remain positive
coverage. A separate read-only code review found no blocking issue in this
small worker/test diff.

The retained [full production log](../checks/production.log) runs **37 tests:
23 project/CLI and 14 actual-Blender tests, no skips**. Its [execution record](../checks/production.json)
binds the final worker/test hashes. The focused after-log precedes a wording-only
update to the limitations strings; the full suite tests those final strings too.

These guards do not certify every procedural node, driver, shader or animated
evaluation path. The alpha's other explicit limitations remain in force.
Technical scope consistency is separate from either model's visual quality.
