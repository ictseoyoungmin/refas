# RefAs 2 skill relationships

This map explains what the installed skill contains, who uses each element,
and what a change or removal affects. It is a repository maintenance document;
agents making assets start with the installed `SKILL.md`, not this map.

The [distribution allowlist](../../tools/verify-production-distribution.mjs)
declares **24 installed skill files**: sixteen Python files, five guides, the
skill entry, discovery metadata and one icon. Two `.npmignore` files also live
in the source folder but are excluded from the package. The complete npm
package has 28 files: those 24 plus the root README, LICENSE, package metadata
and [Node launcher](../../bin/refas.mjs). The launcher delegates to Python;
the copied Python skill can run without Node.

## Relationship map

Solid arrows mean an import, command or process invocation. Dotted arrows mean
discovery or guidance read by the host agent. `production/` abbreviates
`scripts/production/`. The project-specific authoring script is outside the
installed skill.

```mermaid
flowchart TD
    Discovery["openai.yaml and icon.svg"] -. "discovery" .-> Agent["Host agent"]
    Agent -. "reads" .-> Skill["SKILL.md"]
    Skill -. "routes as needed" .-> Guides["Five production guides"]
    Agent -- "public command" --> CLI["scripts/produce.py"]
    Guides -. "command options" .-> CLI

    CLI -- "version" --> Identity["production/__init__.py"]
    CLI -- "authoring-capabilities" --> Catalogue["production/capabilities.py"]
    Catalogue -. "AST signatures and guide paths" .-> Helpers["Installed authoring helpers and guides"]
    CLI -- "commands" --> Project["production/project.py"]
    CLI -- "import-v1 only" --> Import["production/asset_import.py"]
    Project -- "GLB format check, lazy import" --> Import
    Import -- "saved-project adoption" --> Project

    Project -- "validate view specification" --> Review["production/review.py"]
    Project -- "Blender process" --> Worker["production/blender_worker.py"]
    Worker --> Review
    Project -- "region validation" --> Comparison["production/image_compare.py"]
    Worker -- "compare only" --> Comparison
    Worker -- "curve instance checks and topology" --> Audit["production/mesh_audit.py"]
    Worker -- "runpy inside Blender" --> Script["Project bpy authoring script"]
    Guides -. "authoring guidance" .-> Script
    Script -- "optional import" --> Audit
```

Optional native authoring imports and their dependencies:

```mermaid
flowchart TD
    Script["Project authoring script"] --> Mount["surface_mount.py"]
    Script --> Recess["recess.py"]
    Script --> Bridge["boundary_bridge.py"]
    Script --> Projection["surface_project.py"]
    Script --> Local["local_edit.py"]
    Recess -- "evaluated BVH and frame" --> Mount
    Mount --> Blender["Blender bpy and mathutils"]
    Recess --> Blender
    Bridge -- "native bridge on a staged mesh" --> Blender
    Projection -- "native Project and bounded observations" --> Blender
    Local -- "joint displacement and native coordinate edit" --> Blender
```

The independent numeric surface-binding and thickness-field imports are
described in the table below; they do not call these native construction tools.

The guides influence the agent's commands and scripts; Python does not execute
Markdown. The worker adds its module directory to the import path before
running the author's ordinary `bpy` script. This makes documented helper
imports available without requiring repository-only code.
The catalogue reads installed helper signatures without importing Blender or
running a project; it reports the bare imports used by native author scripts.

The two arrows between project and asset import serve distinct paths: ordinary
GLB editing loads the shared format check when needed, while saved-project
adoption calls the project runner. The lazy check avoids a startup import cycle.

Normal native iterations open the saved `.blend` through `bpy`, run the author's
`bpy` script and save/reopen the native. The GLB format check belongs to explicit
GLB intake; it does not perform modeling or inspect `.blend` geometry. Lattice
editing uses the same worker/script path and Blender's existing deformation
tools. The worker retains the cage's control data while observing the evaluated
host surface. Native control cages are distinct from the delivered mesh scope.

Explicit construction meshes use the same path: the author sets
`refas_role = "construction"` through ordinary `bpy`, and the worker retains
their source geometry and modifier relationships in the native scene. Render
evaluation keeps those dependencies while object-level `hide_render` excludes
the source surfaces. Inventory bounds/counts and GLB select the asset surfaces;
an explicit query can still inspect construction geometry. This separation
enables editable Boolean and Shrinkwrap work without a new modeling API.

## Runtime files

Paths in the first column are relative to `skills/refas/`.

