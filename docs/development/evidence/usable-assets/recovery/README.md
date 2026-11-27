# Interrupted usable-assets work: recovery and continuation

## What was actually retained

On 2026-11-23 (Asia/Seoul), the user supplied the interrupted execution log and
asked to check completion and continue unfinished work. Remote `rewrite/v2`
was at `f236477fe91b2fcb8453fcbc0cc55c91df0edacc`; PR #399 remained Draft.
Both workflows associated with that head completed successfully: Production
run 45034161032 and RefAs CI run 45034161020. The PR description and Notion
still described older checkpoints; they were not evidence of a later model.

The remote commit retains the mesh helper, animation/export fixes, actual
90-test production execution, installed 19-file package/recovery exercise,
and the recorded arm consumer observations. It does not contain the later
asset-authoring scripts or selected model bytes reported in the interrupted
log. The available local checkout was an older `23f9e2b` snapshot. No previous
asset build was still running.

The durable `refas-source-identity-models.zip` was recovered and all 96 manifest
entries verified. The exact jacket identity-04 and arm candidate-05 native
inputs and the original character VRM are recorded by SHA-256 in
[source-recovery.json](source-recovery.json). These are the last recoverable
model checkpoint, preceding the interrupted wearing/optimization work.

The reported 78,998-triangle arm and 97-frame jacket are historical claims from
that interrupted work, not recovered current candidates. New model construction
is explicitly a continuation from the saved source-identity checkpoint. New
counts, images and acceptance decisions must come from its actual outputs.

## Completed missing consumer option

The existing Godot observer already had a separate internal skin-position
threshold, but its public Python runner did not expose it. The interrupted
log's positive vertex-tolerance CLI change was absent from the remote head.

`--vertex-tolerance` now selects a finite, strictly positive distance in meters.
The default stays 20 micrometers. Matrix-element `--tolerance` remains separate
and now rejects nonfinite or nonpositive values too. Invalid CLI inputs fail
before creating output. Godot records the selected matrix, skin-position and
rest-association thresholds in its result, and rejects invalid direct settings.

Actual deformation uses the raw imported weights. This option does not change
the 10-micrometer default rest association, normalize deformation error, or
grant collision, attachment or visual acceptance. A custom asset precision
budget requires a recorded rationale; the observer never raises it automatically.

The real Blender-to-GLB-to-Godot regression confirms that a declared 50-micrometer
budget retains a measured 30-micrometer difference, still rejects an actual GLB
with corrupted skin weights, and leaves wrong-bone matrix rejection intact.
This is a deliberately changed expectation fixture, not a new measurement of
the missing jacket candidate.

## Continued observer repair: two imported rigs

The new garment prototype contains the unchanged avatar rig and a separate
rigid-hardware rig. Godot imports both with the name `Skeleton3D`; the original
observer correctly refused that ambiguous bare selector but could not yet accept
an explicit path. It now supports exact scene-relative paths and reports them
in the skeleton inventory. The real paths are `./Rig/Skeleton3D` and
`./JacketHardwareRig/Skeleton3D`. Ambiguous bare names remain errors.

Rest-point association now computes each surface's positions once per sample,
then clears that cache after the next animation seek. Actual deformation still
uses the current pose and raw consumer weights. The actual two-rig fixture,
later-introduced probe, and persistent failed-association controls all pass.
The complete [Production suite](multi-rig-consumer-checks/summary.json) now has
**95 passing tests, zero failures or skips**, including 13 actual consumer
regressions. The [independent review](review-observer-paths-cache.md) records
the exact source hashes and real-model observations.

The rejected prototype's 30-point/five-pose observation now completes in
24.354 seconds, where repeated association previously timed out at 120 seconds.
All 25 bone matrices and 150 vertex associations succeed. Its raw cloth skin
positions still fail the unchanged 20 µm default, reaching 65.733 µm. This is
retained negative evidence, not garment acceptance or an efficiency benchmark.

Direct comparison of decoded FLOAT GLB weights with actual Godot arrays explains
the discrepancy: the consumer packs coefficients as UNORM16, and its raw sums
can be below one. Weight packing predicts 65.750 µm; retaining the same engine
transforms with decoded source coefficients in a diagnostic calculation leaves
at most 0.519 µm. Actual playback is never replaced by that counterfactual.

The independently reviewed [precision rationale](review-consumer-precision-profile.md)
supports an explicit [100 µm garment consumer profile](../garment-resume/consumer-precision-profile.json)
frozen before final selection. The sampled four-coefficient storage envelope
plus residuals is 91.860 µm. Final 97-frame weight/term bounds must be recomputed,
and the original strict result must be retained. An actual exported wrong-weight
control still fails this profile, with 19.8–46.8 mm errors; see the
[control summary](consumer-precision/control-summary.json). Native geometry,
attachment, fit, visual and source-preservation acceptance remain separate.

The observer continuation also repeats all five
[required repository gates](continuation-required-gates/summary.json):
935 JavaScript tests pass, the legacy dogfood retains 11 checkpoints, and the
installed package audit retains the same 19-file distribution. These checks
do not accept the still-unfinished garment.

## Initial continuation verification

[Production execution](checks/production.summary.json): 92 passed, zero failed
or skipped, with actual Blender 4.3.2 and Godot 4.7.2. The command record retains
UTC clocks, selected environment and hashes of the four changed observer files.
The actual stdout and stderr are retained alongside it.

[Required repository gates](checks/required-gates.json) records independent
commands and exit status. JavaScript regression passed all 935 tests with zero
failed/skipped tests. These checks demonstrate runtime/repository behavior;
they do not substitute for actual selected-asset visual or usage review.

## Recovery boundary and acceptance

Rollback is the unchanged remote runtime at `f236477f` plus the hash-verified
source-identity model inputs. Existing failed trials and earlier reports remain
unchanged. New scripts, commands, candidate models and rejected iterations are
retained with the continuation rather than being described as the old lost work.

The initial recovery kept the fixed checklist at 28/37 (76%). The independently
reviewed new arm now supports U4/U5, bringing the ledger to 30/37 (81%). Its
[report](../automail-resume/README.md) and [durable delivery](../automail-resume/delivery-archive.json)
identify the exact selected bytes. U2/U3/U6 remain open because the garment is
still rejected; a distance-only passing intermediate is not a selected asset. Matched
three-condition comparison U1, measured comparable time/cost E2, main merge D2
and publication D3 remain separate open requirements. No release is implied.
