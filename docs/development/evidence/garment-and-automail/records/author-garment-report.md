# Uniform jacket — informed refinement and recovery report

## Selected outcome and scope

The selected native refinement is `9fe00caf1e1649a58554b3a761ee7bbb`. The original native source and original design sheet bytes are unchanged. The selected garment has substantially smoother shoulder/underarm transitions, a fitted continuous torso, a physical collar turn and curved lapel facings, dark main fabric, and preserved left-side ornament and cuff assemblies. It remains a garment prototype. The collar/notch does not yet reproduce the source's supple tailoring exactly.

This is an **informed follow-up**, starting from the earlier shared-armhole native prototype. It is not a fresh/blind generalization test or a new fair three-condition comparison. Root feedback on the broken pale back seam traces was incorporated and retained separately.

- UTC start before guidance: **2026-11-21T21:19:47+00:00**.
- UTC report end: **2026-11-21T21:42:41.327317+00:00**.
- Recorded wall time: **22.91 minutes**.
- Blender: **4.3.2**, `/usr/bin/blender`.
- All visible evidence is actual Blender output. No generated replacement image or reference texture projection was used.

## Deliverables

- `candidate.blend` and `candidate.glb`: selected refinement.
- `cuff-edited.blend` and `cuff-edited.glb`: the separate wearer-left 7 cm cuff exercise.
- `restored.blend` and `restored.glb`: exact selected bytes after CLI restore.
- `baseline.blend` and `baseline.glb`: first imported baseline output.
- `renders/before`, `renders/after`, `renders/cuff-edited`: actual six-view PNGs.
- `project`: complete revision/run history, including the first baseline, every correction candidate and the failed authoring run.
- `scripts`: reusable ordinary Blender scripts, public CLI runner, unchanged review specification and original reference copies.
- `execution.json`, `independent-inspection.json`, `report.json`: detailed command, preservation, geometry and recovery evidence.
- `reproduction-final`: clean end-to-end reproduction from the original native input.

## Reference observations and construction decisions

The original full sheet was inspected first. The baseline already joined the body and sleeves, but the back view exposed deep triangular pinches below the shoulder caps, the neck was mostly a cylinder, and the front collar/lapels read as flat folded sheets. The cloth read grey under the fixed light rig.

The shell was rebuilt around **two shared 40-edge armhole loops** with the same correspondence into each sleeve. Five broad cap rows distribute the turn; three shoulder rows connect toward the neck. This replaces the old 42-to-40 zipper and its concentrated turn. The first geometry correction showed the smoother cap while the material was still grey, so the improvement did not depend on darkening fabric.

The torso opening was fitted underneath the facings. A connected collar strip rises from the neck stand, rounds over the roll and turns outward. The final front endpoints sit lower and farther outward than the first collar attempt. The leaf is seated outside the evaluated upper chest and above the shoulders. The lapels are curved facing strips with a real softened roll; piping follows those surfaces.

The shoulder tabs were fitted onto the new surface. Lapel snaps were repositioned onto their faces. The old back seam tubes initially became broken bright marks when each tube vertex was projected separately. That approach was replaced by projected **centerlines** with newly generated round, dark thread tubes. The original left shield, chains, tassels, cuff assemblies and waist hardware were retained.

The main cloth, lining and tonal thread were deliberately adjusted. The Main base color is the linear conversion of `#1A1A1F` multiplied by **0.20**, with roughness 0.85, specular IOR level 0.018 and no sheen. This is a disclosed appearance adjustment for the bright fixed rig; it is not calibrated physical reflectance. The lining's satin glare and thread brightness were reduced. **Strap, piping and hardware material fingerprints remain unchanged.** Review exposure, lights and cameras were not edited.

## Fixed review and retained iterations

The unchanged `review.json` supplied six orthographic views at **512 × 512, 16 samples**. Before/after camera, light, renderer, reference-region and registration metadata match exactly. The source regions are provenance only: these are unregistered views, not a calibrated likeness score.

