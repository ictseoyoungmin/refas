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

## Verification

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

The fixed checklist currently remains 28/37 (76%). U2–U6 receive credit only
when their complete stated asset evidence passes independent review. Matched
three-condition comparison U1, measured comparable time/cost E2, main merge D2
and publication D3 remain separate open requirements. No release is implied.
