# Uniform jacket: separate armhole follow-up

## Scope and result

This work is an **informed follow-up to the completed production trial**, not another blind attempt. It is excluded from the initial trial timing and comparisons. All twelve original trial artifacts covered by the initial report's hashes still match exactly. Only `/tmp/refas-jacket-followup` was written.

The new candidate closes the dominant sleeve/body gaps through actual shared mesh boundaries and fits the existing shoulder tabs to the cloth. One geometry correction revision was sufficient; there was no second correction. Six fixed orthographic views were rendered and inspected. An unchanged starting candidate was also rendered with the identical review JSON to provide a direct before/after comparison.

- Native candidate: **candidate.blend**
- GLB: **candidate.glb**
- Construction: **correction.py**
- Before/after PNGs: **renders/before** and **renders/after**
- Selected revision: `2e8ebbe18a9a48ecac8c115bbb735ded`

The follow-up began at **2026-11-21T19:04:19+00:00** and ended at **2026-11-21T19:10:22.472668+00:00**, approximately **363.5 seconds**. The live native correction run took 26.756 seconds; the diagnostic-only unchanged baseline run took 22.086 seconds. No runtime failure occurred.

## What changed

The initial body had two actual open armhole loops, each containing 42 edges, while the sleeves used unrelated cap borders. I extracted those loops and built rounded sleeve caps whose root faces use the **same vertex indices as the body boundary**. Their lower ends connect to the retained sleeve tubes. All **84 armhole seam edges now belong to exactly two faces**. The result is one continuous cloth surface through the torso and sleeves, rather than a covering strip hiding a view-dependent crack.

All 970 original body cage vertices were retained. From the s=0.14 m ring down, 440 sleeve cage vertices per side were copied unchanged into the connected shell. The previous two sleeve objects and their obsolete sewn-cap line objects were removed; named left/right sleeve vertex groups preserve region selection. Subdivision and thickness modifiers remain editable. The unified shell uses subdivision level two, so the evaluated body surface receives an additional smoothing level compared with the original level-one body.

The shoulder tab, pale edge and button on each side were fitted onto the evaluated shoulder surface with downward surface queries. Their geometry follows the garment instead of hovering above the yoke.

## Protected parts

The correction's before/after fingerprints confirm:

- **266 protected objects unchanged**, with no unexpected changed or deleted object.
- Every cuff band, cuff piping object, buckle, strap and rivet unchanged under the same names.
- All chain and shield decoration unchanged.
- All materials unchanged.
- Lapels, collar, body piping, waist buckles and rear belt unchanged as separate protected objects.
- Overall exported asset bounds unchanged.

These checks preserve the existing cuff editing approach: the separately named cuff band, proximal/distal piping and hardware are still available with identical geometry and materials. The former separate sleeves are now editable vertex groups in the body object.

The original candidate's scene fingerprint matches the diagnostic baseline fingerprint. `produce.py verify` passed recorded-file integrity for **10 current artifacts**. It does not certify appearance, topology quality or engine readiness.

## Fixed-view observations

| View | Before | After |
|---|---|---|
| Front | Open shoulder cracks; tabs elevated above body. | Continuous shoulders; tabs fitted to cloth. Open front remains. |
| Back | Wide discontinuity between body and sleeve caps. | Gaps closed; underarm curvature shows pinching. |
| Front three-quarter | Detached sleeve shell is visible through the open front. | Connected sleeve/body shell, with the intended hollow interior still open. |
| Rear three-quarter | Cap and body separate at the shoulder. | Connected silhouette and surface; underarm folds are still too abrupt. |
| Left/right | Discontinuous root/tab placement. | Root joins the yoke and tabs follow the shoulder; cuffs remain open. |

The same review.json freezes all six camera positions, orthographic scale, light centre/radius and render framing. Both sets use 512×512 pixels and 24 samples. The correction was selected because the gap and floating-tab defects visibly improve under those views, supported by actual shared-edge topology. No numerical likeness score or general workflow claim was made.

## Residual problems

The most visible new limitation is **underarm pinching**, especially from the back. The connected cap surfaces need further tailoring refinement even though they no longer have gaps. The cloth is still brighter and more blue-grey than the source black fabric under these lights; materials were preserved. The stiff collar/lapels, approximate decoration and chain routing, front buckle seating and weak rear ornament visibility remain from the initial prototype.

No production cloth UV unwrap, rig, deformation test, simulation or engine test was added. The 24-sample diagnostic renders retain visible grain. This is a demonstrably improved garment prototype, not a production-readiness claim.

The evaluated asset now contains 273 mesh objects and 189,172 triangles. The object count decreased by four because sleeve surfaces were joined and obsolete cap seam objects removed. Cuffs and decoration remain separate.

## Reproduction and evidence

Full commands and hashes are in report.json. correction.py operates on the initial-trial candidate through the live production runner's `--input-blend`, and `--review-spec` captures the supplied fixed camera/lighting file. The project and baseline-project directories retain native run history, copied inputs, output GLBs and rendered PNGs. protected-checks.json contains the before/after object fingerprints and shared-edge checks; initial-trial-preservation.json records unchanged initial artifacts.
