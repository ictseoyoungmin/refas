# RefAs 2.0 production rewrite

Status: development alpha. This document describes the accepted direction and the first implementation slice; it is not a release announcement.

Work OS plan: <https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7>.

Report progress using the fixed [Notion acceptance checklist](refas-2-progress.md)
and its [machine-readable record](refas-2-progress.json). Count verified criteria,
show the denominator and open items, and keep visual acceptance, task review
status and release status separate. Broader optional profiles below are not
implicitly complete when this first-application checklist advances.

## Product outcome

An agent can start from visual references, create a credible editable asset, inspect real output, make a local correction, and continue the same native project in a later session. The deliverable is the asset and its useful source material. Tools record enough state to make edits recoverable and reviews traceable.

The rewrite tests a concrete hypothesis: a shorter, production-oriented skill and direct authoring tools can improve useful modeling output and reduce iteration cost. No claim about a particular old or new model's ability is assumed from its version. Compare behavior on actual references using a pinned model and toolchain.

## Current baseline and version boundary

- Published release baseline: `v1.4.1`.
- Active package/Python runtime/plugin metadata: `2.0.0-alpha.1`, a coordinated development identity. It is not a published stable 2.0 release.
- Starting main: `a29bcc42f4da666c812462eb130836f2d766b0a1`.
- Preserved 1.4.2 rollback branch: `develop/v1.4.2` at `67143f45bf6f5152c404caa2d643109881bfeca2`.
- The installed skill and npm artifact contain only the 2.0 production path. The retained 1.x runtime keeps its own `1.4.2` identity under repository-only `legacy/v1/`.

The 1.x JavaScript runtime, stored-project formats, references and validators remain in the repository for explicit compatibility and comparative checks. They are excluded from the active skill and npm package. New production projects do not run through that capability state machine. The new `import-v1` command reads selected legacy project data directly; it neither imports the old JavaScript runtime nor transfers its certification authority.

Package metadata, runtime identity, both plugin manifests, release docs, packaging tests and migration guidance change together. The npm entry invokes the same production Python CLI as a copied skill. An exact file allowlist rejects accidental legacy reintroduction. Actual installed-package evidence is required for the cutover criterion; main merge and formal publication remain separate milestones. Do not call a branch or development identity a completed 2.0 release.

## Design decisions

| Decision | Practical effect |
|---|---|
| Blender native scene is the editable working source | Existing materials, object relationships, UVs, rigs, and shape keys can survive local changes. |
| Normal `bpy` scripts are the first authoring interface | The agent can use Blender directly without constructing a new modeling DSL. |
| Small project/revision layer records files and execution | State recovery is separate from subject-specific quality judgments. |
| Requested views are rendered from actual geometry | Each iteration captures useful evidence without requiring a universal view pack. |
| File hashes bind a stored result | Artifact integrity does not require every authoring operation to reproduce identical bytes on a second execution. |
| Technical checks and visual review remain distinct | An exported model cannot obtain a likeness or game-readiness claim from file validity. |
| Existing 1.x contracts remain repository-only under `legacy/v1/` | The rewrite can be evaluated without installing old runtime files or changing old certification behavior. |

Reference images remain authoritative for visible design. Unseen surfaces can be inferred or engineered and should be identified accordingly. Preserve these concise principles; do not carry the entire historical proof chain into the default authoring loop.

## First vertical slice

The initial production command is `python3 skills/refas/scripts/produce.py` in a repository checkout, or `python3 scripts/produce.py` from an installed skill root.

| Command | Responsibility |
|---|---|
| `doctor` | Report the Python/Blender environment before authoring. |
| `init --root DIR --name NAME [--reference FILE ...]` | Create a production project and retain reference copies. |
| `references --root DIR --reference FILE ... --expected-sequence N` | Adopt the complete active reference set while retaining all model/source history; use `--clear` for an empty set. |
| `run --root DIR --script FILE --intent TEXT` | Execute a Blender script and record the native scene, GLB, renders, script, and metadata as a revision. |
| `run ... --input-blend FILE` | Import a separately saved native edit; ordinary runs reopen the current revision automatically. |
| `import-v1 --root NEW --source-project OLD --checkpoint ID --artifact PATH --name NAME` | Import one explicitly selected archived native or supported GLB asset, retaining exact input bytes and provenance without old approval inheritance. |
| `status --root DIR` | Expose one coherent revision snapshot, artifacts, inputs, sequence and reference freshness. |
| `verify --root DIR` | Verify recorded file integrity and separately report current/stale/no-revision evidence. |
| `restore --root DIR --revision ID` | Publish an exact previous bundle as a new revision while retaining history and the active reference set. |

Rendering flags include `--views`, `--size`, `--samples`, `--timeout`, and optional `--review-spec` for captured fixed cameras and lighting. The runner owns publication of the current revision; failure, stale inputs, or missing outputs must not replace the previous usable state. Successful publication records an execution result, not human visual approval.

Reference freshness compares captured content sets, independent of file names,
duplicates and order. The required reference-update sequence prevents stale
updates even when the native head is unchanged. `run` and `restore` also accept
`--expected-sequence` alongside `--expected-revision`. Native, script and review/
render changes enter through an explicit `run`, which captures new inputs and
publishes their outputs together. Historical copies remain independent of
external files. No external filesystem watcher is implied.

