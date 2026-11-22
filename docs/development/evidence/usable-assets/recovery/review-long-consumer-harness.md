# Independent review of the 97-frame consumer harness

Reviewed `work/garment/consumer-precision/run_playback.py` against the repository's
`examples/engine-playback/run.py` and unchanged `verify_godot.gd`. Source hashes
are retained in `review-long-consumer-harness.json`. This is a source review;
the final 97-frame consumer run has not yet occurred.

The harness imports the exact repository `convert` and `point` helpers. It
preserves every supplied object matrix, bone matrix and skin point, including
their node names, labels, native expected coordinates and initial association
positions. It requires all 97 consecutive frames at 30 fps and consistent probe
identities across samples. No frame is omitted or resampled by this wrapper.

The matrix threshold stays 2e-5. The rest association distance remains the
observer's unchanged default of 10 µm. The CLI permits only the strict 20 µm or
explicit 100 µm skin budgets. Expected triangle and skinned-mesh counts are passed
through. Actual raw-weight evaluation and observer acceptance remain unchanged.

The process deadline is recorded as 900 seconds rather than the short example's
120 seconds. Expiry records timeout status, stdout/stderr and exit code 124.
Input asset, native inspection, repository runner, observer and harness hashes
are captured before execution and compared afterward. The wrapper adds these
scope/identity guards; it does not trade execution time for looser geometry or
precision criteria.

The accompanying `inspect_skin_precision.py` changes were also reviewed against
the previous fixed diagnostic. Its limitation now reports the actual associated
point count and supplied pose count, and its scope no longer incorrectly labels
every future input as the rejected prototype. It explicitly requires four
imported influence slots and finite coefficients between zero and one. The raw
consumer reconstruction, decoded-source counterfactual and coefficient bounds
are otherwise unchanged. Counterfactual source coefficients remain diagnostic;
actual consumer playback is not normalized or rewritten.

No hidden threshold alteration, probe omission or coordinate-conversion change
was found. No broad tests, engine execution or source edits were performed for
this review. Final timing, all-probe completion, actual profile bounds and the
lining-patch check still depend on the frozen final asset's real execution.
