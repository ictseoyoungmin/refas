# RefAs — Reference Asset Foundry

RefAs helps agents build and revise editable 3D assets from visual references.
The production workflow connects ordinary Blender scripts, a native scene,
GLB export, actual renders and recoverable revisions.

**Development version: 2.0.0-alpha.1.** This checkout is the 2.0 rewrite on
`rewrite/v2`. The package, Python entry and plugin metadata share that development
identity; it is not a published stable 2.0 release. Follow the
[implementation plan](docs/development/refas-2-plan.md),
[verified progress](docs/development/refas-2-progress.md) and
[work status](docs/WORK_STATUS.md) for the demonstrated scope.

## Build, inspect, improve

The agent reads the original reference, constructs a coherent whole, inspects
real output and makes a focused correction. RefAs records the native `.blend`,
requested observations, executed script and source identities together. Normal
CLI iterations save native scenes with one hero preview; GLB export and reimport
are reserved for explicit delivery or an export-specific check. Successful
execution and file integrity remain separate from visual
acceptance or target-engine readiness.

For game or cinematic garments and articulated mechanisms, 2.0 now targets
actual character wearing and useful motion. Review the source likeness,
unintended holes/winding/intersections and attachment gaps, then exercise
skinning or connected mechanisms in the exported consumer. Retopology and
mesh optimization are part of this production route; a static figure or a
lower triangle count alone does not establish that intended use. Follow the
[topology guide](skills/refas/references/production-topology.md) and the
[expanded acceptance protocol](docs/development/evidence/usable-assets/PROTOCOL.md).

The installed skill contains the production path only. The old JavaScript
capability runtime, certification graph, schemas, templates, host facade and
CPU renderers are retained in the repository for explicit compatibility and
comparative work; they are not installed with 2.0.

## Install the development checkout

The production runner needs Python 3.9 or newer and Blender. It uses Python's standard
library; Blender provides `bpy` and `mathutils`. The npm launcher additionally
uses Node.js 20 or newer. Current execution evidence records Python 3.12 and
Blender 4.3.2; `doctor` reports the actual available executables. Use
`doctor --check-export` to probe required exporter capabilities and the guarded
skin-weight preservation path before delivery. A different Blender exporter's
unsupported structure fails explicitly; a version report alone is not an export
compatibility or asset-readiness test.

For an agent that loads skill folders, copy **this branch's** canonical folder
into its skill location:

```bash
git clone --branch rewrite/v2 --single-branch https://github.com/ictseoyoungmin/refas.git
cd refas
cp -R skills/refas /absolute/path/to/your/skills/
```

The Claude, Codex and generic-agent plugin manifests all discover the same
`./skills/` folder. There is no second plugin-specific runtime. Instructions
for published 1.x versions are in the [legacy guide](docs/legacy-1x.md).

To exercise the actual development npm artifact:

```bash
npm pack
npm install --prefix /absolute/new/refas-install ./refas-2.0.0-alpha.1.tgz
/absolute/new/refas-install/node_modules/.bin/refas --version
/absolute/new/refas-install/node_modules/.bin/refas doctor
```

The `refas` command invokes the same production Python CLI. Set `REFAS_PYTHON`
to a Python executable path when it is not available as `python3`.

## Production quick start

From a repository checkout:

```bash
python3 skills/refas/scripts/produce.py doctor
python3 skills/refas/scripts/produce.py init --root work/headset --name headset-demo
python3 skills/refas/scripts/produce.py run --root work/headset --script examples/production-workflow/create_headset.py --intent "build the complete headset" --size 384 --samples 8
python3 skills/refas/scripts/produce.py status --root work/headset
```

For a copied skill, invoke its absolute `scripts/produce.py` path. Keep projects
outside the installed skill. Add repeated `--reference` flags to `init` for
actual source images or briefs. The headset example demonstrates execution;
it is not a source-photo likeness benchmark.

