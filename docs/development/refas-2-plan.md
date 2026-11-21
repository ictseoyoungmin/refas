# RefAs 2.0 production rewrite

Status: development alpha. This document describes the accepted direction and the first implementation slice; it is not a release announcement.

Work OS plan: <https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7>.

## Product outcome

An agent can start from visual references, create a credible editable asset, inspect real output, make a local correction, and continue the same native project in a later session. The deliverable is the asset and its useful source material. Tools record enough state to make edits recoverable and reviews traceable.

The rewrite tests a concrete hypothesis: a shorter, production-oriented skill and direct authoring tools can improve useful modeling output and reduce iteration cost. No claim about a particular old or new model's ability is assumed from its version. Compare behavior on actual references using a pinned model and toolchain.

## Current baseline and version boundary

- Published release baseline: `v1.4.1`.
- Repository package/runtime/plugin metadata: `1.4.2`, previously staged development work, not a published release established by that version string.
- Starting main: `a29bcc42f4da666c812462eb130836f2d766b0a1`.
- Preserved 1.4.2 rollback branch: `develop/v1.4.2` at `67143f45bf6f5152c404caa2d643109881bfeca2`.
- The first 2.0 slice adds a new Python production entry within the distributable skill. It does not publish a tag, release, or package.

The 1.x JavaScript runtime, stored-project formats, references, and their validators remain intact for explicit compatibility. New production projects do not run through that capability state machine. The installed skill introduces the production entry first and keeps the existing reference index as an optional 1.x route.

Package version cutover is a separate milestone: update package metadata, runtime identity, both plugin manifests, release docs, packaging tests, and migration guidance together. Do not call a branch or a README heading a completed 2.0 release. Before publication, decide which 1.x files remain packaged and prove the resulting installed distribution.

## Design decisions

| Decision | Practical effect |
|---|---|
| Blender native scene is the editable working source | Existing materials, object relationships, UVs, rigs, and shape keys can survive local changes. |
| Normal `bpy` scripts are the first authoring interface | The agent can use Blender directly without constructing a new modeling DSL. |
| Small project/revision layer records files and execution | State recovery is separate from subject-specific quality judgments. |
| Requested views are rendered from actual geometry | Each iteration captures useful evidence without requiring a universal view pack. |
| File hashes bind a stored result | Artifact integrity does not require every authoring operation to reproduce identical bytes on a second execution. |
| Technical checks and visual review remain distinct | An exported model cannot obtain a likeness or game-readiness claim from file validity. |
| Existing 1.x contracts stay behind an explicit compatibility route | The rewrite can be evaluated without changing old certification behavior. |

Reference images remain authoritative for visible design. Unseen surfaces can be inferred or engineered and should be identified accordingly. Preserve these concise principles; do not carry the entire historical proof chain into the default authoring loop.

## First vertical slice

The initial production command is `python3 skills/refas/scripts/produce.py` in a repository checkout, or `python3 scripts/produce.py` from an installed skill root.

| Command | Responsibility |
|---|---|
| `doctor` | Report the Python/Blender environment before authoring. |
| `init --root DIR --name NAME [--reference FILE ...]` | Create a production project and retain reference copies. |
| `run --root DIR --script FILE --intent TEXT` | Execute a Blender script and record the native scene, GLB, renders, script, and metadata as a revision. |
| `run ... --input-blend FILE` | Import a separately saved native edit; ordinary runs reopen the current revision automatically. |
| `status --root DIR` | Expose the current revision, its artifacts, and recorded work. |
| `verify --root DIR` | Verify project artifact bindings and report missing or changed files. |
| `restore --root DIR --revision ID` | Publish a verified previous bundle as a new revision while retaining history. |

Rendering flags include `--views`, `--size`, `--samples`, `--timeout`, and optional `--review-spec` for captured fixed cameras and lighting. The runner owns publication of the current revision; failure, stale inputs, or missing outputs must not replace the previous usable state. Successful publication records an execution result, not human visual approval.

The Blender worker accepts a regular trusted Python script and exposes `bpy` plus `REFAS_OUTPUT_DIR`. It handles export and requested captures, so agents do not have to hand-author evidence JSON. It is not a sandbox for untrusted code.

### Executable demonstration

The repository example under `examples/production-workflow/` builds an original static headset and then adjusts its headband comfort pad in the saved scene. Meaningful object names make the edit target explicit. Compare the before/after renders and relevant scene observations to demonstrate that earcups and other protected parts survive.

This fixture proves the native authoring/edit/recovery path. It is not evidence that an arbitrary source image can already be reconstructed faithfully, nor is it a completed rigged-character or target-engine test.

### Required evidence for this slice

1. Run the production CLI from a copied skill directory with no repository-relative dependency.
2. Execute real Blender to produce a native scene, nonempty GLB, and requested PNG renders.
3. Open the saved scene for a local edit and inspect actual before/after output.
4. Show that a failed run leaves the current usable revision unchanged.
5. Detect missing/tampered recorded artifacts and stale publication attempts.
6. Restore an earlier revision and verify the selected artifact identities.
7. Preserve the existing 1.x installed reference graph and runtime regression behavior.

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

Cut over version metadata consistently, decide the supported installation forms, and add a documented import path from 1.x artifacts when useful. Preserve legacy project bytes; migrating an asset does not transfer certification authority. Review the 1.x compatibility package size and deletion boundary before removing any retained runtime.

### S5 — Release acceptance

Publish only after the installed skill completes unfamiliar reference tasks, real local edits, failure recovery, and the supported export profile. Release acceptance is evidence for this declared scope; universal photo likeness, physics correctness, and all game engines are not implied.

## Checks and workflow

The independent production workflow runs targeted Python checks, syntax compilation, and the installed-copy CLI check. It does not install Blender during every ordinary CI run. A real Blender integration run is required as recorded local or dedicated integration evidence before calling S1 complete.

The existing 1.x CI remains unchanged. Update old instruction-text tests only where the default route intentionally changes; preserve assertions over the existing graph, source-bound authority, replay, and saved projects. Repository release audit remains a distribution gate, not the default model-authoring loop.

Current implementation and evidence are tracked in `docs/WORK_STATUS.md`.
