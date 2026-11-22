# Exported animation in Godot

This repository-only observer opens the delivered GLB with Godot's
`GLTFDocument`, generates a real scene, and evaluates its named animation with
`AnimationPlayer`. It compares actual scene-node or skeleton-bone world matrices
at explicitly recorded times against independent native Blender observations.
This is a headless consumer test, not a GPU appearance, collision, or FPS claim.

```bash
python3 examples/engine-playback/run.py \
  --asset /absolute/path/asset.glb \
  --inspection /absolute/path/native-inspection.json \
  --clip AURIX_ReachGrip_Return \
  --out /absolute/new/consumer-evidence \
  --expected-triangles 78778
```

Use the selected asset's actual triangle count, clip name and inspection file;
the example values belong to an intermediate arm candidate. The output directory
must be new. The runner records the configuration, source inspection SHA256,
actual command, elapsed time, stdout/stderr and complete Godot result. A failure
exits nonzero and remains evidence.

## Native observation format

The inspection document contains `consumer_samples` with `fps`, `fps_base`,
`matrix_order: "row-major, Blender Z-up world space"` and at least three samples.
Each sample has `seconds` and a `nodes` object mapping node selectors to
row-major 16-number or 4-by-4 world matrices. Bone probes use an optional `bones`
array with `node` (the imported Skeleton3D selector), `bone`, and native world
`matrix`. A bare name must identify exactly one node in the imported scene;
ambiguous names remain errors. An exact scene-relative path can disambiguate
nodes, for example `./CharacterRig/Skeleton3D` and
`./HardwareRig/Skeleton3D`. The geometry result records each skeleton's `path`;
use that reported path rather than assuming an import hierarchy. Paths apply to
`nodes` keys, bone `node` selectors and skin-vertex `node` selectors. Prefix `./`
when selecting a direct child explicitly. Lookup stays within the imported
scene; absolute SceneTree paths and traversal aliases are not accepted.

The runner changes basis from Blender Z-up to glTF/Godot `(X,Z,-Y)` with matrix
`C`. Object worlds use `C*M*C^-1`; bone worlds use `C*M`, matching the extra
bone-axis adjustment in Blender 4.3.2's glTF exporter. A real single-bone fixture
caught the incorrect shared conversion with a maximum matrix error of 1.0;
the failing execution is retained with the usable-assets consumer evidence.
The current examples use meter-scale scenes. Input times are actual exported key times;
do not assume the first key is at time zero or use a new importer's default FPS.
The arm's first Blender frame is exported at `1/30` second. Native expectations
must come from the same selected revision and pose, not from the imported GLB.

Optional `--required-skinned-meshes` checks actual skin bindings to a Skeleton3D;
`--expected-triangles` checks imported surface indices. Matrix matching requires
the entire sampled animation to pass and requires observable motion; a static
rest pose alone cannot pass. `--tolerance` controls matrix-element error and
defaults to `2e-5`. `--vertex-tolerance` separately controls skin-position error
in meters and defaults to `2e-5` (20 micrometers). Both must be finite and
strictly positive. The configuration and Godot result record the selected
thresholds; they are never automatically increased after observing a difference.

For an actual skin-deformation probe, each native sample can also contain
`skin_vertices` entries with `node`, `label`, `rest_world` and current `world`
positions in Blender coordinates. A vertex label is associated when it first
appears, and its recorded rest position must correspond to that sample's pose;
normally all labels are included in the first sample at rest. Godot matches an
actual imported skinned vertex at that recorded position
(within 10 micrometers), retains its surface/index and evaluates its delivered
joint indices, weights and inverse-bind matrices against the current Skeleton3D
pose. Each resulting world point must match the native evaluated position within
the declared vertex tolerance. Active corrective shapes are evaluated first through Godot's
public `bake_mesh_from_current_blend_shape_mix()` API, with the actual animation
weights recorded per sample. The resulting points are then skinned. This
exercises the delivered morph/skin data in CPU observations inside Godot; it is
still not a GPU rendering test. Four/eight influence layouts are supported.
A missing skin, invalid binding, failed morph bake or unresolved rest match
is not accepted by this narrow probe. Repeated coincident export vertices
are not an exhaustive inspection of all weights; use representative affected
regions and retain that sampling limit.

Rest-association positions are computed once per mesh surface within a sample
and shared by that sample's probes. This cache is cleared after every animation
seek, alongside the morph snapshot cache. A failed match remains a failure;
only a successful per-label surface/index association is reused over time.
Actual deformation results are never cached across samples or normalized by
this optimization. Later-introduced labels still associate against their own
first sampled pose.

For rest-vertex association only, the weighted position is divided by its
near-unit weight sum in skeleton-local space. Godot's packed weights can sum
to 0.9999847, which otherwise shifts the lookup by more than 10 micrometers.
The actual deformation comparison keeps the **raw imported weights** and
reports their measurable error; it does not normalize away the discrepancy.
An independent two-bone/transformed/morph fixture retains its approximately
18-micrometer consumer difference, and an actual GLB with replaced weights
fails. Renderer appearance remains unexecuted in the headless environment.

An asset-specific consumer precision budget may be selected explicitly, for
example `--vertex-tolerance 0.00005` for 0.05 mm in a meter-scale scene. Retain
the stricter failing result, diagnose the exported and imported weights, and
state why the budget is suitable for the intended use before adopting it. This
option changes only the acceptance threshold: it does not alter imported
weights, normalize actual deformation, relax matrix matching, or widen the
10-micrometer rest association. Measured errors remain in every sample, and
corrupted delivered weights beyond the declared budget still fail. This budget
does not establish mesh clearance or hide a failed visual or attachment review.

The observer checks only the declared nodes/bones and sample times. It does not
prove universal joint clearance, continuous collision freedom, physics response,
every shape key, shader fidelity, or a frame-time improvement from mesh reduction.
Inspect real source-bound renders, mesh condition, skin deformation and actual
attachments separately, as described in the production guides.

## Reproduction dependencies

Executed with Godot 4.7.2 and Blender 4.3.2 in this development slice. Godot is
an optional example consumer, not a dependency of the installed RefAs skill.
The script uses documented public APIs:

- [GLTFDocument](https://docs.godotengine.org/en/stable/classes/class_gltfdocument.html)
- [AnimationPlayer](https://docs.godotengine.org/en/stable/classes/class_animationplayer.html)
- [Skeleton3D](https://docs.godotengine.org/en/stable/classes/class_skeleton3d.html)
- [Scene-relative node paths](https://docs.godotengine.org/en/stable/classes/class_node.html#class-node-method-get-path-to)
- [MeshInstance3D blend-shape snapshot](https://docs.godotengine.org/en/stable/classes/class_meshinstance3d.html)

Run actual consumer regressions, including two independently animated skeletons
with ambiguous names and qualified paths, failed rest associations, wrong native
matrices/skin positions, a stationary named clip and a missing clip, with both
applications installed:

```bash
REFAS_GODOT_TESTS=1 python3 -B -m unittest discover -s tests -p test_production_engine_playback.py -v
```
