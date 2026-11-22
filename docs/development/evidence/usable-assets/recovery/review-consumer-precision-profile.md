# Independent review of the jacket's consumer precision profile

The retained five-pose negative fixture supports a declared **100 µm skin
position profile for the tested Godot 4.7.2 / four-influence scope**, subject to
revalidation on the final exported asset. It does not justify increasing the
observer's default threshold or accepting the current rejected garment.

## Evidence checked

I read `root_quantization_dump.gd` and `root_analyze_quantization.py`, then
independently compared their saved data to the strict observer configuration
and result. The raw dump pins the exact same configuration and observation
hashes. All 150 dumped actual coordinates equal the strict observer's output
exactly; native expected coordinates match the configuration within
5.11e-15 m. The 30 source points are identified by original GLB positions and
bone identities. Normal/UV duplicates are admitted only when their complete
source weight dictionaries agree, avoiding an error-fitted choice.

Every sampled point has four imported influence slots. The source weight
accessors are FLOAT values; source sums range from 0.9999999732 to 1.0000000671.
Their local position mapping error is at most 5.12e-15 m. Every imported packed
coefficient has the integer value `floor(sourceWeight * 65535)`. All actual
coefficient differences remain within one `1/65535` step.

The diagnostic uses the same current Godot bone, inverse-bind and morph terms
for both calculations. It changes only the coefficients in a counterfactual
calculation; it does not normalize delivered playback or fit coefficients to
the native error. The measured **65.733 µm** maximum native discrepancy agrees
with the **65.750 µm** predicted weight-packing displacement. Substituting the
decoded source coefficients leaves at most **0.519 µm** residual. Reconstructing
the engine's raw weighted arithmetic in float64 differs by at most **0.127 µm**.

## Bound and limits

For fixed sampled transforms and morph position, the displacement caused by
coefficient changes obeys the triangle inequality:

`error <= sum(abs(consumerWeight - sourceWeight) * transformedTermLength)`.

With four slots and at most one UNORM16 step per coefficient, a conservative
envelope is `4 * largestTransformedTermLength / 65535`. Its maximum over these
150 observations is **91.215 µm**. Adding the observed source-weight residual
and arithmetic residual produces **91.860 µm**, below the proposed 100 µm
profile. Every individually predicted displacement also satisfies its exact
coefficient-difference bound.

This is a point-and-pose-scoped result. The transformed terms, source weights
and even their count can change with another asset, skeleton, coordinate frame
or gesture. These five poses do not establish a universal engine limit or an
all-vertex bound.

For final use, freeze the explicit 100 µm profile before candidate selection,
recompute the coefficient and term-norm envelope on the final 97-frame probe
scope, and retain an actual-weight-corruption negative control whose error
exceeds 100 µm. A new larger measured bound requires review rather than an
automatic tolerance increase. Preserve the original strict 20 µm failures.
Matrix tolerance remains 2e-5 and association distance remains 10 µm. Actual
deformation must continue using unnormalized imported consumer weights.

No observer source, asset bytes or acceptance threshold was changed during
this review. Source hashes and independently checked numerical facts are in
`review-consumer-precision-profile.json`; raw asset diagnostics remain private
workspace evidence. This review grants no geometry, motion-range or final
garment acceptance.
