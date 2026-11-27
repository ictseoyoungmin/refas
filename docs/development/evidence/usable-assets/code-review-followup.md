# Independent follow-up review: mesh observations, animation records and consumer playback

Date: 2026-11-22. Baseline: `5fd694ade366bba9f1a977df7ebcae67625e1b9c`.
This follows [the initial review](code-review-initial.md), retaining that report
and its failing original cases unchanged. The reviewer inspected the actual
working files and reran the original synthetic Blender counterexamples against
the corrected helper. Runtime/author code and progress records were not edited
by the reviewer.

## Decision at the reviewed hashes

**The mesh helper and production runtime changes can proceed to the requested
package/integration verification.** R1 and R2 from the initial review are resolved.
A further diagnostic-render timing defect found in this pass was reproduced with
an actual render, reported, fixed by the implementation owner, and independently
retested with the same probe. No unresolved blocking defect was found in the
reviewed action-record reduction, current-frame native/GLB timing changes, or
latest declared node/bone matrix consumer comparison.

This is a code-review conclusion within the tested runtime boundaries. It does
not close asset-specific wearing, clearance, attachment, optimization or visual
acceptance. The planned consumer skin-vertex comparison was not yet present in
these hashes and needs its own review; the present Godot observer verifies
node/bone motion and binding presence, not the resulting skinned vertex positions.

## Reviewed hashes

| File | SHA-256 |
| --- | --- |
| `skills/refas/scripts/production/mesh_audit.py` | `5a095e8aef190a731f9ae785d0dbd25ac7604e73aef92df192922c75013c3257` |
| `skills/refas/scripts/production/blender_worker.py` | `bcbb5b3b8e25787bfb531122f5c32bd8ced2a19431940b495a9d18d29ced00ef` |
| `tests/test_production_mesh_audit.py` | `05ab90b4578d64860ad360b79612b216380f0596eb0387f0eca5fb7285bf9e4e` |
| `tests/test_production_animation.py` | `67fc0878eb3617d1169a036c2a0b8047186336805433003b29f0abd2788e5d90` |
| `tests/test_production_engine_playback.py` | `aabb37b34c04a7683a47f60fa048f98a3a7f6d4b06279fa6abf3ce5a5d080d72` |
| `examples/engine-playback/run.py` | `5f4d9c8d551ec03fc9a077dd42f19f93f784e0a5b9693cf00c0fb5001e954b37` |
| `examples/engine-playback/verify_godot.gd` | `a23c8f68f1dba6b19c5fc98eef55817fc174b60511c832e90154b6ff7df55d10` |

## Actual independent verification

| Execution | Result |
| --- | --- |
| `REFAS_BLENDER_TESTS=1 python3 -B -m unittest discover -s tests -p test_production_mesh_audit.py -v` | 14 passed, 0 failed/skipped; 1.587 s |
| Original initial-review Blender counterexample script | R1/R2 controls and failures now produce the corrected observations below |
| `REFAS_BLENDER_TESTS=1 python3 -B -m unittest discover -s tests -p test_production_animation.py -v` | 3 passed, 0 failed/skipped; 7.153 s on the pre-render-timing-fix worker |
| Exact actual-render timing probe below, before the fix | Confirmed wrong subframe/rate and a 0.5 m difference in the rendered cube position |
| Same render probe after the fix | Source/render frame, rate, subframe and cube position agree |
| `REFAS_GODOT_TESTS=1 python3 -B -m unittest discover -s tests -p test_production_engine_playback.py -v` | Latest bone-basis revision: 4 passed, 0 failed/skipped; 3.215 s |

Blender was 4.3.2; Godot reported 4.7.2 stable. These are measured local
regression executions, not a comparison of modeling workflows. The root owner
added the same render-time condition to the animation test's actual render
callback; the reviewer read that addition and independently reran the original
probe. The complete three-test suite elapsed time above belongs to its earlier
revision, not an unexecuted claim about the newly extended suite.

## R1/R2 closure

The corrected mesh code retains index-connected components and separately
constructs face components through shared edges. Vertex fans, overfull edges,
wire contacts and invalid boundary degree receive explicit observations. This
prevents a singular aggregate component from qualifying as a reliable closed
surface while retaining per-surface orientation information.

