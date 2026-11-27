# Source-identity review addendum: final helpers and executed evidence

**Source snapshot:** `2026-11-22T12:37:29.305403+00:00` (2026-11-22 21:37 KST).
The evidence read began at `2026-11-22T12:35:18.609573+00:00`.
This narrow addendum follows [code-review-final.md](code-review-final.md).
It reviews new or changed validation, selection and packaging logic, and reads
the completed execution records. It makes no visual judgment. No Blender
process was launched by the reviewer, and no implementation was changed.

## Decision

**No unresolved blocking correctness issue remains in this scoped source
snapshot.** The previously pending native/GLB inspections, local-edit recovery
and readback render commands now have successful recorded executions. Their
selected file identities were checked as described below.

One new packaging evidence-binding gap was found, reported, and repaired before
this snapshot. The initial four findings and the later all-original
preservation/neutral-selection repairs remain resolved. This is not an art
approval, a universal topology/collision guarantee, or completion of the fair
timing/cost comparison.

## New finding and observed repair

The new `package_construction.py` initially accepted an inspector's `passed`
flag and the exercise's restoration flag without checking that those reports
belonged to the latest selected files. A failed new inspection could leave an
older passing report beside newer selected files. Although the actual final
files and reports checked here matched, the replay path could have accepted
stale evidence.

The author added three guards before any delivery copy:

- `exercise.selected_revision` must equal the latest candidate revision.
- The inspection's native SHA-256 must equal the selected native's SHA-256.
- The inspection's GLB SHA-256 must equal the selected GLB's SHA-256.

The existing selected-versus-latest native/GLB equality checks remain. The
reviewer read the concrete guards in the final file and independently confirmed
that the actual current report/native/GLB identities agree. No Blender rerun
was needed for this packaging correction. The author's final materialization
execution and whole-delivery manifest remain the packaging evidence; this
review did not perform an additional packaging run.

## Garment additions

### Independent identity helper

`inspect_identity.py` runs the existing `inspect_fold.py` in the fresh Blender
inspection process, preserving its native topology/shared-seam and independent
GLB checks. It then reopens selected, baseline and optional prior native files.
The baseline comparison verifies exact body face-index topology and the
declared nominal dimension metadata. It records the actual maximum body cage
displacement; metadata equality is not presented as a fresh physical dimension
measurement.

The optional prior comparison canonicalizes each face by cyclic starting index
and sorts faces while retaining winding, actual vertex indices, coordinates,
material indices and smooth flags. This addresses differing polygon allocation
order in the newly authored UV-sphere beads without tolerating different
geometry. It requires the only differing mesh in this last correction to be
`L Identity | front lower draped chain`.

The canonical comparison includes object world matrices, material-slot names
and the listed modifier properties. It does not by itself compare every
material datablock value or every possible modifier property. To check the
actual material claim, the reviewer separately compared used-material
fingerprints in the prior and selected runtime scene observations: no changed
material fingerprints or newly added material names were found.

`run_identity.py` now passes the original native and an explicitly resolved
optional prior candidate to this helper. The prior label is checked before
execution, and the unique-label/source-hash guards remain. The runner invokes
the helper with `--python-exit-code 1` and rejects a nonzero process result
before using its JSON. It captures the helper and its established dependency
in reproduction files. The saved imported GLB native is still the input to
the actual readback-render phase.

### Review-board helper

`compose_identity_review.py` reads matching before/after PNGs, checks equal
dimensions, and alpha-composites them onto a labeled neutral board. It does
not change the source render files or produce new geometry/render evidence.
Its labels explicitly state that these are unregistered source comparisons.
This review assessed that data flow only, not the appearance of the board or
the assets.

## Arm validation changes

`inspect_construction.py` is byte-identical to the independently reviewed final
inspector snapshot. Its all-original native identity/material checks, fresh
GLB import, panel displacement, hierarchy and centroid-orbit checks were not
replaced by self-reported authoring values.

`construction_pose_check.py` now extends the named shell intersection sample
to include the new upper carriers and forearm underlayers. It builds evaluated
world-space triangle BVHs at the actual sampled pose, records the pair count
and intersections, and includes absence of those named intersections in its
`passed` condition. The original bounded centroid-motion and declared-parent
checks remain. The explicit limitations still exclude containment, all-object
and continuous collision claims.

The arm runner retains explicit candidate selection and pre-exercise payload
equality. Its new package phase invokes the packager, then copies the completed
command record and refreshes the delivery manifest so the just-finished
packaging command is included. The final artifact/source identities must still
be read from that delivery manifest rather than inferred from an earlier
manifest version.

The geometry script changed after the prior review to address degenerate bevel
faces. This addendum does not repeat its visual review. It checks the resulting
topology observations and relevant retained validation paths.

## Executed evidence now observed

### Garment identity-04

The recorded selected revision is `d83189287d4d458397b05534083f00e1`; the restored
revision is `749d1f1433e3454f8ba83799fca905d9`.

The actual `independent-native-glb` command invokes `inspect_identity.py` with
the baseline and prior native arguments and exits 0. The subsequent actual
GLB readback-render command also exits 0. Its report records:

- 100 native/imported mesh objects, matching names and parents.
- 493,958 native and imported GLB triangles.
- Maximum matrix error `1.6858739826375313e-7` and maximum bounds error
  `1.862645149230957e-9` metres.
- Exact original body cage face topology, the declared 0.38/0.42/0.58 m nominal
  metadata, and maximum cage displacement about 0.0144813 m.