| File | Purpose and actual consumers | Change or removal impact |
|---|---|---|
| [scripts/produce.py](../../skills/refas/scripts/produce.py) | Public arguments, JSON output and command dispatch. Used directly by the agent or through the npm launcher. | Keep CLI help, SKILL examples, the launcher and copied-installation checks consistent. Removing a route also requires addressing its documented workflow. |
| [scripts/production/__init__.py](../../skills/refas/scripts/production/__init__.py) | Supplies `VERSION` to the CLI. Distribution checks compare it with package/plugin identity. | Coordinate version changes with `package.json` and plugin metadata. This small file is part of the import and identity contract. |
| [scripts/production/project.py](../../skills/refas/scripts/production/project.py) | Owns references, snapshots, revisions, integrity, recovery, temporary queries and storage cleanup. CLI and saved-project importer call it; it captures explicit native/GLB inputs, shares the asset format check and starts the Blender worker. | Changes can affect publication or recovery even when geometry code is untouched. Follow input selection/capture, job/result contracts and source/revision integrity tests. |
| [scripts/production/blender_worker.py](../../skills/refas/scripts/production/blender_worker.py) | Loads the selected native or imports GLB, runs the `bpy` authoring script, saves/reopens, protects objects, observes, renders and explicitly exports. It retains lattice controls and explicit construction meshes separately from final asset surfaces. | Follow its job/result contract with `project.py`, source roles and modifier dependencies, control-data/protected-object state, compact queries, surface scope, delivery boundaries and actual Blender tests. A host-only test cannot establish Blender behavior. |
| [scripts/production/review.py](../../skills/refas/scripts/production/review.py) | Validates fixed camera/light specifications in both the host project code and Blender worker. | Both callers and the review guide must agree. Preserve captured settings through save/restore and test actual views where relevant. |
| [scripts/production/image_compare.py](../../skills/refas/scripts/production/image_compare.py) | Optional alpha coverage comparison. Project validates regions; the temporary Blender worker decodes captured PNGs. | Removal requires retiring `compare`, both callers, review guidance, package allowlist and comparison tests. It does not own edits or baseline approval. |
| [scripts/production/mesh_audit.py](../../skills/refas/scripts/production/mesh_audit.py) | Observes evaluated topology and anchor gaps. The worker imports its curve-tessellation discriminator at startup and calls `audit_mesh` for topology queries. Authoring scripts can also import it. | It is not optional as a whole: deleting it also breaks normal worker startup and curve instance checks. Follow worker imports, query output, topology guidance and author scripts. |
| [scripts/production/surface_mount.py](../../skills/refas/scripts/production/surface_mount.py) | Optional Blender authoring: select an evaluated surface frame and rigidly place a detail with explicit contact samples. Author scripts call it through the catalogue/assembly guide; recess construction reuses its internal evaluated BVH/frame functions. | Keep discovery, assembly example, package allowlist and actual Blender tests aligned. Removal also breaks recess construction and saved author-script imports; the core worker never invokes it automatically. It does not replace deforming surface binding or collision QA. |
| [scripts/production/recess.py](../../skills/refas/scripts/production/recess.py) | Optional Blender authoring: construct/revise one named convex blind recess with an editable construction cutter and Boolean. Uses shared surface selection and verifies sampled floor/wall geometry. | Removal affects catalogue/guide imports, package allowlist and native recess tests; existing ordinary cutter/Boolean scenes remain editable. Keep static solid and sampled-thickness limits separate from cloth openings and global wall certification. |
| [scripts/production/boundary_bridge.py](../../skills/refas/scripts/production/boundary_bridge.py) | Optional native topology edit between explicit existing open cage chains. Stages Blender's LINEAR/SURFACE bridge and verifies correspondence, shared edges and source-data preservation. | Keep catalogue, assembly usage, package entry and actual Blender tests aligned. Removing it breaks author-script imports; accepted results remain ordinary editable cages. Object identity survives, mesh datablock replacement is explicit, and evaluated margins can change through retained modifiers. |
| [scripts/production/surface_project.py](../../skills/refas/scripts/production/surface_project.py) | Optional native Project fitting of prepared component masks, with first-hit, actual residual/displacement and failure recovery observations. Author scripts discover it through the catalogue and assembly guide. | Keep discovery, native layer examples, package allowlist and actual Blender tests aligned. Removal breaks author-script imports; saved mesh/masks and ordinary Shrinkwrap remain editable. It does not prepare geometry or replace a general constrained deformer. |
| [scripts/production/local_edit.py](../../skills/refas/scripts/production/local_edit.py) | Optional joint displacement edit with explicit region/absolute targets and frozen outside cage. Author scripts choose finite distance, paired-shell and first-hit ray bounds; conflicting candidates restore coordinates. | Keep discovery, assembly usage, package allowlist and copied-skill/native tests aligned. Removing it breaks author-script imports but leaves saved ordinary meshes editable. It creates no persistent controls or project schema; bounded displacement is not a general nonlinear solver or global thickness/collision proof. |
| [scripts/production/surface_binding.py](../../skills/refas/scripts/production/surface_binding.py) | Optional numeric authoring API for binding and transporting a section on an explicitly chosen host triangle. No core module automatically calls it. | Search documented and retained author-script imports, not only core imports. Removing it retires the supported surface-attachment recipe and its tests. |
| [scripts/production/thickness_field.py](../../skills/refas/scripts/production/thickness_field.py) | Optional stdlib graph operation approximating the greatest permitted thickness field under explicit upper, lower, pin and edge-gradient bounds. Author scripts choose whether and how to apply it. | Keep the assembly recipe, catalogue, package allowlist and numeric/native tests consistent. A field PASS does not certify evaluated shell clearance or wearing. Removing it affects retained author-script imports, not normal worker startup. |
| [scripts/production/capabilities.py](../../skills/refas/scripts/production/capabilities.py) | Read-only `authoring-capabilities` catalogue; CLI calls it, AST reads current helper signatures, and records guide paths and native author imports. | Update route names, source callables and guide paths together. Removal also retires the CLI route, SKILL discovery instruction and installed discovery checks; ordinary modeling does not depend on it. |
| [scripts/production/asset_import.py](../../skills/refas/scripts/production/asset_import.py) | Shares the GLB container/resource check with `run --input-glb` through a lazy project import. The `import-v1` command also uses it to capture archived bytes and call the current project path. | Both ordinary GLB editing and saved-project adoption depend on this file. Coordinate their commands, input capture, guide and tests; keep stored migration formats compatible. It is not removable solely because no 1.x migration is planned. |

