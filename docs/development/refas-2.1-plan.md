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

Current count: **8/20 demonstrated (M1–M4, R1–R4)**. Each item below is one criterion; changing
scope requires an explicit revision rather than silently changing the count.
Whole-asset visual acceptance, performance/cost evidence and release status
are separate outcomes. Writing this plan does not complete a criterion.

| Family | Four independently tracked criteria | Current work |
|---|---|---|
| Surface mounting | **M1:** evaluated host frame from a bounded ray and explicit tangent; **M2:** multipoint gap bounds, preserved rigid shape/scale and failure nonmutation; **M3:** copied-skill actual Blender edit/save/reopen/re-edit with unrelated preservation; **M4:** useful source-bound garment/car feature studies, observed in actual renders. | [PR #443](https://github.com/ictseoyoungmin/refas/pull/443), M1–M4 demonstrated and merged |
| Recesses and openings | **R1:** actual declared depth/walls/floor or through opening; **R2:** wall/input limits and failure recovery; **R3:** editable cutter/outline/depth/edge controls; **R4:** installed car-feature construction and visual comparison, with cloth-shell openings distinguished. | [PR #444](https://github.com/ictseoyoungmin/refas/pull/444), R1–R4 demonstrated and merged |
| Sweep and loft | **S1:** controlled straight/curved intent and section changes; **S2:** editable guide/section scene generation and re-edit; **S3:** explicit handling of twist, degeneration and folded connections; **S4:** installed garment and hard-surface source-bound trials. | [#424](https://github.com/ictseoyoungmin/refas/issues/424), [draft #425](https://github.com/ictseoyoungmin/refas/pull/425): technically working candidate; admission deferred after matched trial found no demonstrated net benefit |
| Boundary transitions | **J1:** actual join from explicit boundary correspondence; **J2:** position/tangent direction/transition width with intended creases retained; **J3:** invalid-input handling and preserved surrounding controls; **J4:** demonstrated garment junction and housing transition improvement. | queued |
| Local constrained edits | **D1:** handles and fixed boundary limit the edited region; **D2:** supported size/thickness/obstacle-gap constraints are met or conflicts returned; **D3:** existing anchors/sections and unrelated required data retained; **D4:** useful garment/car local edits and re-edit with bounded claims. | queued |

## Implementation sequence and interfaces

First integrate surface mounting, then actual recess construction using the
same surface-selection conventions. The sweep candidate's native path and
matched comparison are complete, but its admission is deferred; preserve the
candidate and proceed to boundary transitions and bounded local fitting.
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

Start with source-bound local feature studies and integrate useful operations
back into the two whole main assets. A successful local study is not a
finished coat/car. Use selected views or a section that answers the current
feature question; review both the affected feature and whole-form context.

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
is still unresolved. The accepted garment example is buckle construction and
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

### Deferred sweep candidate

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

Keep PR #425 as a candidate rather than admitting it because its checks pass.
Useful net benefit remains unproven; source fidelity and reduced editing burden
must be demonstrated before reopening admission. Preserve the frozen trials
outside Git and do not revise their geometry after comparison. S1-S4 do not
increase the accepted 8/20 count. This does not establish that sweep math is
useless; it limits what this implementation and this trial justify.

### Integration and release

Keep discovery, the exact package allowlist, optional guides and relationship
map synchronized. Test the actual copied/packed skill, not repository-only
imports. Run capability-local checks and required repository gates. Source
integration, whole-asset acceptance, main merge and publication are distinct.
Retain completed task branches for the user to delete.