The original outward +8 m³ / inward −1 m³ shared-vertex case now reports:

- One index component, two surface components.
- One nonmanifold vertex and one negative closed surface component.
- Aggregate orientation `indeterminate`; surface orientations `positive` and
  `negative`.
- The separate-shell control still detects one inward component without a
  nonmanifold vertex. The wire-connected variant also retains both surfaces
  and the inward observation.

Metric calculations now form double-precision offsets before introducing world
translation. The closest-triangle calculation uses those nearby-frame values,
and an arithmetic interval can make a threshold comparison indeterminate. The
original 1 cm anchor gap is `0.010000000000000009 m` at all four common world
translations, including 1,000,000 m, and exceeds the 1 mm limit every time.
The original 2 cm cube has no spurious degeneracy and retains its volume across
all tested translations. The added threshold test returns `None`/`indeterminate`
when the declared limit falls inside the numerical interval.

The module and guide also now explicitly say that an object-local anchor follows
its object's transform, not mesh deformation. The README import matches the
worker's supported `from mesh_audit import ...` route. These changes resolve the
initial review's documentation ambiguities without turning the helper into a
contact or readiness certification.

## Animation-state reduction and import handling

The new compact action records hash the recorded complete curve state rather
than placing every key array repeatedly in the scene inventory. Code inspection
confirmed that the hash input includes curve path/index, extrapolation, mute,
smoothing, key coordinates/handles/handle modes, interpolation/easing parameters,
sampled points, and supported modifier scalar/array state and envelope control
points. Counts remain inspectable. Actual regressions exercise an interior key,
handle, easing, modifier creation/edit, sampled-point edit, NLA repeat and frame
rate change.

The dense public-CLI case has 21 objects, nine animated channels per object and
121 keys per channel, with NLA action use. Its test checks the full key count,
scene inventory size below 512 KiB, successful revision verification, and native
save/reopen fingerprint preservation. The skinned fixture includes a legitimate
mesh named `Icosphere`, shape keys and a 19.5-frame pose. Actual GLB reimport
retains the real mesh, triangles, skin and morph presence with matching bounds.
Disabling importer-created bone display geometry is preferable to filtering
asset objects by a presumed helper name.

These are fingerprints of the represented state, with the existing numeric
normalization and stated driver/node-group limitations. They do not establish
correct motion at every frame or preserve unrecorded animation systems merely
because the digest matches. The changed limitation text keeps that distinction.

## R3 — Diagnostic scene dropped subframe and frame rate (resolved in this pass)

**Original severity: P2.** Before correction, `render_views` created a fresh scene
and set only `original.frame_current`. A source at frame 10.5 and 30/1.001 fps was
rendered at frame 10 and the new scene's 24 fps default. The resulting record
still attached the source scene fingerprint. A moving cube's world X therefore
changed from 9.5 m to 9.0 m in the actual render callback.

This matters because the new native/GLB path correctly preserves subframes while
visual evidence could still describe a different pose. The original three
animation tests disabled views, so they did not exercise this path.

The owner corrected `render_views` to copy `fps`, `fps_base` and `frame_subframe`
when setting the diagnostic scene time. The exact same reproduction now records
X=9.5 m at frame 10.5 and the original rate. The only insignificant serialization
difference is that inventory `number()` rounds the float32 `fps_base` value to
eight decimal places; the underlying source and review scene values match.

### Preserved before/after observations

```json
{
  "before": {
    "sourceFrame": 10,
    "sourceTiming": {
      "fps": 30,
      "fpsBase": 1.00100005,
      "subframe": 0.5
    },
    "sourceX": 9.5,
    "renderFrame": 10,
    "renderTiming": {
      "fps": 24,
      "fpsBase": 1.0,
      "subframe": 0.0
    },
    "renderX": 9.0,
    "sourceFingerprint": "5dc4e2ef083da37e536458fb386df66193ddc2ad8571d4d78488cd3de0415e7f",
    "renderClaimsSourceFingerprint": "5dc4e2ef083da37e536458fb386df66193ddc2ad8571d4d78488cd3de0415e7f"
  },
  "after": {
    "sourceFrame": 10,
    "sourceTiming": {
      "fps": 30,
      "fpsBase": 1.00100005,
      "subframe": 0.5
    },
    "sourceX": 9.5,
    "renderFrame": 10,
    "renderTiming": {
      "fps": 30,
      "fpsBase": 1.0010000467300415,
      "subframe": 0.5
    },
    "renderX": 9.5,
    "sourceFingerprint": "5dc4e2ef083da37e536458fb386df66193ddc2ad8571d4d78488cd3de0415e7f",
    "renderClaimsSourceFingerprint": "5dc4e2ef083da37e536458fb386df66193ddc2ad8571d4d78488cd3de0415e7f"
  }
}
```