The Blender worker accepts a regular trusted Python script and exposes `bpy` plus `REFAS_OUTPUT_DIR`. It handles export and requested captures, so agents do not have to hand-author evidence JSON. It is not a sandbox for untrusted code.

### Executable demonstration

The repository example under `examples/production-workflow/` builds an original static headset and then adjusts its headband comfort pad in the saved scene. Meaningful object names make the edit target explicit. Compare the before/after renders and relevant scene observations to demonstrate that earcups and other protected parts survive.

This fixture proves the native authoring/edit/recovery path. It is not evidence that an arbitrary source image can already be reconstructed faithfully, nor is it a completed rigged-character or target-engine test.

The [reference-refresh demonstration](../../examples/reference-refresh/README.md)
exercises a changed reference set, a separate native Save As edit, changed
script/review/render inputs, coherent restarted reads and exact restore through
the public CLI. Its [evidence record](evidence/reference-freshness/README.md)
separates transaction probes from actual Blender and extracted-package runs.

### Required evidence for this slice

1. Run the production CLI from a copied skill directory with no repository-relative dependency.
2. Execute real Blender to produce a native scene, nonempty GLB, and requested PNG renders.
3. Open the saved scene for a local edit and inspect actual before/after output.
4. Show that a failed run leaves the current usable revision unchanged.
5. Detect missing/tampered recorded artifacts and stale publication attempts.
6. Restore an earlier revision and verify the selected artifact identities.
7. Preserve the 1.x reference graph and runtime regression behavior in the repository-only legacy implementation, while proving the active installed distribution has no dependency on it.

Use small Python unit checks for revision/state failure paths. Real Blender execution is a separate integration check; syntax compilation or a fake worker cannot substitute for it. Record the actual Blender version and commands with the result.

## Subsequent milestones

### S2 — Reference reconstruction and useful visual comparison

The [uniform-jacket pilot](evidence/uniform-jacket/README.md) is the first completed
exploratory source-image case: one fresh no-skill/1.x/2.0 attempt each, followed by
the same cuff edit and recovery task. Anonymous review favored the no-skill
prototype; all candidates remained unfinished. A separate informed 2.0 follow-up
closed the sleeve/body gaps using shared topology. The case justified fixed
camera/light capture and explicit unsupported-object inspection failures. It
does not complete the broader profile or release milestone below.

The subsequent [garment and automail checkpoint](evidence/garment-and-automail/README.md)
adds an informed garment refinement and fresh independent arm controls. Anonymous
review prefers the refined garment but rejects both states. For the arm it
prefers ordinary Blender narrowly over fixed 1.x, then 2.0; all are unfinished.
Short optional guides are reachable and local edits/recovery work, but this
does not establish a visual-quality advantage. R2-05/06 remain WIP. The next
quality task should address the recorded broad-form and compound-surface
failures, while retaining these original comparison candidates.

Use permitted real references representing at least a hard-surface prop, an organic shape, and a multi-part object. Establish consistent source comparison views, preserve uncertain camera choices, and demonstrate visible improvement from local edits. Add a comparison helper only when a real review failure requires it.

Evaluate the 1.x entry and the new entry using the same model, prompt purpose, references, toolchain, and time/resource budget. Record time to a credible whole, repair success, source/project retention, and blind visual preference. Technical pass/fail and research evaluations remain separate; a higher preference score does not become a certificate.

### S3 — Editing and delivery profiles

Extend proven operations to UV/material edits, assemblies, and existing rigs. For a character track, demonstrate preservation of skin weights, shape keys, and deformation using a real character case. Add target-engine import/animation/budget checks only for the promised profile. Preserve actual source and dependent resources in the handoff.

### S4 — Packaging and explicit migration

Cut over version metadata consistently and prove the copied skill and npm launcher in isolation. The active skill contains focused production guides and Python code; `legacy/v1/`, schemas, old templates and comparison tooling remain repository-only. Test the actual archive against its exact file list, including rejection of an injected legacy file.

The explicit `import-v1` path selects a checkpoint and artifact recorded in a 1.x project, verifies archived bytes and source identity, and creates a fresh production revision. Preserve the old project's bytes. Capture chosen manifests and an import report as provenance; do not execute old validators or inherit old certificates. A GLB can reconstruct only the supported data it contains, not absent native construction history. Native import is restricted to supported self-contained scenes. Whole-project/history migration and untested rig, animation or engine fidelity remain outside this demonstrated scope.

### S5 — Release acceptance

Publish only after the installed skill completes unfamiliar reference tasks, real local edits, failure recovery, and the supported export profile. Release acceptance is evidence for this declared scope; universal photo likeness, physics correctness, and all game engines are not implied.

## Checks and workflow

The independent production workflow runs targeted Python checks, syntax compilation, and the installed-copy CLI check. It does not install Blender during every ordinary CI run. A real Blender integration run is required as recorded local or dedicated integration evidence before calling S1 complete.

The existing 1.x regression assertions remain in force with imports updated to their explicit repository location. Update instruction-text and package tests where the default route intentionally changes; preserve assertions over the existing graph, source-bound authority, replay and saved projects. Repository release audit remains a distribution gate, not the default model-authoring loop.

Current implementation and evidence are tracked in `docs/WORK_STATUS.md`.
