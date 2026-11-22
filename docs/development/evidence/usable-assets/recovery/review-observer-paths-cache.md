# Godot observer: explicit node paths and bounded association caching

The real jacket pipeline imports two different skeletons named `Skeleton3D`.
The observer correctly rejected that ambiguous bare name, but lacked an explicit
path selector. The same retained pipeline asset also exceeded the runner's
120-second timeout while repeatedly recomputing complete skin surfaces for 30
rest-position probes.

This patch is confined to the repository's engine-playback example, its README
and actual-consumer regressions. It does not modify the installed core skill,
exported assets, imported weights or acceptance tolerances.

## Exact behavior changes

The observer indexes exact paths relative to the imported scene and records each
skeleton's path in `geometry.skeletons`. A selector such as
`./Rig/Skeleton3D` chooses that node directly. A bare `Skeleton3D` still fails
when multiple nodes have that name. An explicit `./` prefix also distinguishes
a direct-child path from a bare-name search. Absolute SceneTree paths and
traversal aliases are not accepted by the exact imported-scene path table.

Rest-association positions and their source surface arrays are now calculated
once per mesh instance/surface within a sample. The cache is cleared after every
animation seek, together with the existing morph snapshot cache. Successful
per-label vertex indices continue to be reused, and an initial failed match
continues to fail instead of being silently retried. A label introduced later
still associates at that sample's current pose, as before.

Actual deformation is evaluated from the current pose and raw imported weights
for every sampled probe. Neither matrix thresholds, skin-position thresholds,
rest-match distance nor weight normalization behavior changed.

Changed code paths:

- `examples/engine-playback/verify_godot.gd`
- `examples/engine-playback/README.md`
- `tests/test_production_engine_playback.py`
- New `tests/fixtures/production_two_skeletons.py`

## Actual regression evidence

The capability-local Blender/Godot suite passed **13 tests with zero failures
and zero skipped tests**, in 7.576 seconds. The new fixture has two independent
armatures under distinct scene parents, each with its own moving skinned mesh
and independently recorded Blender expectations.

The regressions establish that:

- Both imported skeletons actually have the same bare name; ambiguous selection
  fails all ten bone probes, while reported qualified paths verify both rigs
  and all 20 skin probes.
- A new vertex label introduced during motion associates using the current
  sample, exposing stale cross-sample position caching if introduced.
- An invalid initial rest position remains failed across later samples, even
  if later inputs happen to provide an existing vertex position.
- Existing wrong-matrix, incorrect-deformation, morph/skin, missing-clip and
  stationary-clip controls still fail appropriately. The transformed weighted
  fixture still exposes its raw quantized-weight discrepancy, and deliberately
  corrupted GLB weights still fail the explicit 50 µm vertex budget.

Root separately runs the full Production suite with all four changed source
files captured in its byte-hash gate. This review did not duplicate that full
run or change observer source after the root gate started.

## One timed real pipeline execution

The actual retained jacket pipeline produced these paths:

| Rig | Exact imported-scene path | Bones |
| --- | --- | ---: |
| Original avatar rig | `./Rig/Skeleton3D` | 235 |
| Jacket hardware rig | `./JacketHardwareRig/Skeleton3D` | 447 |

The five-frame independent native inspection was copied with only its 25 bone
selectors changed from `Skeleton3D` to `./Rig/Skeleton3D`. No native matrices,
rest positions or current skin positions were altered. The derivation hashes
are preserved.

The observer completed this one 30-points-per-frame run in **24.354 seconds**,
where the previous unqualified/repeated-association run timed out after 120
seconds. Import counts remain 126 meshes, 178 surfaces, 838,379 triangles and
123 skinned meshes.

- All **25 bone matrices** now resolve and pass; maximum matrix-component error
  is 5.960e-7 against the unchanged 2e-5 threshold.
- All **150 skin probes** obtain valid associations. Maximum rest-association
  error is 0.510 µm against the unchanged 10 µm threshold.
- The execution correctly remains **failed**: 50 actual skin-position checks
  exceed the unchanged 20 µm budget. Maximum measured error is **65.733 µm**.

The cache therefore removes repeated work without converting the retained
negative asset into a pass or concealing its strict skin-position differences.
Root is diagnosing those differences separately from raw exported weights and
Godot's imported representation. No threshold was increased for this run.

Public numerical evidence and command/source hashes are retained under
`checks/observer-paths-cache/`. Full results remain under
`work/garment/review-consumer-qualified-cache/`; the qualified input is
`work/garment/pipeline-probe/qualified-native-consumer-inspection.json`. No avatar
geometry or appearance is published by this review. The underlying garment
geometry is still a failed intermediate, and this observer repair grants no
final garment acceptance.