### Exact actual-render reproduction

Save as `/tmp/refas_review_render_time.py`; update only the absolute module path
for another checkout. It creates only synthetic public geometry, renders one
64-pixel frame, and records the timing and object position from `render_pre`.

```bash
blender -b --factory-startup --threads 2 --python-exit-code 1 --python /tmp/refas_review_render_time.py
```

```python
import bpy, importlib.util, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('w','/workspace/scratch/5765cde18054/refas/skills/refas/scripts/production/blender_worker.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.fps=30;scene.render.fps_base=1.001
bpy.ops.mesh.primitive_cube_add(size=2)
obj=bpy.context.object
for frame, x in ((1,0),(21,20)):
    obj.location.x=x;obj.keyframe_insert('location',frame=frame)
for fc in obj.animation_data.action.fcurves:
    for key in fc.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(10,subframe=.5)
source=w.inventory()
result={'sourceFrame':source['frame'],'sourceTiming':source['timing'],'sourceX':obj.matrix_world.translation.x}
def observe_render(render_scene,*args):
    result['renderFrame']=render_scene.frame_current
    result['renderTiming']={'fps':render_scene.render.fps,'fpsBase':render_scene.render.fps_base,'subframe':render_scene.frame_subframe}
    result['renderX']=obj.matrix_world.translation.x
bpy.app.handlers.render_pre.append(observe_render)
out=Path('/tmp/refas_review_render_time');out.mkdir(exist_ok=True)
observations=w.render_views(out,['front'],{'samples':1,'size':64},source)
result['sourceFingerprint']=source['fingerprint'];result['renderClaimsSourceFingerprint']=observations[0]['sourceSceneFingerprint']
Path('/tmp/refas_review_render_time.json').write_text(json.dumps(result,indent=2))
print('REVIEW_RESULT '+json.dumps(result))

```

## Godot observer and its negative controls

The initial arm result was inspected at
`/workspace/scratch/5765cde18054/work/usability/consumer/automail-initial/result.json`: 25 samples, 1,307 recorded
checks, 108 imported meshes/surfaces, 78,778 triangles, and maximum sampled
matrix discrepancy approximately `1.073e-6`, below the declared `2e-5` tolerance.
The result is explicitly headless GLTFDocument import and AnimationPlayer
execution; it contains no GPU image, collision or frame-time claim.

The first independent execution of the newly added skeletal regression caught
the known bone-basis counterexample: all four native bone matrices differed by
1.0 under the original shared object conversion. The owner separately retained
that failure under `consumer/bone-basis-counterexample/`. The current runner
separates object `C*M*C^-1` conversion from Blender 4.3.2 joint `C*M` conversion.
The installed exporter source was inspected for the extra bone axis basis
transformation, and the actual corrected four-test run independently passed:

- Moving skin/bone fixture matches native expectations and has one skin binding.
- A deliberately altered native matrix is rejected.
- A stationary named clip is rejected by the observed-movement check.
- A missing clip is rejected.

The script checks every declared sample/probe, rejects absent or ambiguous node
names, verifies the named animation, and requires observed movement. Its
triangle and binding checks are appropriately separate from matrix comparisons.
The current acceptance is limited to those explicit probes. In particular,
matching skeleton matrices alone does not verify exported weights, inverse bind
matrices, or the resulting clothing surface. That is the concrete purpose of
the owner's next CPU skin-vertex comparison; its implementation and positive/
negative controls were outside this reviewed snapshot.

## Handoff

Proceed with the runtime/mesh-helper package verification and the independent
visual review using the reviewed corrected files. Preserve the initial failing
review and the before/after render-time reproduction as development evidence.
Re-review the consumer helper when skin-vertex evaluation lands. No new
implementation or author-file edits were made by this reviewer.