A later run opens the saved native scene before applying an ordinary `bpy`
edit. Use meaningful object names and modify the requested part:

```bash
python3 skills/refas/scripts/produce.py run --root work/headset --script examples/production-workflow/revise_headset.py --intent "adjust the comfort pad while preserving the earcups" --views side
python3 skills/refas/scripts/produce.py verify --root work/headset
python3 skills/refas/scripts/produce.py restore --root work/headset --revision REVISION_ID
```

Use a revision returned by `status`. Add `--expected-revision` and
`--expected-sequence` to require the state you inspected. Scripts are trusted
local code, not sandboxed. Failed or stale work retains the prior successful
revision and diagnostic candidate files.

Open the actual renders and editable native scene to judge the result. For
manual editing, use Blender Save As to a separate file, then pass
`--input-blend FILE` to `run`. The files returned by `status` belong to immutable
revision history.

To improve an existing GLB, pass it directly to an ordinary edit script:

```bash
python3 skills/refas/scripts/produce.py run --root PROJECT --input-glb EXISTING.glb --script EDIT_SCRIPT --intent "refine the requested part while preserving the assembly" --views hero
```

Initialize the project first if needed. Choose either `--input-glb` or
`--input-blend`; an explicit input supplies the complete starting scene and does
not append to the previous model. Omit both on later runs to continue the saved
native. GLB buffers and images must be embedded. The original GLB is captured
as `inputs/base.glb`, and the edit keeps the normal native-output default.
GLB cannot recover absent original modifiers, sculpt history or construction
scripts. See the [existing-asset guide](skills/refas/references/production-import.md)
for preservation, protection and recovery.

Batch related modeling changes in one native edit. Add repeated
`--protect-object NAME` for exact existing objects whose recorded native and
material state must remain unchanged. The guard rejects an unexpected edit
before publishing the revision. It compares at the starting frame; drivers and
node-group internals are not exhaustive, and this is not an all-frame or visual
quality guarantee. The baseline is the selected starting scene. Explicit GLB
protection begins after import and before the script; explicit native input
uses that saved scene rather than the earlier project head.

Use temporary observations and export only when needed:

```bash
python3 skills/refas/scripts/produce.py inspect --root PROJECT --object OBJECT_NAME --frame 1 --frame 24 --topology
python3 skills/refas/scripts/produce.py inspect --input-blend EXISTING.blend --object OBJECT_NAME
python3 skills/refas/scripts/produce.py deliver --root PROJECT
```

`inspect` returns compact object/frame JSON without a revision, permanent report
or render. With no object selection it gives a scene overview; with no frames
it reads the saved current frame. Choose either `--root` for the selected project
revision or `--input-blend` to read a standalone native without adopting or
copying it. Standalone results identify the original path/hash, set `revision`
to `null` and make no project reference-freshness claim; revision/sequence guards
require `--root`. `--topology` returns complete counts with empty detail samples;
`--topology-details` implies topology and returns the existing bounded samples.
Each category retains its count and truncation marker, and `detailsIncluded`
identifies the output mode. Topology observations do not establish scene-wide
collision clearance or engine readiness. `deliver` exports
the current native without reapplying an earlier edit script. Use
`run --outputs delivery` when finishing and export belong in one edit.

Existing Python `inspect_native(..., topology=True)` calls and older worker jobs
retain detailed output by default. The new keyword-only `topology_details=False`
requests summaries; `True` requests topology with details. Existing positional
arguments and the `audit_mesh` helper's defaults are unchanged.

| CLI output mode | Retained model | Default requested views |
| --- | --- | --- |
| `run --outputs native` (default) | Editable `.blend` | `hero` |
| `deliver` or `run --outputs delivery` | `.blend` and reopened GLB | `hero,side` |