## Guidance and discovery

| File | Why it exists and what it connects | Change or removal impact |
|---|---|---|
| [SKILL.md](../../skills/refas/SKILL.md) | Agent entry: asset intent, useful authoring/review loops, public commands and five on-demand guides. | Update affected command examples and guide routes. Keep development status and CI procedures in repository docs. |
| [references/production-assemblies.md](../../skills/refas/references/production-assemblies.md) | Segmented forms, connected boundary transitions, rigid mounting, flexible-layer projection, joint local edits, editable Boolean openings, pivots, local curve/lattice edits and optional surface-binding/thickness-field APIs; links to topology guidance. | Check SKILL routing, construction-source and native control-cage delivery scope, the garment guide's references and helper examples. |
| [references/production-garments.md](../../skills/refas/references/production-garments.md) | Shared cloth boundaries, sleeves, folded collars and wearing/deformation; refers to assemblies and topology. | Keep construction advice consistent with those guides and the intended character/motion scope. |
| [references/production-topology.md](../../skills/refas/references/production-topology.md) | Mesh observations, curve-to-mesh delivery, retained Shrinkwrap sources, retopology and optimization; demonstrates `inspect` and `mesh_audit`. | Follow CLI/query changes, source/output scope, helper APIs and incoming links from SKILL, garments and assemblies. |
| [references/production-review.md](../../skills/refas/references/production-review.md) | Fixed views and optional region coverage comparison. | Match `review.py`, `image_compare.py`, CLI options and actual render behavior. |
| [references/production-import.md](../../skills/refas/references/production-import.md) | Direct GLB/native starting scenes, continued native editing, source preservation and conditional saved-project adoption. | Match input selection, imported-object protection, output defaults and recovery. Keep absent authoring history and asset acceptance limits explicit. |
| [agents/openai.yaml](../../skills/refas/agents/openai.yaml) | Host discovery, displayed name, default prompt, invocation policy and the icon references. | Changes affect discovery/UX rather than Python geometry. Check the referenced icon and plugin identity. |
| [assets/icon.svg](../../skills/refas/assets/icon.svg) | Shared visual identity referenced by `openai.yaml` and repository plugin metadata. | Update both references if moved or replaced; the plugin distribution check requires the canonical icon. |
| [.npmignore](../../skills/refas/.npmignore), [scripts/.npmignore](../../skills/refas/scripts/.npmignore) | Source-only exclusions for generated Python bytecode. | Keep the source-folder allowlist and actual tarball cache-exclusion checks aligned. They are not two extra installed skill files. |

