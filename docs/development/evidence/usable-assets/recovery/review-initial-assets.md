# Independent recovery asset review — initial construction

Reviewed UTC: 2026-11-22T18:58:23.354438+00:00. Base runtime: `f236477fe91b2fcb8453fcbc0cc55c91df0edacc`.
This is an informed independent code/source review of unfinished recovered
continuations. It is not a blind comparison, a claim that missing prior models
were restored, or final candidate acceptance. The reviewer did not run or edit
author-owned scripts. Both original whole reference sheets were opened visually.

## Decision

Keep U2–U6 pending candidate freeze and independent native/export/render
inspection. The current production-runtime regression passes separately; it
does not establish these asset criteria.

## Jacket findings

1. **Current candidate is observably unsuccessful.** Retained
   `work/garment/candidate-02/inspection/inspection.json` reports 3,726 triangle
   intersection pairs at frame 1 and 5,156 at frame 49 against the actual body
   and shirt. These are pair counts, not a count of independent defects. The
   artifact is a failed intermediate, not accepted wearing evidence.
2. **Rigid metal is not yet an attachment guarantee.** Per-connected-component
   one-bone weights prevent internal nonrigid deformation, but adjacent chain
   links or chain endpoints assigned to different bones can separate or collide.
   The current authoring code does not bake a two-end chain path despite the
   preselection scope mentioning baked chain motion. Inspect evaluated
   consecutive-link and terminal attachment distances across the declared
   shoulder/spine motion, and use actual chain motion if necessary.
3. **The collision scope currently omits relevant geometry.** Inspection checks
   garment body/collar against `Body.001` and `Outfit:dress-shirt`. The actual
   `Outfit:vest-suspender` is used during fitting but omitted from these checks.
   Cuffs, straps and metal attachments also need either direct checks or
   explicit intended-contact exemptions tied to actual parts.
4. **Preservation evidence must match its claim.** Current avatar fingerprints
   include local mesh coordinates, polygons, weights and vertex group names.
   They do not cover material assignments/properties, rest-bone state or object
   transforms. No code alteration of those values was observed in this read,
   but preservation of them must be verified before claiming unchanged full
   character data. Disposable neutral render overrides are explicitly separate.
5. **Current surface budget is exceeded.** The fixed cloth budget is 1.5 mm.
   The candidate-02 sampled body high-to-low maximum is approximately 2.086 mm;
   collar low-to-high is 24.067 mm. Inspect the exact corresponding surfaces
   before accepting a topology or modifier reduction. The whole geometry count
   is 514,366 detailed to 123,538 optimized triangles, which by itself does not
   remedy the shape or wearing failures. Existing surface samples cover
   vertices, not an exhaustive Hausdorff bound.

The actual recovered avatar inventory contains `Body.001`; therefore the
current `Body.` prefix is matched for this input. It is not being reported as
an observed missing-body defect. Final evidence should still pin exact targets.

## Automail findings and required closure

The script fixes budgets before selection, keeps a detailed functional source,
and creates constant-length housing/rod parts with measured two-anchor travel.
Its palm section-ring rebuild is explicitly separated from hardware decimation.
Those are appropriate implementation choices, subject to actual geometry review.

- The scalar rod/housing overlap proves telescoping retention only. Check the
  spanning links against surrounding casings and hand/finger geometry through
  the declared 121 poses; do not infer collision clearance from that scalar.
- Consolidation retains source part names per delivery mesh. Also retain actual
  source-face/triangle correspondence or an independently verified geometry
  mapping to distinguish GLB UV/normal splits from holes and winding defects.
  Name provenance alone is not mesh-condition evidence.
- Consumer probes must include the moving link parts, wrist, each finger and
  thumb rather than only the elbow. The shoulder remains fixed in this clip;
  state that limited useful reach/grip scope explicitly.
- Confirm the real Blender execution uses the requested two threads; the thin
  runner does not independently set it. This is a resource check, not a model
  quality finding.

## Reviewed sources

| File | SHA-256 |
| --- | --- |
| `examples/automail-arm/build_usable.py` | `d09c0212f135d297907a305143680082b907b2a8bf5a8d931cb3ebe50fee746e` |
| `examples/automail-arm/run_usable.py` | `6b50c568fdf5950db49975aa7c7d7e856b655d9cc4d4336afaa1b2772b36ac5f` |
| `examples/uniform-jacket/build_wearable.py` | `9d1ec60662bca83a9d56a3507afa24341edaa7ec815cf3296fa1f2fc07e457b5` |
| `examples/uniform-jacket/inspect_wearable.py` | `9e89be85fe899f4641a9b1a5be136577322fea06138abfa4cb4da4122ac2f0da` |
| `examples/uniform-jacket/inspect_wearable_inputs.py` | `7c71cf5db6af64199b6255aff02dcbd01b77aad45355bdbda1af259b661d66c2` |
| `examples/uniform-jacket/render_wearable.py` | `b7da17087c324a8ada579b03e2e44b326c1372888b8106a8e660634dc69af02f` |
| `examples/automail-arm/source/reference.png` | `3c7856dd632f8a1cde8036078573f569db55b6af97fae853237d8a9356f3c872` |
| `examples/uniform-jacket/source/reference.png` | `d8b85deb544c58009823ed8ed1478f20389c7a57cedc40870f64046cce76c7c5` |

## Follow-up

Findings were sent directly to both authors and the root owner before selection.
A later addendum must name the actual frozen native/GLB hashes, source-bound
whole/detail renders, geometry/attachment probes, and per-criterion decision.
Earlier failed candidates and this initial review remain retained.