Explicit `--views` selects the necessary views, including `--views ''` for none.
A supplied review specification requests its views unless narrowed by `--views`.
The internal Python `run_edit` API retains its delivery default for existing
scripted callers and accepts the new keyword-only `input_glb` without shifting
existing positional arguments. The CLI is the documented native iteration entry.

For trim or hardware on a deforming surface, ordinary edit scripts can use the
installed `surface_binding` Python helper. Bind points to an explicit outer
triangle and barycentric anchor, then transport a whole section while preserving
its dimensions. No automatic surface selection, scene handler or extra report
is created. See the [surface attachment guide](skills/refas/references/production-assemblies.md#follow-a-deforming-surface-with-an-attached-section)
for evaluated-coordinate handling and the remaining seam/clearance checks.

## References, observations and recovery

Adopt the complete desired reference set explicitly:

```bash
python3 skills/refas/scripts/produce.py references --root PROJECT --reference ORIGINAL_IMAGE --reference UPDATED_BRIEF --expected-sequence SEQUENCE
```

Use the `sequence` returned by `status`; use `--clear` for an empty set.
Equivalent content is an exact no-op regardless of file names, order or
duplicates. Reference changes preserve the model head and archived sources.

`status` and `verify` report `current`, `stale` or `no-revision` under
`evidenceFreshness`. This field compares the active reference content set with
the current bundle's captured set. Historical file integrity can still pass
when evidence is stale. Restore preserves current references, so the restored
bundle may also be stale.

Each run captures its starting asset, script and review inputs and regenerates
the requested outputs together. Pass the desired view and render settings each
time. External originals are independent of their frozen historical copies.

Use `--review-spec REVIEW_JSON` for fixed orthographic cameras and lighting;
see the [review format](skills/refas/references/production-review.md). Default
views follow current bounds. Neither route establishes source-camera calibration.

Keep one working project and retain only useful diagnostic material. Inspect
storage and safely remove redundant committed-run copies when needed:

```bash
python3 skills/refas/scripts/produce.py storage --root PROJECT
python3 skills/refas/scripts/produce.py compact --root PROJECT
python3 skills/refas/scripts/produce.py compact --root PROJECT --apply
```

The default compact command previews only; `--apply` removes payload copies that
match retained revisions exactly. Checkpoints, source and failed runs remain.
New successful runs move payload into revision storage instead of retaining a
second full copy. Deliver one selected native/export pair and necessary scripts
and resources. Avoid a new recovery archive, video or exhaustive report for
each iteration; summarize changes and unresolved findings once.
Use `--keep-diagnostics` on a run or delivery when successful raw job/Blender
logs are needed for debugging. Failed-run diagnostics remain available.

## Adopt selected assets from a saved 1.x project

Use this route only for an asset recorded in a saved RefAs 1.x project. Import
an explicitly selected archived asset into a new production project:

```bash
python3 skills/refas/scripts/produce.py import-v1 --root NEW_PROJECT --source-project OLD_PROJECT --checkpoint CHECKPOINT_ID --artifact assets/selected.glb --name imported-asset --views front,side
```

Choose the checkpoint and artifact path recorded in the original `.refas`
project. The importer reads verified archived bytes rather than an uncommitted
live file. It preserves the selected asset, original source and import provenance,
creates fresh native/GLB/render output, and leaves the old project unchanged.
No old JavaScript runtime is required in the installed skill.

An imported GLB supplies supported glTF data, not the original modifiers,
construction scripts or authoring history. Recorded native input retains its
original bytes and uses the production worker's declared scene scope. Legacy
certificates and review decisions do not approve the new revision. Read the
[import scope](skills/refas/references/production-import.md) before migration.

## Folder responsibilities

| Path | Responsibility | Included in the 2.0 package |
| --- | --- | --- |
| `skills/refas/SKILL.md` | Short production instructions | Yes |
| `skills/refas/scripts/produce.py` and `production/` | Project, Blender, review and explicit import implementation | Yes |
| `skills/refas/references/production-*.md` | Focused garment, assembly, review, topology and import guidance | Yes |
| `skills/refas/agents/`, `assets/icon.svg` | Agent metadata and icon | Yes |
| `bin/refas.mjs` | npm-to-Python CLI adapter | Yes |
| `legacy/v1/` | Retained 1.x code for explicit repository compatibility and renderer evaluation | No |
| `schemas/` | Retained 1.x test/contracts catalog | No |
| `examples/`, `tests/`, `tools/`, `docs/` | Reproduction, development checks and evidence | No |

There are no old CLI forwarding modules, host facade, certification templates,
legacy graph or CPU renderers in the installed production skill. The explicit
importer understands the saved 1.x data format without bundling its execution
and approval system.

## Verified scope and limitations

Native submissions support visible meshes and classic Blender `CURVE` objects
with Bezier, POLY or NURBS splines. Native save/reopen, rendering, protection and
temporary inspection retain recorded curve controls, settings, shape keys and
materials; topology observations use the evaluated surface. Match curve
`render_resolution_u` to the non-POLY splines' `resolution_u`, or use `0`
to reuse their viewport resolution.

Delivery remains mesh-only and refuses unconverted curves. Explicitly convert
the selected final curves through ordinary Blender scripting in a recoverable
`run --outputs delivery`. A current-frame conversion does not preserve curve
shape-key or geometry animation; deliberately bake or rebuild required motion
and verify exported playback. See the [curve delivery guide](skills/refas/references/production-topology.md#keep-curve-controls-until-mesh-delivery).

Scenes still require packed still-image textures. Hidden/excluded geometry,
text (`FONT`), `SURFACE`, modern hair `CURVES` and instances remain unsupported;
convert or realize them before submission. Match viewport/render modifier
visibility and subdivision levels. Temporary `inspect` can describe other
object types without approving them for submission. Delivery additionally
requires applying non-armature modifiers on skinned or shape-key meshes.
Procedural appearances may need baking for GLB. Native source retention alone
does not prove animation, simulation, skin deformation or target-engine acceptance.

The [uniform-jacket](examples/uniform-jacket/) and
[automail](examples/automail-arm/) cases retain real source images, scripts,
renders, local edits and negative as well as positive review findings. Both
cases began as prototypes. The later arm is accepted for its declared rigid
reach/partial-grip range; the full-character jacket remains unaccepted. See the
[current progress](docs/development/refas-2-progress.md) for exact scope. Smaller
instructions and successful execution do not by themselves prove better
modeling quality or lower cost.

Local atomic storage and exact historical restoration are tested. Power-loss
durability, network filesystems and automatic abandoned-lock recovery remain
outside the current guarantee.

Diagnostic previews currently use Cycles CPU with two threads. They are bounded
review images, not an automatically accelerated final-render pipeline.

## Development

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[GitHub governance contract](docs/github-governance.md). Use the
[documentation index](docs/README.md) for current 2.0 guidance and the separate
1.x archive. The
[skill component map](docs/development/refas-2-skill-map.md) explains actual
calls, guidance links, optional authoring APIs and change/removal checks.
Required closing checks:

```bash
npm test
npm run test:python
npm run check
npm run dogfood
npm run release:audit
```

Keep source PRs to implementation, small synthetic regressions and concise
documentation. Generate test assets in temporary directories. Keep user models,
renders, raw logs and recovery archives outside Git; link only needed evidence
and state the result and limitations. Run `npm run check:artifacts` before
staging. Historical tracked evidence is retained rather than purged.

Run actual Blender integration explicitly:

```bash
REFAS_BLENDER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 npm run test:production
```

Ordinary production CI can skip those Blender tests; report local execution
separately. Package tests must inspect the real archive and run its entry outside
the repository. Retained legacy tests exercise their explicit `legacy/v1` paths;
they do not define the 2.0 installation surface.

## License

MIT — see [LICENSE](LICENSE).
