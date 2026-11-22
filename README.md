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
exported GLB, requested observations, executed script and source identities
together. Successful execution and file integrity remain separate from visual
acceptance or target-engine readiness.

The installed skill contains the production path only. The old JavaScript
capability runtime, certification graph, schemas, templates, host facade and
CPU renderers are retained in the repository for explicit compatibility and
comparative work; they are not installed with 2.0.

## Install the development checkout

The production runner needs Python 3 and Blender. It uses Python's standard
library; Blender provides `bpy` and `mathutils`. The npm launcher additionally
uses Node.js 20 or newer. Current execution evidence records Python 3.12 and
Blender 4.3.2; `doctor` reports the actual available executables.

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
python3 skills/refas/scripts/produce.py run --root work/headset --script examples/production-workflow/create_headset.py --intent "build the complete headset" --views hero,side --size 384 --samples 8
python3 skills/refas/scripts/produce.py status --root work/headset
```

For a copied skill, invoke its absolute `scripts/produce.py` path. Keep projects
outside the installed skill. Add repeated `--reference` flags to `init` for
actual source images or briefs. The headset example demonstrates execution;
it is not a source-photo likeness benchmark.

A later run opens the saved native scene before applying an ordinary `bpy`
edit. Use meaningful object names and modify the requested part:

```bash
python3 skills/refas/scripts/produce.py run --root work/headset --script examples/production-workflow/revise_headset.py --intent "adjust the comfort pad while preserving the earcups" --views hero,side
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

Each run captures its native/script/review inputs and regenerates the requested
outputs together. Pass the desired view and render settings each time. External
originals are independent of their frozen historical copies.

Use `--review-spec REVIEW_JSON` for fixed orthographic cameras and lighting;
see the [review format](skills/refas/references/production-review.md). Default
views follow current bounds. Neither route establishes source-camera calibration.

## Import selected 1.x assets

Import an explicitly selected archived asset into a new production project:

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
| `skills/refas/references/production-*.md` | Focused garment, assembly, review and import guidance | Yes |
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

The worker handles supported visible meshes, packed still-image textures and
its tested native/GLB preservation scope. Convert curves/text to meshes and
realize instances first. Match viewport/render modifier visibility and
subdivision levels. Unsupported scopes fail explicitly; procedural appearances
may need baking for the GLB target. Native source retention alone does not prove
animation, simulation, skin deformation or target-engine acceptance.

The [uniform-jacket](examples/uniform-jacket/) and
[automail](examples/automail-arm/) cases retain real source images, scripts,
renders, local edits and negative as well as positive review findings. Both
current selected assets remain unfinished. Smaller instructions and successful
execution do not by themselves prove better modeling quality or lower cost.

Local atomic storage and exact historical restoration are tested. Power-loss
durability, network filesystems and automatic abandoned-lock recovery remain
outside the current guarantee.

## Development

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[GitHub governance contract](docs/github-governance.md). Required closing checks:

```bash
npm test
npm run test:python
npm run check
npm run dogfood
npm run release:audit
```

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