- Both original 40-edge armhole seams, with every checked seam edge shared by
  two faces; the inspected evaluated body/collar meshes have no reported
  boundary, greater-than-two-face edge or zero-area-face defects.
- The last correction changes the lower front draped chain, with 99 other mesh
  states canonically unchanged in the declared scope.

The cuff exercise records a measured increase of `0.010000010399380699` m,
seven changed cuff objects and 92 protected non-cuff objects. The reviewer
independently rehashed all **18 selected artifact/input files** and all 18
restored counterparts: both sets match the recorded selected hashes. The
delivered native/GLB also match that selected revision.

### Arm candidate-05

`latest-candidate.json` and `exercise-summary.json` both identify selected
revision `e661b5fd53e447879bd4baff5f4bbb9f`; the restored revision is
`041215ef5be3467fa64df97041c9a5ee`.

The independent native/GLB inspection and later actual readback-render
commands exit 0. The selected native hash equals the inspector's recorded
native hash, and the selected GLB hash equals its GLB hash. The executed
inspector records:

- All 300 original asset objects and 20 original pivots checked; no unexpected
  original identity changes.
- All 10 original material datablock snapshots preserved; intentional
  assignment changes on rebuilt pieces are listed separately.
- Required parent relations pass, with no missing/extra imported nodes,
  parent mismatches or matrix errors above the declared tolerance.
- Maximum bounds error `4.248876570023263e-9` m.
- 26 cover-subtree nodes pass the independent exported +3 mm exercise, with no
  unrelated node changes. The native local-edit record separately confirms
  315 unrelated objects unchanged and no geometry/material/modifier/parent
  changes.
- 132 named neutral lid/rib-versus-cartridge surface pairs have no reported
  triangle intersections.
- Four native pose samples each check 41 added meshes and 72 named upper/
  forearm shell-and-carrier pairs, with no recorded parent or named
  intersection failures. The largest reported new-component centroid error is
  about `9.431681708374741e-8` m.
- Six independent exported single-pivot samples pass their declared centroid
  and unrelated-node checks.

The 216 inspected changed/added meshes have zero reported degenerate faces.
The only nonzero open/nonmanifold edge rows are the two retained crown lettering
objects. Therefore the successful overall inspection must not be described as
an all-mesh watertightness pass.

Both restore flags are true in the executed exercise record. The reviewer
independently rehashed the **19-file selected artifact/input bundle** and the
restored bundle and confirmed equality with the recorded hashes.

## Source files and hashes

All Python files listed were parsed successfully with `ast.parse`; that check
is not substituted for the separately recorded Blender executions.

| File | SHA-256 at this snapshot |
| --- | --- |
| `examples/uniform-jacket/run_identity.py` | `164412013eea57973546ad49595a0ed0bcfe74e423ee023bb0731e82e9cce65c` |
| `examples/uniform-jacket/inspect_identity.py` | `ca83cb707270ddf5729769a1e119e0c32637354168d30f6f23ec182336425cc5` |
| `examples/uniform-jacket/compose_identity_review.py` | `b518ae470928fc2948f01b6dbd3dd102f522b78b0e6cd81a4c2d8ebae19bb6f6` |
| `examples/automail-arm/refine_construction.py` | `f63acc198938757f4eae7057201db93fcb1b40320ede59ba722e0019c4b9be42` |
| `examples/automail-arm/run_construction.py` | `c24196675d33567efc2c5d3994e46f8300cfbe6b125c8681f5440921f9c67744` |
| `examples/automail-arm/inspect_construction.py` | `467984254cc34acb642de23d3ca44e6f37c8469783c5b604407c49f80d4aec32` |
| `examples/automail-arm/construction_pose_check.py` | `2655c7f9b82a9eae2f6b48fc67a991a950e35bfa38f436ca9826f82cf0ed8e01` |
| `examples/automail-arm/package_construction.py` | `adc3ec2784298351ced2b7c12c6987fdf9fd63801e9ea48d37a6f77a0f556803` |

The garment geometry script remains byte-identical to the previous snapshot:
`2906c70eaa0aa5a82961c6d59b408d907eadc035eae86b9e2afbfdf859537abd`.

## Read execution-record identities

Paths below are relative to the session's `work/` directory; they identify the
actual records read, independent of any later copying into delivery evidence.

| Record/file | SHA-256 |
| --- | --- |
| `garment/independent-check.json` | `b9ad8cad034fd5541d763192f14191cff90d3051406df7109c19c33dfb03a8e8` |
| `automail/independent-inspection.json` | `e0fdc5a9f0dc7ac7b81c9edc8d50aef74b717891869d0ec9b781df41ea8543ca` |
| `automail/exercise-summary.json` | `71eff3474df4083086f546e928c525c474d5854ba922c1f386b8223e0ed3eb23` |
| `garment/native.blend` | `528a8b67b2cd74dd5724225a6da4065281f6cfdf033d52a0b28123eab804cafd` |
| `garment/native.glb` | `0c1fe855873c220025ed1016598b1dd00b514f38f26d0b8d111101505971888a` |
| Arm selected `native.blend` | `e7b2ac7cbd671d979af6e178ec85efc574ad9860c9695000980cf4a29f8a2dd7` |
| Arm selected `asset.glb` | `0c2ca4c96351a1fdac73af9b5c2f1f854132b1df4855651dfdb53f188bc65f19` |

The remaining visual acceptance, design progress decision and final delivery
manifest belong to their separate review and packaging records. This addendum
does not convert successful technical exercises into source resemblance,
physical feasibility, engine readiness or a controlled cost advantage.