## Changes in context

This table records the affected relationships and their purpose, not a running
ledger of test totals or asset approval.

| Feature or maintenance change | Related elements | Why the relationship is needed | What to revisit if replaced or removed |
|---|---|---|---|
| Verified release package | Package/plugin identities and `production/__init__.py`; repository publication workflow → `tools/release-package.mjs` → actual archive installation and GitHub Release assets | Publish the reviewed production-only bytes with a checksum, while keeping version preparation separate from public availability. | Coordinate versions, README installation examples, release audit, package allowlist, exact-main/manual authorization and immutable asset checks. Removing the publication helper affects release delivery, not native authoring. No new installed skill file or project schema is added. |
| External animation observations | Repository-only `examples/engine-playback/run.py` → `verify_godot.gd` → Godot GLTFDocument/AnimationPlayer; engine playback tests and synthetic GLB fixtures | Compare named live nodes, skin/morph vertices and static attachments with independent native samples; retain process-timeout evidence. | Original-to-imported name association, explicit paths, SceneTree attachment updates, raw skin arithmetic, declared tolerances, runner options and README. No installed skill file or production command depends on this optional observer. |
| Selective authoring support | CLI → catalogue → source signatures; author script → optional thickness field → ordinary Solidify; SKILL and garment/assembly guides | Make existing tools discoverable and permit bounded local thickness changes across garment and panel surfaces while prioritizing whole form. | Native script import paths, graph constraints and impossible-bound rejection, evaluated surface preservation, copied install/restore, guide routes and package membership. No stage lock, new project schema or collision-repair claim is introduced. |
| Native construction meshes | Existing project/worker → ordinary `bpy`; SKILL, assemblies and topology guides | Keep Boolean cutters and projection sources editable in the native while final surface counts, framing and GLB omit the source surfaces. Retain dependencies for render/export evaluation and protection. | Explicit role and modifier target fingerprints, scene/view-layer scope, helper ancestry, selected-source queries, native restore, final-geometry counts and installed static export. Removing the role requires resolving saved helper-dependent projects and both authoring recipes; hiding arbitrary meshes is not an equivalent replacement. |
| Editable native lattices | Existing CLI/project → worker → ordinary `bpy` script; SKILL and assembly guide | Retain a Blender deformation cage and modifier for continued local shape edits. Record its control data while rendering and inspecting the evaluated host geometry; no new command, module or deformation algorithm. | Grid/interpolation/controls/group weights/shape keys/animation fingerprints, protected state, in-scene and active-view-layer dependencies, compact queries and exact restore. Delivery rejects every remaining scene lattice and does not auto-bake animation. Removing support would retire continued native cage editing and its installed-use tests. |
| Direct GLB authoring input | CLI → project → worker; project → `asset_import` format check; SKILL and import guide | Start a useful `bpy` edit from an ordinary self-contained GLB without a manual native conversion or saved-project format. The original input is captured and subsequent edits continue the native revision. | Mutually exclusive complete-scene inputs, captured GLB identity, embedded-resource requirements, imported-object protection, native/delivery defaults, restore and existing Python positional calls. Reuses the existing modules and adds no report format. |
| Editable native curves | Worker inventory/protection/rendering; worker → `mesh_audit`; SKILL, assemblies and topology guides | Keep curve controls editable while observing their evaluated surface. Blender's implicit curve surface must be distinguished from genuine instances. | Curve state preservation, evaluated bounds, instance rejection, explicit mesh delivery and guidance. No additional installed module was introduced. |
| Topology summaries and requested details | CLI → project → worker → `mesh_audit`; SKILL and topology guide | `inspect --topology` gives summary facts. `--topology-details` requests the bounded location/component records when needed and implies topology. This reduces routine response size without changing the underlying defect observations. | CLI defaults, explicit detail selection, Python API compatibility, worker response shape and source-integrity/cleanup guarantees. Existing Python callers retain their detailed default unless they explicitly request summary output. |
| CI and relationship reporting | Repository workflows, tests, distribution checks and this map | Normal CI uses Node 22/24; retained legacy JIT/deep suites have separate execution conditions. The map makes dependencies and removal impact inspectable. | Workflow triggers/conditions and their required gates. These changes do not add a Blender runtime dependency or an installed skill file. |

Both managed-project and standalone queries follow the same worker route.
Their temporary files, input hash checks and `persisted: false` result belong
to the project/query contract. Choosing more or fewer details is not permission
to save a new revision, convert the source or relax an observation.