| Revision | Operation | Observation / disposition |
|---|---|---|
| `e24b94fb37b5` | Imported source baseline; fixed six-view inspection before refinement | Unedited imported baseline. Shared armholes already exist; rear cap/underarm tangents visibly pinch. Stand is cylindrical and front collar extensions planar. |
| `0719aea93331` | Rebuild fitted continuous torso and rounded matched sleeve caps; preserve cuff and ornament identity | First rebuilt shell. Matched 40-edge loops and multi-row caps remove the pronounced rear triangular pinches. Exact source swatch still reads grey in fixed bright rig. |
| `eb07462f8324` | Build continuous stand to turned collar and real rolled lapel depth, then tune only main cloth under unchanged fixed lighting | First turned collar and curved facing strips, darker main fabric. Broken bright seam traces and poorly legible collar outer cut remain. |
| `70691db4f9b6` | Correct broken tailoring seam traces with projected round thread centerlines; maintain rounded shell | Round seam tubes regenerated from projected centerlines, tonal thread darkened. This corrects broken pale bars from flattening original tube vertices. |
| `9e160efb35d6` | Refine collar points and outline their actual front cut; reduce interior satin glare | Collar front cuts outlined, interior satin glare reduced. First selected candidate and completed cuff/restore exercise. Later superseded by lower/wider front roll endpoints. |
| `4473a6655f6b` | Only wearer-left cuff assembly: extend band 0.01 m proximally; keep distal rim and other asset objects | Local cuff editing or recovery revision; see execution.json. |
| `0ab3ae72d0c8` | Restore revision 9e160efb35d64dfcacc549d98e6c9adb | Local cuff editing or recovery revision; see execution.json. |
| `0146d29383ce` | Lower and widen front collar roll endpoints to the visible reference; narrow rear collar leaf | Rejected collar trial. Lower front roll plus straight interpolation passed behind the upper chest and occluded front-cut piping. Kept as evidence. |
| `9fe00caf1e16` | Seat lowered front collar leaf outside the actual upper chest and clear the shoulder surface | Final author-selected refinement. Leaf seated outside evaluated front chest and above shoulders; front roll lower/outward and rear leaf narrower. Collar remains angular/stiff as reported. |
| `939cbce741ea` | Only wearer-left cuff assembly: extend band 0.01 m proximally; keep distal rim and other asset objects | Local cuff editing or recovery revision; see execution.json. |
| `f84f840b4d60` | Restore revision 9fe00caf1e1649a58554b3a761ee7bbb | Local cuff editing or recovery revision; see execution.json. |

One execution failed: run `a31cd6386c5b48168d3535dedf0bd9be` sampled a seam at z=.411 outside the profile interpolation domain ending at .405, raising `StopIteration`. The failed command preserved the previous head. Limiting that sample to z=.404 fixed the error. Its script and log are retained.

Collar trial `0146d29383ce47caa72e0e6566aa9a48` was visually rejected because a straight lowered leaf crossed behind the chest and hid piping. The selected correction seats the actual cloth surface outside the evaluated body. The retained failed candidate distinguishes an observed clearance defect from a successful file save.

## Geometry, openings and preservation

The rebuilt control shell has **2,164 vertices / 2,032 faces**, one connected component and three intentional boundary loops: one continuous front/neck/hem boundary and two wrist openings. All **80 armhole seam edges** have two incident faces. There are no edges with more than two incident faces and no zero-area faces in this check.

With the saved **Subdivision level 2 + Solidify** evaluated, the body has **66,086 vertices / 66,088 faces**, one connected component, zero boundary edges and zero over-connected edges. Solidify closes each cloth rim into a finite-thickness wall; this does not fill the garment's open volume. A front-axis ray reaches the rear lining at y=0.103924 m, while the central neck and 11 cm axial wrist rays are unobstructed. These are useful limited checks, not a complete collision or self-intersection certificate.

Compared with the supplied native baseline, **231 cuff / left-ornament / chain objects** retain their recorded geometry, transforms, modifier settings and material slots. Hardware, piping and strap node material records are unchanged. The major shell, collar/facings, shoulder fitting, seam traces and lapel snap placements are the intentional changed scopes.

### Measurements and interpretation

| Quantity | Recorded result | Meaning |
|---|---:|---|
| Shoulder seam-top span | 0.384000 m | About 1.1% above the 0.38 m anchor |
| Back center hem-to-neck construction | 0.420000 m | Native construction anchor |
| Retained sleeve axis parameter | 0.580000 m | Construction axis, not cloth pattern length |
| Outer sleeve control meridian | 0.607397 m per side | Cage polyline arclength; about 4.7% over 0.58 m; not an evaluated smooth seam or pattern length |
| Inferred closed hem ellipse | 0.686988 m | Extrapolates the missing front arc |
| Inferred chest ellipse at z=.255 | 0.913236 m | Extrapolates the missing front arc |
| Original cuff axial extent | 0.059987178 m | Approximately 6 cm |
| Edited left cuff axial extent | 0.069987188 m | Approximately 7 cm |
| Left cuff delta | 0.010000010 m | Measured native mesh change |

