# Uniform-jacket reference pilot

The user's original 1672×941 modeling sheet is retained unchanged in
`source/reference.png`. Its SHA-256 is
`d8b85deb544c58009823ed8ed1478f20389c7a57cedc40870f64046cce76c7c5`.
`reference.json` records the source, view regions, dimensional anchors and
conflicting labels; `TASK.md` is the common assignment issued before modeling.

This case contains a single exploratory no-skill/1.x/2.0 comparison and a
separate informed correction. The independent visual review preferred the
no-skill prototype's whole-garment construction. All three were unfinished.
The 2.0 follow-up connects body and sleeves with actual shared boundaries;
underarm pinching, rigid collar/lapels and appearance differences remain.

Read the [complete evaluation and actual renders](../../docs/development/evidence/uniform-jacket/README.md)
or open the [comparison board](../../docs/development/evidence/uniform-jacket/comparison.html)
from a local checkout. There is no calibrated source-camera or likeness score.

## Reproduce the informed example

From the repository root, with Blender available:

```bash
python3 -B examples/uniform-jacket/run.py --root /absolute/path/to/new-jacket-project
```

Choose a new output directory. The harness executes eight public CLI commands:
doctor, init, initial construction, first correction, connected armhole
correction, cuff edit, restore, and verify. It records command logs and
`reproduction.json`. The supplied scripts use ordinary Blender Python, with
output metadata written under the runner's `REFAS_OUTPUT_DIR`.

| Script | Purpose |
| --- | --- |
| `create.py` | Recreate the complete initial prototype from the sheet |
| `correct.py` | Reproduce the initial trial's single visual correction |
| `join_armholes.py` | Reproduce the separate informed continuous-shell correction |
| `edit_cuff.py` | Increase only the left cuff by 10 mm and check preservation |
| `run.py` | Exercise the full example, matched review conditions and exact restore |

The default replay renders front, front three-quarter and back at 384 pixels,
8 samples. Use `--size 512 --samples 24` for the recorded pilot's image settings.
The selected/restored native and GLB paths are exposed by:

```bash
python3 skills/refas/scripts/produce.py status --root /absolute/path/to/new-jacket-project
```

The replay is implementation validation after learning from the trial. It is
not another independent attempt or a new quality result. The original trial
scripts/reports and the informed replay have separate provenance.

## Common observation

```bash
python3 -B examples/uniform-jacket/observe.py \
  --blend /absolute/path/to/candidate.blend \
  --out /absolute/path/to/new-observation-directory
```

This case-specific harness preserves the original native bytes, creates a
separate observation copy, realizes native curve decorations as meshes, and
uses the same six-view `review.json` for every condition. `normalization.json`
retains converted object names/counts; `observation.json` records input,
derived-native, review, worker and normalization hashes. The actual PNGs and
camera/light records are under `renders/`. This observation pass is outside
the original construction budget.

The first observation attempt omitted native curves in two conditions and was
rejected. The complete observer realizes 44 no-skill curves, 76 legacy curves
and no production curves. Direct production inspection now refuses unsupported
types and instances so incomplete observations cannot silently look successful.

## Scope

The cuff's measured axial extent changes from about 0.059987 m to 0.069987 m.
The informed replay preserves all 266 other object fingerprints and restores
the selected artifacts and captured inputs exactly. Those checks do not prove
visual likeness, cloth deformation, a production UV layout or engine readiness.
The original sheet's cuff circumference/flat-width and collar-width labels
remain ambiguous. No rig, cloth simulation or target-engine integration is
included in this example.

## Source-identity continuation

The later [source-identity checkpoint](../../docs/development/evidence/source-identity/README.md)
continues the selected joined native garment. `refine_identity.py` seats the
notched lapels against the chest, models collar roll and restrained cloth
shaping, separates dark straps from metal buckles, and builds the left
shield/linked-chain/pendant decoration. It retains the connected body/sleeve
construction and the existing cuff edit roles. This is an informed continuation;
the earlier independent comparison and its negative findings remain intact.

`run_identity.py` separates baseline observation, candidate creation and final
edit/restore/readback. Start with a fresh output root and the previous selected
native, using an extracted production skill:

```bash
python3 examples/uniform-jacket/run_identity.py \
  --stage baseline \
  --root /absolute/output/jacket-identity \
  --skill-root /absolute/extracted/skills/refas \
  --input-blend /absolute/previous-selected/jacket.blend
```

Use the same arguments with `--stage candidate --label source-identity`, inspect
the actual whole/collar/ornament views, then use
`--stage finalize --label source-identity`. Candidate labels must be unique;
the supplied source and native hashes must continue to match the first input.
Each new candidate starts from that immutable native. Finalization selects the
named revision explicitly, exercises the seven-object cuff change, verifies
exact payload recovery, independently imports the GLB and renders its readback.

The selected `.blend` and `.glb`, edited/restored versions, rejected iterations,
captured scripts and actual command clocks are retained in the output root.
Native cloth construction and exported appearance are assessed separately.
This workflow does not turn successful file checks into likeness or release
approval; see the checkpoint's isolated source review and remaining limits.
