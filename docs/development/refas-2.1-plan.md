# RefAs 2.1.0 — precision authoring

Target: [milestone 2.1.0](https://github.com/ictseoyoungmin/refas/milestone/6).
Integration: `develop/v2.1.0`; current source identity: `2.1.0-alpha.1`.
The published stable release remains `2.0.0`. This is development, not a
release or a claim that the new authoring toolkit is complete.

[Work OS plan](https://app.notion.com/p/425c6a3b5bf181979c7feb3706c4ba0a)
owns the private reference links and current evaluation context. The original
[2.0 checklist](refas-2-progress.md) remains 36/37; do not carry its 97% into
this version or reinterpret it as artistic completion.

## Product outcome

Help the agent construct the source's actual features while spending less
effort rebuilding geometric algorithms. A groove needs its intended depth,
walls and floor; a curve needs its intended section and direction; a mounted
part needs the actual supporting surface and contact footprint. Technical
validity does not establish that these features were constructed.

The user supplied a four-view garment and a multi-view car as the main dogfood
references. A supplied mascot reference, 2.0 render and GLB form a secondary
failure case. Large-form fidelity remains essential: adding repeated details
does not fix an incorrect silhouette, feature hierarchy or proportions.

Use a small set of completed authoring operations on ordinary Blender data.
Share units, surface frames, profiles and boundary calculations internally.
Keep editable controls and local corrections available in the native source.
Metal cavities and cloth pockets share geometric concepts but require
different constructions. Primitives remain appropriate when they express the
intended form; do not ban them or infer quality from polygon/part counts.

## Fixed functional acceptance

The user's latest correction makes **initial construction** the next priority:
avoid independent approximate surfaces and guessed attachment positions at
creation, rather than treating later repairs as the primary product outcome.
[#456](https://github.com/ictseoyoungmin/refas/issues/456) evaluates explicit
straight/Bezier profiles and shared-boundary native surface construction,
using existing evaluated-host mounting for initial hardware placement. This
does not reopen the retired managed Sweep implementation or add completed
items to the ledger below. Admission requires fresh reference-based builds
from empty scenes and ordinary native continuation, not repaired old models.

Original ledger: **16 demonstrated and 4 retired proposal criteria out of
20**. M1–M4, R1–R4, J1–J4 and bounded D1–D4 are demonstrated. The user-authorized scope revision
retires the present Sweep proposal, S1–S4, after its practical benefit was not
demonstrated. Retirement is not completion and does not improve a percentage.
Each item below remains visible; future scope changes require an explicit revision.
Whole-asset visual acceptance, performance/cost evidence and release status
are separate outcomes. Writing this plan does not complete a criterion.

| Family | Four independently tracked criteria | Current work |
|---|---|---|
| Surface mounting | **M1:** evaluated host frame from a bounded ray and explicit tangent; **M2:** multipoint gap bounds, preserved rigid shape/scale and failure nonmutation; **M3:** copied-skill actual Blender edit/save/reopen/re-edit with unrelated preservation; **M4:** useful source-bound garment/car feature studies, observed in actual renders. | [PR #443](https://github.com/ictseoyoungmin/refas/pull/443), M1–M4 demonstrated and merged |
| Recesses and openings | **R1:** actual declared depth/walls/floor or through opening; **R2:** wall/input limits and failure recovery; **R3:** editable cutter/outline/depth/edge controls; **R4:** installed car-feature construction and visual comparison, with cloth-shell openings distinguished. | [PR #444](https://github.com/ictseoyoungmin/refas/pull/444), R1–R4 demonstrated and merged |
| Sweep and loft | **S1:** controlled straight/curved intent and section changes; **S2:** editable guide/section scene generation and re-edit; **S3:** explicit handling of twist, degeneration and folded connections; **S4:** installed garment and hard-surface source-bound trials. | Retired proposal: [#424](https://github.com/ictseoyoungmin/refas/issues/424) closed as not planned; [#425](https://github.com/ictseoyoungmin/refas/pull/425) closed without merge. Branch and frozen trial retained; no installed feature removed. |
| Boundary transitions | **J1:** actual join from explicit boundary correspondence; **J2:** position/tangent direction/transition width with intended creases retained; **J3:** invalid-input handling and preserved surrounding controls; **J4:** demonstrated garment junction and housing transition improvement. | [PR #446](https://github.com/ictseoyoungmin/refas/pull/446), J1–J4 demonstrated and merged |
| Local constrained edits | **D1:** handles and fixed boundary limit the edited region; **D2:** supported size/thickness/obstacle-gap constraints are met or conflicts returned; **D3:** existing anchors/sections and unrelated required data retained; **D4:** useful garment/car local edits and re-edit with bounded claims. | [PR #451](https://github.com/ictseoyoungmin/refas/pull/451), D1–D4 demonstrated within the small static-mesh displacement contract below. |

## Implementation sequence and interfaces

Surface mounting, actual recess construction, boundary transitions and bounded
native projection and bounded joint local edits form the reviewed toolset.
The managed Sweep proposal is retired after its native path and matched
comparison failed to demonstrate net benefit; preserve its branch and frozen
evidence. Whole-asset integration and visual acceptance remain separate work.
Use one active implementation issue/PR at a time and merge feature branches
into the development integration branch after their evidence passes.

`surface_mount.py` adds `surface_frame` and `place_on_surface` as optional
Blender authoring imports. A world ray selects the evaluated host; a tangent
sets orientation about its normal; an explicit part-local contact footprint
sets the rigid support. Failure leaves the part in place. Finite samples do
not prove global collision clearance, automatic attachment to motion, or an
entire contact area. Recompute after host changes. See the installed assembly
guide for executable usage and the [relationship map](refas-2-skill-map.md) for
callers, tests and removal impact.

Keep the existing `run`, `inspect`, `deliver`, preservation and recovery path.
Do not add a scene DSL, global approval state machine or mandatory report pack.
Tool results should expose the edited objects/controls and concrete unresolved
conditions; the agent retains source interpretation and visual judgment.

## Dogfood and comparison

| Reference | Features that must survive construction and revision |
|---|---|
| Garment | Standing collar and lapel roll; shoulder cape; sleeve/waist sections; asymmetric front hem and back vent; actual layers, pockets, buckles and badges. |
| Car | Body proportions and round wheels; wheel arches; actual intakes/recesses; deliberate straight and curved panels; mirror/spoiler mounting; doors and visible interior. Sheet dimensions are design inputs, not proof that generated pixels agree across views. |
| Mascot failure case | Broad feather groups and tip/section variation; beak/head transition; leg/foot proportions; support of studs, harness and bag. Keep the original GLB immutable and distinguish image judgments from measured geometry. |

For initial-construction changes, start fresh from the original reference and
updated skill in an empty scene. Do not supply old failure geometry, defect
coordinates or repair instructions to the author. Judge the first useful
assembly in its whole-form context as well as the relevant section. A later
repair can improve an asset, but cannot substitute for this initial-generation
evidence. Source-bound local studies still help develop bounded operations;
their success is not a finished coat/car or a whole-toolkit quality claim.

Distinguish controlled before/after edits from independent matched workflow
trials. The former tests a correction; the latter compares the same task,
references, model/toolchain and available budget. Record actual time and
authoring effort when observed; do not infer billing or broad superiority.
Admit tools for better source features or useful editing effort, not more PASS
results. Store user references, models, renders and raw observations outside
Git. Commit reusable code, small generated fixtures and concise findings only.

## Delivery boundary

### Demonstrated mounting scope

The copied skill completed actual Blender native edits and reopen on local
studies derived from the supplied sheets. An open-frame upper-arm buckle with
hinge and tongue met a 0.35–2.0 mm declared gap band (45 samples; observed
0.351–1.640 mm). A mirror foot on a sloping door shoulder measured
1.002–1.203 mm over 10 samples. These scenes use metre world units. Rigid
detail meshes and the supporting shell geometry/thickness were preserved;
front, oblique and useful grazing renders were inspected. Ten actual Blender
regressions cover placement, re-edit, numeric failures and native recovery.

A wide flat shield on the curved sleeve remained visibly raised despite
correct orientation (up to 11.545 mm sampled gap). That candidate is retained
privately and excluded from accepted garment fit. Flexible-patch conformation
is addressed separately by the bounded fitting follow-up below. The accepted
rigid garment example is buckle construction and
mounting; the mirror provides a controlled same-geometry before/after. Neither
local study establishes a finished whole garment/car or superiority over an
independent matched 2.0 workflow.

### Demonstrated recess scope

The copied skill constructed a source-derived central car intake study from a
closed faceted nose. Actual same-camera before/after and a cavity close view
show formed walls and a floor, with no cover sheet replacing the opening. The
native was reopened and the same cutter/Boolean revised from 180 to 200 mm
absolute depth. Final sampled depth was 199.999956–200.000015 mm; remaining
floor and side-wall minima were 159.139 and 59.849 mm against 60/40 mm bounds.
These dimensions and hidden depth are inferred study inputs. Thirteen floor
and twelve wall probes do not establish global thickness.

The host base mesh and five surrounding objects remained unchanged. The
delivered GLB retained the cavity (reopened center depth 199.999992 mm) and six
asset meshes, with no cutter surface; the native retained the editable source.
Nine actual Blender regressions and independent counterexamples cover
absolute re-edit, transformed hosts, thin first solid intervals, side breaches,
ownership, static state and failure recovery. Native cutter outline/edges are
editable, but the helper has no radius/bevel parameter and regenerates its
cutter mesh on re-edit. This is a blind prismatic feature study, not an airflow
duct, thin cloth pocket, complete car or whole-asset quality acceptance.

### Retired sweep proposal

The native candidate completed actual copied-skill save/reopen/re-edit with
editable guide, start-axis and corresponding profile meshes. Twelve numerical
tests and nine actual Blender regressions passed, including fixed-topology
layer preservation, float failures and transactional recovery. This establishes
the bounded implementation contract, not admission into the development line.

Three fresh independent agents used the same garment/car sheets, Blender 4.3.2,
720-second budget and frozen observation rig: unrestricted plain bpy, published
2.0.0, and the candidate. Each constructed a returned standing collar and a
changing wheel-arch section, reopened the native, and moved one collar tip
outward by approximately 8 mm while preserving the car, proxies, lower
attachment and opposite half. Native observations independently confirmed this.
The tool arm's controls reproduce its saved outputs exactly.

Blind visual review found no overall source-fidelity winner. The frozen 2.0
collar had a slightly less bulky rim; tool/plain arches showed clearer section
bands. All remained generic, stiff local studies. The tool arm reached its final
save earlier in this single observation (about 232 seconds versus 272/317), but
different authoring, refinement and review choices prevent a causal speed or
cost claim. The specified edit needed 17 profile changes plus rebuild; both
comparators exposed the same edit as one reversible native shape-key value.
The candidate retained 150 wire-control objects, including unit-length axes
oversized for these features, and an external rebuild dependency. A nonplanar
guide or unplanned section-edit advantage was not exercised.

#424 is closed as not planned and #425 is closed without merge; the feature branch is retained.
Neither proposed Sweep module is installed in develop, so retiring the proposal
breaks no installed consumer. The API couples one profile object to every guide
sample and still requires external rebuild. Combining controls into one object
would not remove those costs. The pure kernel is not admitted merely because
its numerical tests pass.

A separate Blender feasibility retained the same dense sections in ordinary
meshes with native Curve modifiers and two guide objects. Guide edits and a
newly authored Shape Key survived reopening without the Sweep modules. The
surfaces differed from the frozen candidate by up to 0.630/0.606 mm; this was
not a new matched trial, a fidelity improvement or a RefAs delivery proof.
There is no demonstrated need for a wrapper around that existing native path.

Preserve the frozen trials outside Git without revising their compared geometry.
S1–S4 remain visible as retired criteria, not accepted or completed criteria.
A future proposal requires a concrete unsupported construction/editing need and
useful source-bound benefit over native tools. This disposition concerns the
present implementation; it does not declare all sweep mathematics useless.

### Demonstrated boundary transition scope

`bridge_boundaries` uses Blender's native bridge on explicit existing open
cage chains. Eight copied-skill actual Blender regressions and independent
counterexamples cover correspondence, winding, source layers, world bulge,
numeric limits, failure nonmutation and native edit/save/reopen/delivery/recovery.
The object remains editable; the helper replaces its unshared mesh datablock.
It adds no interpolation engine or live rebuild handler.

The corrected garment study selects SURFACE for a thin collar-to-triangular-
lapel return. The same-source LINEAR comparison had a sharper planar crease.
The car selects LINEAR to connect its fender to the angular shoulder: SURFACE
introduced a wavy highlight band that weakened the source's planar intent.
Actual prejoin and final renders show the opened car boundary becoming a
connected surface. Lower tangent mismatch alone did not determine this choice.

An earlier front-only garment construction left its lower lapel about 80 mm
from the chest and exposed/intersected the shoulder context. These candidates
were rejected and the common source corrected before the final comparison.
The final inner attachment's eight axial samples are 4.91–6.65 mm from the
constructed torso; eight free-leaf samples are 22.32–33.19 mm. These are inferred
study dimensions and finite directional observations, not whole-garment fit.

Reopening the selected native and editing 80 newly inserted garment vertices
moved them by at most 1.949612 mm. Original cage vertices and 33 unrelated
evaluated meshes stayed exact; the car also stayed exact during that edit.
Independent checks of both Solidify sides found expected original-boundary
movement after joining (up to 0.04097 mm garment / 0.36918 mm car), and up to
0.08798 mm at the garment boundary after the local edit. Cage preservation does
not imply unchanged evaluated boundary normals or margins.

Actual GLB import verified 35 meshes, 24,078 triangles and matching bounds.
The baseline and final native/scene files, and final GLB, restored byte-for-byte.
Final source SHA256 is `0569714294585ae8cc12350ea300686361debc66c5284b56c7729dcdfeff74ca`;
GLB SHA256 is `801f12f006573e53ed926400dfa9f7826e08371572493e2d908559f0cca96693`.
This supports local connected features and native editing, not complete assets,
exact G1/G2, global collision/thickness or a workflow speed/cost advantage.

Two earlier diagnostic-render runs exited with SIGSEGV and preserved the
existing head. Exact-source/settings/helper retries later completed, with the
same scene fingerprint and pixel-identical available images. No deterministic
cause or source fix is established. [#448](https://github.com/ictseoyoungmin/refas/issues/448)
tracks this runtime observation separately; save without views followed by
fresh-process native rendering worked for these studies. It is not a general
stability guarantee or a resolved release-readiness claim.

### Demonstrated bounded fitting follow-up

A native Laplacian probe retained binding through reopening, but one 25 mm
handle move missed its target by 19.553 mm and moved the intended fixed region
up to 0.923 mm. That configuration does not establish the general D contract.

The previously rejected sleeve shield was separately prepared as a flexible
surface cage while retaining its traced outline and layered motif. Ordinary
native Project Shrinkwrap reduced sampled backing gaps from 1.168–11.545 mm to
0.245–0.303 mm; three existing offset edits moved it another 0.35 mm after
reopening, with source data and 15 other objects preserved. This conversion is
a construction interpretation, not preservation of the original thick topology
or proof of embroidery/whole-garment fidelity.

An insufficient Project limit silently left all 7,190 input vertices unmoved.
[#447](https://github.com/ictseoyoungmin/refas/issues/447) /
[PR #449](https://github.com/ictseoyoungmin/refas/pull/449) adds `project_region`,
a small native projection adapter with bounded first hits, actual vertex and
triangle-interior residual/displacement observations and exact rollback. It
keeps the source cage and ordinary modifier controls. Binary masks must cover
complete components; the supported source has a disjoint Project prefix and
optional Solidify/Bevel suffix. The target transform is rigid and the source
projection axis has unit world scale. Unsupported precision, masks, dependencies
and stacks fail rather than silently rebuilding the source or widening limits.

Seven copied-skill actual Blender regressions and eleven independent scenarios
covered silent misses, first-backface obstruction, coarse faces, near-hit drift,
absolute input displacement, RNA re-edit, local/world float limits and exact
failure restoration, including attributes and active modifier context.

The frozen copied adapter repeated the same prepared source fit: backing gaps
were 0.245–0.303 mm, the 131.4545 mm transverse trace width remained fixed while
its depth span became 8.7317 mm, and five layer thicknesses were retained. Source
cage, Solidify/Bevel settings and 15 other objects stayed unchanged. A deliberate
short-limit failure left source, evaluated cage, native bytes and project head
unchanged. Reopening and calling the helper on the same three modifiers for a
new +0.35 mm offset produced the requested movement. This guarded re-edit is
distinct from the earlier feasibility's direct native field edits.

Delivery used that later 0.65 mm offset state. Seven curves were explicitly
converted in a separate delivery preparation while retaining their evaluated
geometry; actual fresh-process GLB import verified 16 meshes. Final beveled
backing samples were 0.592–0.755 mm, distinct from the pre-shell cage samples
0.595–0.653 mm. The editable re-edit native restored byte-for-byte. The accepted
0.3 mm fit images and later delivery state are retained separately.

This is useful fitting and failure handling for prepared static layers, not a
new solver, embroidery reconstruction, continuous shell/collision certification
or completed whole garment. This projection follow-up did not complete D1–D4;
the separate joint-edit implementation below supplies that bounded evidence.

### Demonstrated bounded joint local edits

`local_edit.edit_region` applies explicit absolute world targets jointly while
freezing every cage vertex outside an explicit region. It minimizes a symmetric
inverse-edge-weighted squared graph Laplacian on displacement, preserving the
zero-displacement rest pose. Hard targets are not softened to pass another
bound. Named cage distances, verified plain Solidify pairs and directional
first-hit obstacle gaps either meet their finite intervals or reject this
candidate with coordinates restored. Rejection does not establish that no
other feasible shape exists. The result is the same ordinary mesh without new
control objects, modifiers, rebuild handlers or project state.

The supplied garment/car study starts from the accepted boundary source. Two
garment targets move -2/+3 mm through the returned collar/lapel region, and two
fender targets move -8/-4 mm through the brow/shoulder region. Copied-skill
execution, reopening and a second joint edit retain all outside cage coordinates,
topology, UVs, attributes, materials and 33 unrelated meshes. A subsequent
ordinary native edit changes 30 garment vertices without importing this helper;
the other 34 meshes remain exact. The final GLB actually reimports as 35 meshes
and 24,078 triangles with matching bounds. Baseline and selected native, scene
record and delivered GLB restore byte-for-byte in the same working project.

Actual size, shell-pair and shirt-gap failures leave all 35 objects and the
project head/sequence unchanged. Independent review found and corrected a local
float quantization case whose handles were exact but free field was wrong by
30.234 mm, and a final dependency-update exception that originally left edited
coordinates. Per-axis native storage precision, the actual realized region,
grazing-ray uncertainty and precommit dependency update are now checked.
Eleven focused tests pass: three numerical and eight actual Blender/copied-skill
tests, with independent native counterexamples and required repository gates.

Actual fixed-rig context/detail renders retain the layered lapel and broad
angular fender transitions. The shallow longitudinal brow crease softens from
4.33–5.11 degrees to 2.39–3.40 degrees; not every crease angle is preserved.
This is accepted for bounded local editability, not increased source fidelity.
The corrected native proportional-edit comparator also reaches the selected
targets and freezes the exterior. It requires separate per-target falloff
choices; this helper offers one joint field with no such radii and an explicit
accept-or-restore result. No visual, speed or cost superiority is established.

The supported source is a static, unshared, unparented mesh with no modifiers or
one supported plain Solidify. Positive orthogonal scale is allowed; shape keys,
animation, dependent modifiers, arbitrary rotations of details and global
collision/thickness solving are outside the contract. Cage preservation does
not imply unchanged neighboring evaluated shell normals. The reviewed runtime
SHA256 is `bc7a1842aa19a3d4f8f79f73b27276338cfcba1f177c2d16090b03f126d538ea`.
The whole coat/car, the immutable mascot failure case and unresolved renderer
issue #448 are not cleared by this local acceptance.

### Integration and release

Keep discovery, the exact package allowlist, optional guides and relationship
map synchronized. Test the actual copied/packed skill, not repository-only
imports. Run capability-local checks and required repository gates. Source
integration, whole-asset acceptance, main merge and publication are distinct.
Retain completed task branches for the user to delete.