The original sheet's G/N ambiguity remains: G is treated as the approximately 13 cm flat opening, around 26 cm circumference; N is not enforced as a conflicting 13 cm circumference. No actual closed-front garment circumference is claimed.

## Cuff local edit and exact recovery

After selecting `9fe00caf1e1649a58554b3a761ee7bbb`, the public runner edited only the wearer-left cuff assembly. The distal rim stayed fixed, the proximal piping moved 1 cm along the sleeve axis and the hardware moved 0.5 cm to stay centered. **Seven left-cuff objects changed; all 263 protected objects and every material were unchanged.** The opposite cuff and distal piping were exactly preserved by the recorded state checks.

The edited revision is `939cbce741ea4707b211092b42cdde7d`. CLI restore published `f84f840b4d604957b7717b95e8fb873c`. All **14 selected artifact/input files** match their selected counterparts byte-for-byte, including the native file, GLB, scene metadata, renders, script, captured base.blend input and review specification. `verify` passed. Recovery was not judged by render resemblance alone.

## Reopen and reproduction checks

The CLI reopened the selected `.blend` and matched its recorded fingerprint. It exported and reimported the GLB and matched geometry triangle counts and bounds, with no exported diagnostic cameras/lights. The selected export has **271 meshes / 302,196 triangles**. This is a static geometry/count/bounds check, not visual material equivalence or engine readiness.

The final scripts also ran through the fresh public-CLI path from the original native input. That reproduction selected `7cd95791322e43639dc1003bcd28ee9b` and restored `9405692ea1004f9c8e80df7f0020b07c`. Its full recorded scene fingerprint is identical to the author-selected scene:

`50685b52a722d64aee4659531cbf1d71491e446de9c5fb6116f9a379ae54a2cc`

There are zero differing recorded object states. Its six-view metadata, local cuff check and exact bundle restore passed. Recorded fresh CLI command time totals **71.307 seconds**. This runtime is separate from the informed authoring wall time.

Run from the delivered `scripts` folder or repository example:

```bash
python3 run_refinement.py --root /absolute/new-output --skill-root /absolute/refas-skill --input-blend /absolute/jacket.blend
```

The runner uses public `doctor`, `init`, `run`, `status`, `verify` and `restore` commands. It imports no repository-private module. `--resume-selected` applies the cuff exercise to an already inspected existing head and retains its prior revisions. Successful execution does not itself confer visual acceptance.

## Editing semantics and remaining limits

The main body object name is retained, but vertex indices were rebuilt. Use `Body panels | rebuilt fitted shell`, `L/R Sleeve | rebuilt editable region` and `L/R Armhole | shared 40-edge seam` vertex groups. The former separate pointed-front collar cloth objects were absorbed into the continuous stand/turned-leaf object. Cuff and ornament object names remain individually addressable.

- The collar and notched lapel transitions remain stiff and angular. They establish a physical turn and clearance but do not yet reproduce the source's supple tailored fold exactly.
- The garment is a smooth fitted prototype with restrained sleeve variation, not a simulated or richly wrinkled fabric surface.
- Existing straps, cuffs and metal retain their original separate materials. Some straps/cuffs read lighter and more metallic under the fixed rig than the near-black main cloth.
- The retained left shield, chains and tassels remain schematic details. Their identity, placement, geometry and individual materials were preserved; their attachment and fine embroidery were not rebuilt.
- Main cloth base reflectance is the linear #1A1A1F swatch multiplied by .20 for the fixed bright review rig. This is a recorded appearance adjustment, not a claim of calibrated physical reflectance or literal palette equality.
- Main rebuilt cloth and collar/facings have no authored UV unwrap. Native procedural fabric noise may not export with identical appearance; GLB was reimported for geometry/count/bounds checks, not a material-equivalence test.
- The selected export contains 302196 triangles across 271 mesh objects. It is not optimized, rigged, skinned, cloth-simulated, or tested in a target game engine.
- Manifold edge counts and sparse opening rays do not certify absence of every self-intersection or collision. Reference views remain unregistered design-sheet comparisons.

## Guidance and provenance

Full guidance read: repository `AGENTS.md`, frozen RefAs `SKILL.md`, `production-garments.md`, `production-review.md` and the Karpathy coding guidelines. Their measured files total **22,483 bytes**; per-file hashes and sizes are in `report.json`. The original task/reference/review files and relevant original construction/cuff scripts were read. A limited worker excerpt was inspected to understand actual export/reopen and fixed-render behavior. No runtime, skill, original construction/reference/review file or other example was edited. No automail author's files were read.

Exact token and tool-call usage are not reported. No numeric resemblance score or general skill-superiority claim is made.
