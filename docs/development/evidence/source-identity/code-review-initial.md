# Historical initial source-identity code review

This is the initial review report preserved after the findings were sent to the
authors. It describes the files **before the subsequent fixes**; it is not a
current defect list. The initial report did not carry a separately recorded
review timestamp. Its referenced actual failure is retained under run
`dd7c723ed06c496eac2be593f72ede72`, whose command record started at
`2026-11-22T12:18:10.654790+00:00`. That is an execution timestamp, not a fabricated
review timestamp. See `code-review-final.md` for later verification and scope.

## Scoped code review findings

I reviewed the available garment refinement/runner and initial automail
refinement/runner read-only. I did not run renders or modify implementation.

### Concrete issues identified

| Severity | Location | Defect and effect | Suggested correction |
| --- | --- | --- | --- |
| Blocking execution | `examples/automail-arm/refine_construction.py`, `mesh()` | New objects are created with `bpy.data.objects.new(name, None)`, making an Empty, then assigned a Mesh through `ob.data`. Actual retained run `dd7c723ed06c496eac2be593f72ede72` fails at the first `Crown_recessed_carrier` with `TypeError: Object.data expected an Image type, not Mesh`. | Create the mesh datablock first and pass it into `objects.new`; preserve the intended parent/world-to-local conversion afterward. |
| Evidence correctness | `examples/uniform-jacket/run_identity.py`, candidate/finalize handling | Duplicate `--label` is allowed, including repeated use of the default `identity-01`. Candidate capture overwrites that label's render directory/state file, while `finalize` uses `next(...)` and selects the first matching candidate. Thus final native and displayed candidate images can refer to different revisions. | Reject duplicate labels before executing, or allocate unique labels and select by unique revision. |
| Replay provenance | `examples/automail-arm/run_construction.py`, initial timing record | Without an explicit start argument, `authoring_start_source` embeds the fixed historical timestamp `2026-11-22T12:10:44+00:00`. Future replays would repeat a claim about a clock read that never happened in that replay. | Keep the session-specific timestamp in the actual evidence. Generic runner fallback should report unavailable/execution-only timing using current runtime information. |
| Replay provenance | `examples/uniform-jacket/run_identity.py`, later-stage input handling | `original_inputs` records the first invocation's source/native paths and hashes, but later candidate stages load the newly supplied `--input-blend` argument. A different path/file can be used without validating it against the recorded baseline; the final unchanged-input assertion still checks only the original path. | Validate the supplied native hash against the recorded baseline before running, or always consume a frozen baseline capture. |

All four issues were sent promptly to root. The actual current garment
invocation appeared to use the intended source; the last finding described a
reproducibility hole, not proof of mixed current evidence.

### Findings that were satisfactory in the available garment code

- Original material datablocks are copied before the new cloth/strap/embroidery
  settings are applied, and all original material states are checked afterward.
- Body face topology is preserved; the two shared armhole seams are explicitly
  verified.
- Intended changed/removed objects are enumerated, and protected existing
  objects must retain their fingerprints.
- Cuff object names and edit roles remain available. Finalization checks a
  1 cm band change, seven changed objects, unchanged protected objects/materials,
  and exact restored artifact/input hashes.
- Existing fixed whole/collar views plus the added ornament view are used for
  both baseline and candidate, and recorded observation metadata is compared.
- Independent native reopening and GLB import are actually invoked; selected
  topology, hierarchy, transforms and bounds are checked, then an imported GLB
  observation is rendered.
- I did not find a concrete transform/pivot regression for the supplied fixed
  garment baseline. The replacement helpers retain existing object transforms,
  and the affected pre-existing meshes are authored in the matching coordinate
  frame.

### Remaining review scope at that time

At the last inspection of the initial pass, the following files were not yet
present:

- `examples/automail-arm/inspect_construction.py`
- `examples/automail-arm/construction_pose_check.py`

These needed review once written. In particular, they needed to substantiate
the authoring report's claims that all original pivot origins, hierarchy,
material datablocks and transforms except the two crown markings remained
unchanged, including for existing objects whose geometry was intentionally
replaced. The runner's protected-object comparison excluded intentionally
changed objects, so it alone could not establish that stronger transform/parent
preservation claim.

The new automail geometry intended to convert world-space vertices through
each existing object's inverse matrix, retain existing parentage and add new
pieces under explicit segment parents. Full correctness remained contingent
on repairing mesh creation and examining the final inspectors/actual execution
output.