## Existing checks to follow

Validation lives outside the installed skill. Use the checks that exercise
the changed relationship; a documentation edit does not require another asset
or render merely to update this map.

| Relationship | Existing verification |
|---|---|
| Installed file set and allowed internal links | [Distribution allowlist](../../tools/verify-production-distribution.mjs), [distribution tests](../../tests/production-distribution.test.mjs) |
| Exact release archive and immutable public assets | [Release package helper](../../tools/release-package.mjs), [publication tests](../../tests/release-package.test.mjs), [manual publisher](../../.github/workflows/publish-release.yml); existing archive-install check below |
| npm launcher and independent Python copy | [Packed-install check](../../tools/verify-packed-install.mjs), distribution tests above |
| Discovery, icons and plugin identity | [Plugin checker](../../tools/verify-plugin-distribution.mjs), [plugin tests](../../tests/plugin-distribution.test.mjs) |
| CLI/project, queries, integrity and recovery | [Project tests](../../tests/test_production_project.py), [resource tests](../../tests/test_production_resources.py), [native tests](../../tests/test_production_native.py) |
| Worker behavior and curves | [Blender tests](../../tests/test_production_blender.py), [curve tests](../../tests/test_production_curves.py) |
| Native lattice controls, evaluated host and delivery boundary | [Lattice tests](../../tests/test_production_lattices.py), existing project recovery and distribution checks above |
| Native construction sources, Boolean/Shrinkwrap evaluation and final output scope | [Construction tests](../../tests/test_production_construction.py), installed editing/delivery/protection/restore and actual matched views |
| Fixed review specification | Project capture/restore and validation tests; actual fixed-view Blender tests above |
| Animation and consumer execution | [Animation tests](../../tests/test_production_animation.py), [engine playback tests](../../tests/test_production_engine_playback.py) |
| Mesh observations | [Mesh-audit tests](../../tests/test_production_mesh_audit.py), native and curve query tests above |
| Optional rigid mounting and evaluated surface frames | [Blender and installed-native tests](../../tests/test_production_surface_mount.py), source-bound garment/car feature studies outside Git |
| Optional blind recess construction | [Blender and installed-native tests](../../tests/test_production_recess.py), source-bound car intake study outside Git |
| Native connected boundary transitions | [Copied-skill Blender tests](../../tests/test_production_boundary_bridge.py), actual source-bound collar/lapel and fender/body comparisons outside Git |
| Bounded native surface projection | [Copied-skill Blender tests](../../tests/test_production_surface_project.py), actual prepared sleeve-layer fitting and failed-projection recovery outside Git |
| Joint local displacement with hard handles and bounded observations | [Copied-skill Blender tests](../../tests/test_production_local_edit.py), garment/car local edits, failed-bound recovery and native continuation outside Git |
| Optional surface-binding API | [Numeric tests](../../tests/test_production_surface_binding.py), [installed Blender tests](../../tests/test_production_surface_blender.py) |
| Optional thickness field and native application | [Independent graph-oracle tests](../../tests/test_production_thickness_field.py), [copied-skill Blender/restore test](../../tests/test_production_thickness_blender.py) |
| Installed authoring discovery | [AST and copied-CLI tests](../../tests/test_production_capabilities.py), packed-install check above |
| Direct GLB input selection, capture and continued editing | [Resource tests](../../tests/test_production_resources.py), actual Blender/installed-input checks above |
| 1.x asset adoption | [Import tests](../../tests/test_production_import.py), Blender import tests above |
| Repository CI execution | [Normal CI](../../.github/workflows/ci.yml), [production CI](../../.github/workflows/production.yml), [Deep QA](../../.github/workflows/ci-deep.yml) |

The retained [`legacy/v1/`](../../legacy/v1/) code supports historical comparison
and regression checks. It is outside the production package and is not a
dependency of the current importer. Likewise, repository CI validates the
distribution but is not part of the installed modeling workflow.

## Keeping the map useful

When a feature changes an import, public command, authoring helper, guide route
or installed file, update the corresponding arrow and table row in the same
change. Reports should show the relevant relationship, the reason for the
change and its effect on callers, rather than repeat the entire file inventory.

Before removing an element, identify its callers, documented commands/recipes,
retained author-script imports, packaging entries and tests. An absent core
import does not establish that an optional authoring API is unused. Remove or
replace those references together only when the supported use is intentionally
retired. Keep user project history and prior assets separate from source cleanup.
