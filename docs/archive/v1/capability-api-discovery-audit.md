# AD00 — Public Instruction-Node / Runtime Capability Discovery Audit

Baseline: `main@b7f5b7abfdebfac24359ef893ea020ff73cde44f`  
Primary issue: #186  
Scope: repository-support audit only; no runtime, API, graph, gate, or volume-closure behavior is changed by AD00.

## Audit question

Can a fresh worker perform normal RefAs work through the **effective installed-skill reading path**:

```text
SKILL.md
  -> required always-load control path
       references/INDEX.md
       references/workflow.md
       references/checkpointing.md
       references/failure-routing.md
  -> references/GRAPH.json routing
  -> active reference leaf(s)
  -> canonical template / public CLI / scripts/lib/index.mjs API
```

without reading `scripts/lib/*.mjs` implementation or repository-only tests/examples to discover the callable contract?

The always-load files are part of the discoverability surface for **every** routed node. A function or execution rule exposed in `workflow.md`, `checkpointing.md`, or `failure-routing.md` must therefore be credited even when it is absent from the active leaf.

For this audit, **no** means that implementation/test inspection is needed to learn any normal-use fact that should have been available at the agent-facing boundary: the public creator/evaluator name, validator name, minimum input shape, required enum, output contract, or smallest working invocation.

## Method and grading

The inventory was made from the installed-skill boundary first: `SKILL.md`; the four required always-load documents `references/INDEX.md`, `references/workflow.md`, `references/checkpointing.md`, and `references/failure-routing.md`; all 40 nodes in `references/GRAPH.json`; every routed active leaf; `scripts/refas.mjs`; `scripts/refas-host.mjs`; `scripts/lib/index.mjs`; and all 24 `assets/templates/**` files. The implementation modules under `scripts/lib/*.mjs` were then inspected **only as comparison evidence** to determine what public functions/enums actually exist and which facts the effective instruction surface fails to expose. Repository-only tests/examples are likewise not counted as normal agent-facing documentation.

`scripts/lib/index.mjs` is the public library entrypoint, but it mainly uses `export * from './module.mjs'`. A module re-export proves availability; it does not tell a fresh worker which symbol to call or how to construct its input. Such a re-export alone does not improve a grade.

Grades:

- **A — Fully discoverable:** instruction surface identifies a sufficient public CLI/API, inputs, output meaning, and validation path. Instruction-only/reference-only nodes may be A when they require no separate executable artifact.
- **B — Discoverable with template:** the leaf/SKILL plus a named canonical template closes the input-shape gap without raw implementation inspection.
- **C — Partial:** a usable public surface exists and is partly described, but at least one normal-use creator/validator/input/output detail requires implementation or repository-only test/example inspection.
- **D — Raw-code dependent:** the principal normal-use artifact/operation cannot be constructed from the routed instruction surface; fresh-worker execution effectively depends on reverse-engineering implementation/tests.

### Matrix key

Each row records all requested AD00 fields:

1. instruction-node ID and owner tags, with canonical runtime-capability ownership kept separate;
2. instruction leaf;
3. hard/conditional prerequisites;
4. public CLI availability;
5. public JS create/build/evaluate surface;
6. public validator surface;
7. canonical input template;
8. discoverable output schema/contract;
9. raw-code-free enum/required-input discoverability;
10. minimum working invocation;
11. worked example;
12. whether raw implementation inspection is needed;
13. exact missing surface when it is.

## Identity model: 40 instruction nodes are not 11 runtime capabilities

This audit has two different identity axes and must not conflate them.

### Canonical runtime capabilities

The executable checkpoint/repair capability set is defined by `CAPABILITY_ORDER` in the public runtime ownership layer and contains exactly **11** capabilities:

| Runtime capability | Routed instruction nodes that name it as an owner |
|---|---|
| `source-intake` | `provenance` |
| `visual-hierarchy` | `observation` |
| `visual-observation` | `observation`, `relational-structure`, `inference-authority` |
| `spatial-hypotheses` | `spatial-reasoning`, `single-view-volumetric-reasoning-example`, `relational-structure`, `inference-authority`, `whole-system-relational-barrier` |
| `shape-reconstruction` | `single-view-volumetric-reasoning-example`, `relational-structure`, `inference-authority`, `whole-system-relational-barrier`, `construction`, `organic-articulated-construction`, `parameter-fitting` |
| `surface-topology` | `construction` |
| `assembly` | `attachment-semantics`, `logical-fusion`, `surface-anchor-frames`, `attachment-follow`, `multi-anchor-solver`, `articulation-clearance`, `attachment-propagation`, `assembly`, `transmission-model`, `actuation-model`, `control-profile`, `runtime-binding`, `physical-asset-bundle`, `representation-capacity`, `backend-export`, `representation-normalizer`, `cross-representation-validation`, `divergence-authorization`, `physical-claims`, `physical-fusion`, `realized-contact-support` |
| `appearance` | `appearance` |
| `rendering` | `validation` |
| `visual-critique` | `validation` |
| `whole-object-certification` | `physical-claims`, `validation`, `candidate-transactions`, `claim-certification` |

`control` appears as a `GRAPH.json` owner tag for router/checkpoint/host/edit-boundary nodes, but it is **not** one of the 11 canonical runtime capabilities accepted by checkpoint ownership.

### Instruction-node identity

`references/GRAPH.json` currently contains **40 instruction nodes**. A node is a routing/contract unit and may:

- map to one runtime capability;
- map to multiple runtime capabilities;
- be control/instruction-only;
- expose multiple public operations and multiple output artifacts.

Therefore the A/B/C/D numbers below are **instruction-node discovery grades**, not counts of runtime capabilities.

## Instruction-node discovery inventory (40 GRAPH nodes)

| # | instruction node / owner tags | leaf + prerequisites | CLI | public JS create/build/evaluate | public validator | canonical template | output contract discoverable? | enum / required shape without raw code? | minimum invocation | worked example | raw implementation needed? / exact gap | grade |
|---:|---|---|---|---|---|---|---|---|---|---|---|:---:|
| 1 | `workflow` / control | `references/workflow.md`; none | lifecycle commands are routed from SKILL | routing/control functions are named where needed | N/A: router leaf | `handoff-capsule.json` is named for handoff | yes; capability order/ownership/closure effects are explicit | yes for routing semantics | SKILL lifecycle examples | no separate executable worked example required | **No.** Router is authoritative instruction rather than a separate artifact constructor. | A |
| 2 | `checkpointing` / control | `references/checkpointing.md`; workflow | `checkpoint`, `restore`, `begin-edit`, `finish-edit`, `abort-edit`, `status`, `resume`, `audit` | checkpoint/edit runtime is public through index, but normal worker is directed to CLI | candidate transaction validator is named; gate evaluator is not | `closure-gates.json`, `evaluation.json` exist but are not mapped here as trusted evaluators | checkpoint/candidate semantics yes | **partly**; gate record shape is visible, gate decision authority is not | checkpoint CLI syntax exists | bounded-edit semantics are documented | **Yes.** `checkpoint --gates` accepts caller-authored gate status. There is no first-class public “evaluate this gate from evidence” mapping for the whole gate set. | C |
| 3 | `host-integration` / control | `references/host-integration.md`; workflow, checkpointing | `refas-host open/status/events/review-bundle/handoff/validate-worker` fully listed | `openHostSession`, event/operation/review/handoff/worker APIs are described | validation/currentness APIs are described | none required for normal CLI flow | yes: host session/event/operation/review/handoff/worker schemas are listed | yes | exact companion CLI examples | protocol examples/semantics in leaf | **No.** | A |
| 4 | `failure-routing` / control | `references/failure-routing.md`; workflow | `route`, `report-finding`, then `resume` | `routeRelationalBarrier` named for barrier routing | normalization/ownership enforced by runtime CLI path | `finding.json` exists; leaf includes the full finding JSON shape | yes; finding categories/owners explicit | yes | complete finding JSON + CLI flow | yes, in leaf | **No for normal routing.** Leaf mentions `scripts/lib/ownership.mjs` as maintainer authority, but workers do not need to inspect it to route. | A |
| 5 | `provenance` / source-intake | `references/provenance.md`; workflow | `source-manifest`, `bind-source` from SKILL | source binding available through public library | source verification occurs in lifecycle | `source-manifest.json` | yes: source and artifact reference fields are explicit | yes | exact `source-manifest` command in SKILL | source/artifact JSON examples | **No.** | A |
| 6 | `observation` / visual-hierarchy + visual-observation | `references/observation.md`; provenance | `evidence`; `validate-spec` can validate produced hierarchy/observation | SKILL names `createObservation`; implementation also has `createVisualHierarchy`, `createReferenceGeometry` | CLI supports hierarchy/observation, but not reference-geometry | `visual-hierarchy.json`, `visual-observation.json`, `reference-geometry.json` exist | contracts are described, but the input-template -> persisted-schema transition is incomplete | hierarchy levels/ROI/fact classes are explicit; reference-geometry enums are described semantically | observation creator is usable; hierarchy/reference-geometry creation is not fully mapped | no end-to-end executable example | **Yes.** SKILL says copy/customize `visual-hierarchy.json` but does not route to `createVisualHierarchy`; template has no schema field while `validate-spec` dispatches on the produced schema. `reference-geometry.json` is not connected to `createReferenceGeometry/validateReferenceGeometry` or CLI validation. | D |
| 7 | `spatial-reasoning` / spatial-hypotheses | `references/spatial-reasoning.md`; observation | `register` is good; `validate-spec` supports spatial-hypothesis output | `createReferenceRegistration` named; implementation has `createSpatialHypothesisSet`, orientation/projection creators | registration + spatial-hypothesis validators exist publicly; projection/reference-geometry validation is not routed by CLI | `registration-input.json`, `spatial-hypotheses.json`, `projection-fit.json`, `canonical-object-frame.json` | several output contracts are named | camera/orientation reasoning is strong, but exact object shapes for spatial/projection artifacts are not fully mapped | exact registration invocation only | `single-view-volumetric-reasoning-example.md` | **Yes.** Principal spatial-hypothesis creation and projection/reference-geometry artifact paths require symbol/input discovery beyond the routed leaf. | D |
| 8 | `single-view-volumetric-reasoning-example` / spatial-hypotheses + shape-reconstruction | worked-example leaf; spatial-reasoning + construction | N/A | N/A | N/A | N/A | N/A; worked example only | yes for its stated reasoning procedure | stepwise procedure is the invocation | the leaf itself | **No.** This node is intentionally an instruction-only example. | A |
| 9 | `relational-structure` / visual-observation + spatial-hypotheses + shape-reconstruction | `references/relational-structure.md`; observation | no dedicated CLI | implementation exposes `createRelationalStructure`, obligation/dependency helpers | `validateRelationalStructure` exists in public library | `relational-structure.json` exists but leaf does not route to it | yes: `refas.relational-structure/v1` | relation kinds are described, but exact creator input/canonicalization is not closed by instruction | none | conceptual examples only | **Yes.** Creator/validator and canonical template are not connected from the leaf; `validate-spec` does not support this schema. | D |
| 10 | `inference-authority` / visual-observation + spatial-hypotheses + shape-reconstruction | `references/inference-authority.md`; relational-structure | no dedicated CLI | implementation exposes `createSemanticAuthoritySet`; leaf names downstream coverage/barrier helpers instead | `validateSemanticAuthoritySet` exists publicly | `semantic-authority.json` exists but is not routed from leaf | yes: semantic-authority set | authority classes/basis semantics are explained; exact creator input is not | none | conceptual authority cases | **Yes.** Missing leaf -> `createSemanticAuthoritySet` / validator / template mapping; no `validate-spec` route. | D |
| 11 | `whole-system-relational-barrier` / spatial-hypotheses + shape-reconstruction | barrier leaf; spatial-reasoning + relational-structure + inference-authority | no dedicated CLI; routing is available after artifact exists | implementation exposes `createWholeSystemRelationalBarrier`; leaf mainly names `routeRelationalBarrier` | `validateWholeSystemRelationalBarrier` exists publicly | none | yes: barrier schema and pass/fail/unresolved meaning | check status semantics are explicit; exact constructor input is not | none | examples of routing semantics, not construction | **Yes.** No canonical template or mapped create/validate invocation for the protected barrier artifact. | D |
| 12 | `canonical-edit-boundary` / control | contract leaf; workflow | bounded-edit CLI exists, but canonical-edit artifact has no dedicated CLI | `createCanonicalEditIntent` is named | `validateCanonicalEditIntent` exists but is not named in leaf | none | contract meaning is explicit | edit classes/rules are described; exact object shape is partial | no smallest library call | no executable example | **Yes, for direct library use.** Create is discoverable but validator/signature/minimum object are not. | C |
| 13 | `construction` / shape-reconstruction + surface-topology | `references/construction.md`; spatial-reasoning + canonical-edit; conditional relational barrier | `inspect-glb`, `fit-parameters`, render/compare flows | several construction APIs named in SKILL/leaf: hard-surface, curved plate, surface ribbon/network, primitives | `validate-spec` covers construction-quality/surface-network; hard-surface validation is library-only | `construction-quality.json`, `hard-surface-spec.json`, `surface-network.json` | construction-quality/hard-surface/surface-network contracts named | common semantic requirements are documented, exact signatures for several helpers are not | hard-surface/template path and fit CLI are usable; generic helper minimum calls are absent | volumetric example + narrative cases | **Yes for part of the surface.** Identity-bearing closure requires `createConstructionQuality`, but the creator is not mapped; several helper signatures require implementation/test lookup. | C |
| 14 | `organic-articulated-construction` / shape-reconstruction | specialized guidance leaf; construction | uses construction/render/validation commands | intentionally reuses construction surface | reuses construction-quality/normal validation | reuses construction templates | no separate runtime schema owned by this node | yes for its specialized modeling rules | follow construction path | leaf is specialized worked guidance | **No separate raw-code dependency introduced by this leaf.** | A |
| 15 | `parameter-fitting` / shape-reconstruction | `references/parameter-fitting.md`; construction; conditional relational barrier | `fit-parameters --plan ... --worker ...` | detailed `repairShapeFromProjection({...})` call shown; plan/report APIs exist | plan/report validation is exposed through `validate-spec` | `parameter-fit-plan.json` | yes: plan/report schemas | optimizer/eligibility requirements are explicit; template supplies minimum shape | CLI accepts raw template-like plan and creates digest-bound plan internally | full JS repair example in leaf | **No reverse engineering required for normal fit path.** The leaf directly names a module path for one adapter, which is an interface-location smell for AD01 but not grep-based discovery. | B |
| 16 | `attachment-semantics` / assembly | contract leaf; construction + canonical-edit | no dedicated CLI | `createAttachmentSemantics` named | implementation exposes `validateAttachmentSemantics`, not named in leaf | none | attachment semantics contract/modes explicit | modes/owner-count/evidence rules explicit; exact entity/relation object shape incomplete | no minimum JS object | mannequin relation example only | **Yes, partially.** Creator is discoverable, but validator and minimum input object must be inferred/read from code/tests. | C |
| 17 | `logical-fusion` / assembly | contract leaf; attachment-semantics | no dedicated CLI | `createLogicalFusion` named | validator/invalidation creators exist publicly but are not mapped | none | logical-fusion/invalidation schemas named | semantics are clear; exact call shape incomplete | none | narrative example | **Yes, partially.** Missing validator/invalidation/minimum-call mapping. | C |
| 18 | `surface-anchor-frames` / assembly | contract leaf; attachment-semantics | no CLI | leaf names only `rebindSurfaceAnchorSet`; implementation has `createSurfaceAnchorSet` | create/rebind validators exist but are not mapped | none | anchor-set/rebind schemas named | conceptual fields/tolerances are listed, exact creator shape is not | none | retessellation narrative | **Yes.** Fresh worker must discover `createSurfaceAnchorSet`, validator names, and minimum record shape from implementation/tests. | D |
| 19 | `attachment-follow` / assembly | contract leaf; attachment-semantics + surface-anchor-frames | no CLI | **always-load `workflow.md` explicitly names `createAttachmentFollowState` and `propagateAttachmentFollow`** | validators exist publicly but are not named in the effective instruction path | none | state/report schemas named | equations, owner-frame requirements, and one-step policy are explicit; exact constructor/validator object shape is incomplete | workflow gives the create→propagate sequence but not a copyable JS call | equations + workflow procedure | **Yes, but not for operation discovery.** Raw/test inspection is still needed for exact constructor/validator fields; the public operation names are already discoverable from always-load workflow. | C |
| 20 | `multi-anchor-solver` / assembly | contract leaf; attachment-semantics + surface-anchor-frames | no CLI | **always-load `workflow.md` explicitly names `solveMultiAnchor`** and instructs creation of `refas.multi-anchor-plan/v1`; implementation also has `createMultiAnchorPlan` | validators exist publicly, not named | none | plan/report schemas named | owner coverage, weights, tolerances, current anchor set, and explicit owner frames are described; exact persisted plan shape is incomplete | workflow gives plan→solve sequence, but no creator symbol or copyable minimum object | glasses narrative + workflow procedure | **Yes, partially.** Solver discovery no longer requires raw code, but plan creator/validator and exact minimum plan shape do. | C |
| 21 | `articulation-clearance` / assembly | contract leaf; attachment-semantics + surface-anchor-frames | no CLI | **always-load `workflow.md` names `createArticulatedJoint`, `evaluateArticulatedJoint`, `createSupportedClearance`, and `evaluateSupportedClearance`** | validators exist publicly, not named | none | four public artifact schemas named | joint axis/zero/limit rules and support-path/gap bindings are explicit; exact constructor object layouts are incomplete | workflow provides both create→evaluate sequences, but no copyable minimum JS object | equation/support examples + workflow procedure | **Yes, partially.** Core operation discovery is public; exact constructor/validator field contracts still require implementation/tests. | C |
| 22 | `attachment-propagation` / assembly | contract leaf; attachment-semantics; conditional follow/multi/articulation | no CLI | **always-load `workflow.md` names `createAttachmentPropagationPlan` and `propagateAttachmentGraph`** | validators exist publicly, not named | none | plan/report schemas named | DAG inputs, external-frame restrictions, blocked/ready semantics, and relation-specific prerequisites are described; exact object shape is incomplete | workflow gives create-plan→propagate sequence, but no copyable JS object | dependency-chain narrative + workflow procedure | **Yes, partially.** Operation discovery is public; exact plan/report validation shape still requires source/tests. | C |
| 23 | `assembly` / assembly | `references/assembly.md`; construction + attachment-semantics + propagation | no single assembly CLI; render/inspect/checkpoint flows available | leaf/SKILL name many assembly and P01-P05 creation/validation APIs and `appendPartsToClosedGlb` | several validators named; many nested physical validators only discoverable by code/tests | `assembly-contract.json`, `realized-assembly-input.json` exist | assembly/physical/realized schemas extensively named | high-level rules strong; exact nested P01-P05 object shapes/enums are uneven | no single minimal end-to-end library invocation | repo dogfoods exist, but they are outside installed skill and do not count | **Yes, partially.** Normal physical assembly beyond the basic assembly contract needs tests/source to recover exact nested input structures and function pairing. | C |
| 24 | `transmission-model` / assembly | contract leaf; assembly | no CLI | leaf names `evaluateTransmissionMapping` but not `createTransmissionModel`; implementation also has implementation-manifest creator | leaf names authority validator, not the primary model validator | none | transmission/implementation schemas named | mapping kinds/equations are strong; exact model/manifest shape remains incomplete | no minimum create call | mapping examples, not constructor | **Yes.** The principal create/validate path is not exposed despite detailed semantics. | D |
| 25 | `actuation-model` / assembly | contract leaf; assembly; conditional transmission-model | no CLI | implementation has `createActuationModel`; leaf does not name it | validators/bindings/authority exist, not mapped | none | actuation schema named | actuator kinds/coordinate classes/control modes/range semantics described, exact object shape not | none | semantic examples only | **Yes.** Principal create/validate invocation is missing. | D |
| 26 | `control-profile` / assembly | contract leaf; assembly + actuation-model | no CLI | implementation has `createControlProfile`; leaf names no entrypoint | validators/bindings/authority exist, not mapped | none | control profile schema is semantically described | modes/gain models/units are explicit; exact record shape is not | none | formulas/tables only | **Yes.** Complete runtime API mapping is absent. | D |
| 27 | `runtime-binding` / assembly | contract leaf; assembly; conditional actuation/joint | no CLI | implementation has `createRuntimeBinding`, forward/inverse calibration evaluators; leaf says evaluators exist but does not name them | validators/bindings/authority exist, not mapped | none | runtime binding semantics are explicit | coordinate classes/calibration equation detailed; exact record shape still not | none | equations only | **Yes.** Creator, validator, and named conversion functions require implementation inspection. | D |
| 28 | `physical-asset-bundle` / assembly | contract leaf; assembly; conditional included P06-P09 | no CLI | implementation has `createPhysicalAssetBundle`; leaf does not name it | `validatePhysicalAssetBundle` and binding validator are named | none | bundle/component/closure schemas listed | composition rules strong, exact creator minimum shape partial | none | narrative/component lists | **Yes, partially.** Validator path is visible but creator/minimum bundle invocation is not. | C |
| 29 | `representation-capacity` / assembly | contract leaf; physical-asset-bundle | no CLI | implementation has obligation derivation + `createRepresentationCapacityProfile`; leaf names no callable API | validators/binding/assert-exportable exist, not mapped | none | capacity contract and classification semantics explicit | obligation/classification rules detailed, exact API input not | none | semantic examples only | **Yes.** Derive/create/validate public symbol mapping is missing. | D |
| 30 | `backend-export` / assembly | contract leaf; representation-capacity | no CLI | implementation has `createCanonicalExportView`, `runExportAdapter`; leaf names no exact invocation | canonical/export binding/result validators exist, not mapped | none | canonical-export-view/backend-export schemas are named | lifecycle semantics strong, adapter interface/minimum shape not discoverable | none | flow diagrams only | **Yes.** Canonical-view builder, adapter signature, and validator sequence require source/test inspection. | D |
| 31 | `representation-normalizer` / assembly | contract leaf; backend-export | no CLI | leaf names `createSemanticJsonRepresentationNormalizer`; implementation also exposes `runRepresentationNormalizer` | `validateNormalizedRepresentationBindings` named | none | normalized-representation schema named | supported units/conventions are documented; runner/minimum adapter shape incomplete | no complete runner invocation | semantic examples | **Yes, partially.** Factory and binding validator are visible, but execution and exact normalizer interface require code/test lookup. | C |
| 32 | `cross-representation-validation` / assembly | contract leaf; representation-normalizer | no CLI | implementation has `createCrossRepresentationValidation`; leaf does not name creator | `validateCrossRepresentationValidationBindings` named | none | validation schema/outcomes explicit | outcomes/identity rules clear; exact create input shape not | none | outcome cases | **Yes, partially.** Creator + intrinsic validator/minimum call are unmapped. | C |
| 33 | `divergence-authorization` / assembly | contract leaf; cross-representation-validation + inference-authority | no CLI | implementation has `createDivergenceAuthorization`; leaf does not name creator | intrinsic + live-binding validators named | none | authorization schema/declaration fields explicit | declaration identity/coverage/authority rules are very detailed | no minimum creator call | rule examples | **Yes, partially.** Exact creator/minimum input remains implementation-dependent despite strong contract prose. | C |
| 34 | `physical-claims` / assembly + whole-object-certification | contract leaf; bundle + cross-validation; conditional divergence/certification | no CLI | leaf names physical certification policy/evaluator; implementation also has `createPhysicalClaimEvidence` | typed evidence/decision validators are only partly named in leaf | none | physical-claim-evidence + generic certification policy schemas named | claim obligations are detailed, evidence-constructor object shape is not | no minimum physical evidence call | claim-scope examples | **Yes, partially.** Creation/validation path for the P16 evidence artifact itself is not mapped. | C |
| 35 | `physical-fusion` / assembly | `references/physical-fusion.md`; assembly + logical-fusion + propagation | no CLI | implementation has create plan + bake operation; leaf does not name callable surface | validators exist, not mapped | none | plan/report/provenance schemas named | policy is described, exact bake input/output interface not | none | narrative | **Yes.** Plan/bake/validate invocation requires source/test inspection. | D |
| 36 | `realized-contact-support` / assembly | `references/realized-contact-support.md`; assembly + propagation; conditional fusion | no CLI | implementation has create plan + analyze operation; leaf names no callable API | validators exist, not mapped | none | contact/support semantics described | exact plan/graph/report input is not discoverable | none | narrative | **Yes.** Principal create/analyze/validate path is missing from agent-facing instruction. | D |
| 37 | `appearance` / appearance | `references/appearance.md`; assembly | `render-pbr` + normal render path | appearance-fit library exists but normal closure can use renderer/report path | PBR report validator exposed by `validate-spec` | `pbr-render-report.json` | yes: PBR report + material-support boundary | template + leaf define required renderer/material fields | exact `render-pbr` invocation in SKILL/validation | material-fixture exists repo-side but not needed | **No for normal appearance closure.** Template closes report shape. | B |
| 38 | `validation` / rendering + visual-critique + whole-object-certification | `references/validation.md`; appearance; conditional realized-contact | `render`, `render-pbr`, `compare`, `validate-spec`, `audit`, `certify` | `createVisualReview` in SKILL; `createProjectionAwareVisualReview` in leaf | visual/PBR/registered comparison validators exposed; realized-projection/reference-geometry creation/validation is not fully routed | `visual-review.json`, `registered-comparison-input.json`, `pbr-render-report.json`, projection-related templates | visual-review/report contracts are explicit | standard views/gates clear; source-bound realized-projection/reference-geometry execution shape incomplete | main render/compare/review flow is usable | volumetric example helps geometry, no installed end-to-end validation example | **Yes, partially.** Main visual-review flow is discoverable, but the mandatory real-source realized-projection/reference-geometry path is not exposed as a complete public invocation. | C |
| 39 | `candidate-transactions` / whole-object-certification | `references/candidate-transactions.md`; checkpointing | no dedicated CLI required | `createCandidateTransaction` explicitly named with full JS example | `validateCandidateTransaction` explicitly required by checkpointing leaf | none | candidate-transaction schema/roles/dependency proof are explicit | yes; example gives actual input structure and pointer semantics | complete JS constructor example | yes, full example in leaf | **No.** This is the strongest library-only discovery surface in the graph. | A |
| 40 | `claim-certification` / whole-object-certification | `references/claim-certification.md`; candidate-transactions + validation; conditional relational/contact | `certify --root` supports default whole-object path | runtime exposes policy/decision/authority functions, but leaf does not map them; default CLI can synthesize policy/transaction where allowed | explicit policy/decision validators not connected as a minimum public recipe | none | transaction/policy/decision/certificate schemas are listed | certification rules are clear, explicit policy construction and gate authority path are incomplete | default `certify` invocation exists; explicit custom policy path does not | no installed explicit-policy worked example | **Yes, partially.** Default CLI is discoverable, but explicit policy/decision construction and the upstream caller-authored checkpoint-gate problem require deeper inspection. | C |

### Totals

The instruction-node matrix covers **all 40 nodes in the current instruction graph**. The separate runtime-capability roster above covers **all 11 canonical runtime capabilities**.

| Grade | Count |
|---|---:|
| A | 7 |
| B | 2 |
| C | 17 |
| D | 14 |
| **Total** | **40** |

The count is intentionally conservative. A node is graded by the least-discoverable normal execution surface that it owns; a strong prose contract does not earn A/B when a worker still has to open implementation/tests to find the function or minimum object.

### Always-load regrade delta

All 40 rows were rechecked against the union of `SKILL.md` + the four required always-load documents + the active routed leaf + named templates/public surfaces.

The prior leaf-biased audit under-credited four assembly instruction nodes:

- row 19 `attachment-follow`: D -> C because `workflow.md` names `createAttachmentFollowState` and `propagateAttachmentFollow`;
- row 20 `multi-anchor-solver`: D -> C because `workflow.md` names `solveMultiAnchor` and describes the plan→solve path, although the exact plan creator/validator remains undiscoverable;
- row 21 `articulation-clearance`: D -> C because `workflow.md` names all four create/evaluate operations;
- row 22 `attachment-propagation`: D -> C because `workflow.md` names both plan creation and graph propagation.

Related rows were also rechecked but retain their prior grades: `canonical-edit-boundary`, `attachment-semantics`, and `logical-fusion` remain C because workflow exposes their creator but not a complete validator/minimum-input contract; `surface-anchor-frames` remains D because workflow exposes only rebind, while initial `createSurfaceAnchorSet` discovery is still absent. Relational barrier routing exposed in workflow likewise does not expose the missing relation/authority/barrier constructors, so rows 9–11 remain D.

No other instruction-node grade changes under the corrected effective-instruction methodology.

## Known-risk surface findings

### Visual hierarchy and visual observation

The installed skill contains `assets/templates/visual-hierarchy.json` and `visual-observation.json`. SKILL directly tells the worker to use the observation template as input to `createObservation`, but it only says to copy/customize the hierarchy template. The hierarchy input template itself has no persisted `schema` field, while `validate-spec` dispatches only after the creator has produced `refas.visual-hierarchy/v1`.

The public implementation does contain `createVisualHierarchy` and `validateVisualHierarchy`. The missing surface is the instruction-level mapping:

```text
visual-hierarchy capability
  -> assets/templates/visual-hierarchy.json
  -> createVisualHierarchy(input)
  -> refas.visual-hierarchy/v1
  -> validateVisualHierarchy / validate-spec
```

Reference geometry has the same defect more severely: a canonical `reference-geometry.json` input template and public `createReferenceGeometry/validateReferenceGeometry` exist, but neither creator/validator nor a CLI validation path is discoverable from the routed observation leaf.

### Spatial hypotheses

Registration is a good counterexample: the leaf names `createReferenceRegistration`, points to `assets/templates/registration-input.json`, and gives the public `register` CLI route. A fresh worker can execute it without implementation inspection.

The principal spatial hypothesis set is different. `spatial-hypotheses.json`, `createSpatialHypothesisSet`, and `validateSpatialHypothesisSet` all exist, and `validate-spec` can validate the produced output, but the leaf does not connect those pieces. This is exactly the “instruction node exists but node -> public operation mapping is incomplete” pattern AD01 must solve.

### Relational structure, semantic authority, and barrier

These three stages have strong semantic prose and runtime contracts, but their agent-facing execution links are incomplete:

```text
relational-structure.json
  -X-> createRelationalStructure / validateRelationalStructure

semantic-authority.json
  -X-> createSemanticAuthoritySet / validateSemanticAuthoritySet

whole-system barrier
  -X-> createWholeSystemRelationalBarrier / validateWholeSystemRelationalBarrier
```

The first two templates are present but are not routed by the leaves and are not accepted by `validate-spec`. The barrier has no canonical input template at all. A fresh worker therefore reaches exactly the observed dogfood pattern: read prose -> search module source/tests -> discover fields/enums -> retry after validator errors.

### Construction quality

The closure requirement is explicit and the canonical `construction-quality.json` template plus `validate-spec` route exist. The missing link is `createConstructionQuality(input)`. This makes construction less severe than the D-class relational gaps, but it is still not self-contained enough for A/B when a fresh worker wants a canonical digest-bearing record.

### Physical P04–P15 contract chain

The physical semantics leaves are often semantically excellent but uneven in executable contract detail. The always-load `workflow.md` closes more operation-discovery gaps than the active leaves alone suggest.

Operations already discoverable from the effective instruction path include:

- attachment follow: `createAttachmentFollowState` + `propagateAttachmentFollow`;
- multi-anchor execution: `solveMultiAnchor`;
- articulation/clearance: `createArticulatedJoint`, `evaluateArticulatedJoint`, `createSupportedClearance`, `evaluateSupportedClearance`;
- propagation: `createAttachmentPropagationPlan` + `propagateAttachmentGraph`.

Remaining examples that still require implementation/test comparison for a creator, validator, exact minimum input, or a complete operation pair include:

- surface anchors: initial `createSurfaceAnchorSet` / validators; workflow only exposes `rebindSurfaceAnchorSet`;
- multi-anchor plan creation/validation: `createMultiAnchorPlan` / validators;
- P07 actuation: `createActuationModel` / validators;
- P08 control: `createControlProfile` / validators;
- P09 runtime: `createRuntimeBinding` / validators + forward/inverse coordinate evaluators;
- P11 capacity: obligation derivation + profile create/validate/bindings;
- P12 export: canonical export-view builder + `runExportAdapter` + binding/result validators;
- fusion/contact finalization: plan/create/analyze/bake/validate pairs.

These symbols are public through `scripts/lib/index.mjs`, but `index.mjs` itself only re-exports module files and the relevant leaves do not name the symbols. A fresh worker cannot be expected to infer the symbol names or signatures from an `export *` line.

### Candidate transactions

This is the best current pattern for AD01 to emulate. The leaf names `createCandidateTransaction`, describes every binding rule, gives a complete JS constructor example, and checkpointing explicitly names `validateCandidateTransaction`. It demonstrates that library-only capability discovery can work without a dedicated CLI or template.

### Certification and checkpoint gates — reproducible interface gap

The current CLI advertises:

```text
checkpoint --root DIR --capability NAME --scope ID --reason TEXT
           [--artifacts refs.json] [--gates gates.json]
```

`assets/templates/closure-gates.json` gives the canonical eleven gate IDs with `status: "pending"`.

Implementation comparison shows that checkpoint gate normalization accepts caller JSON, normalizes `status` to one of `pass|fail|pending|blocked`, and for `pass` requires only a non-empty `evidenceRefs` array. `commitCheckpoint` then requires all supplied gates to be `pass`. The checkpoint call does **not** derive each gate verdict from its evidence.

Final certification performs important independent checks: exact closure-gate ID coverage, visual-review/PBR/registered-comparison bindings, visual-review gate status, blocking findings, projection/relational evidence where required, and project audit. Those checks substantially harden final certification, but they do not turn the generic checkpoint gate input into a trusted per-gate evaluation surface.

Therefore this interface remains possible:

```text
worker gathers some evidence refs
  -> worker authors {"id":"spatial-plausibility","status":"pass",...}
  -> checkpoint accepts caller verdict
```

That is the reproducible interface gap behind the Claude dogfood helper that emitted `status: "pass"`. AD00 does not redesign it. AD04 must establish which protected gates require trusted evaluator/reviewer-produced decisions and make caller-authored PASS insufficient for those closures.

## 1. Current ideal agent path

The intended path is already architecturally sound:

```text
install canonical skills/refas/
  -> SKILL.md
  -> always-load INDEX + workflow + checkpointing + failure-routing
  -> references/GRAPH.json
  -> active reference leaf(s)
  -> public interface operation(s)
       - CLI, when one exists
       - scripts/lib/index.mjs symbol(s)
       - canonical input template
       - output schema
       - validator
       - minimum invocation / worked example
  -> runtime implementation (debug/framework work only)
```

The defect is not the progressive-load graph. The defect is that the **public operation/interface layer is implicit and incomplete**. The always-load workflow already supplies some cross-cutting operation names, so discovery must be evaluated over the union of always-load guidance and the active leaf. Even after that union, many nodes still stop before exact creator/validator/input/output discovery.

## 2. Actual raw-code fallback points

The recurring fallback is:

```text
effective instruction set says what the artifact means
  -> creator/validator/template or exact-operation mapping still missing
  -> scripts/lib/index.mjs reveals only export * from a module
  -> worker opens scripts/lib/<module>.mjs or repository tests
  -> worker discovers exact symbol / enum / required field
  -> first validator error reveals another hidden requirement
  -> worker reopens source/tests
```

Highest-cost clusters:

1. hierarchy/reference-geometry/spatial-hypothesis creation;
2. relational structure -> semantic authority -> relational barrier;
3. physical P04 attachment solver chain;
4. P06-P12 physical/control/runtime/backend construction;
5. realized fusion/contact finalization;
6. real-source validation's reference-geometry/realized-projection path;
7. checkpoint closure gates, where the missing surface is not merely discoverability but **trusted verdict production**.

## 3. Minimum architecture required across AD01–AD06

### AD01 — graph interface metadata with explicit identity separation

Add machine-readable interface metadata to every graph node that has agent-executable work, while preserving two separate identities:

- **instruction node ID** — the routing/contract leaf identity from `GRAPH.json`;
- **runtime capability owners** — zero, one, or several members of the canonical 11-capability set.

Each node must support **multiple named `interfaces[]` operations/artifacts**. One node may create, evaluate, validate, render, normalize, or route several different contracts; a singular create/validate/template tuple is insufficient.

Required outcomes:

- node identity remains unambiguous;
- canonical runtime-capability ownership is explicit and separate from non-runtime owner tags such as `control`;
- each operation maps to its public CLI and/or exact `scripts/lib/index.mjs` symbol(s);
- each operation can bind its own input template, output schema, validator, minimum invocation, and example;
- implementation-module paths remain non-authoritative.

Instruction-only nodes may declare an empty `interfaces` array plus `mode: "instruction-only"` so the verifier does not demand fake APIs.

### AD02 — namespaced discovery

Do **not** use ambiguous `refas describe <capability>`.

Use separate lookup namespaces, for example:

```text
refas describe node <instruction-node-id>
refas describe capability <runtime-capability-id>
```

The node view should answer “what do I read and which operations are public here?” The capability view should aggregate all routed nodes/interfaces owned by one of the canonical 11 runtime capabilities.

### AD03 — template/schema/API alignment

Verify that each advertised template is a valid minimum creator input, documented enum values agree with runtime, output schema is reproducible, and every advertised public symbol exists through `scripts/lib/index.mjs`. Resolve the current template ambiguity between creator-input JSON and persisted-schema JSON rather than forcing workers to guess.

### AD04 — trusted gate evaluation

Separate “evidence reference supplied” from “gate passed”. Protected gates need a first-class evaluator/reviewer authority that consumes evidence and emits the verdict. Checkpoint ingestion may persist a decision, but caller-authored `status: "pass"` must not itself constitute trusted protected closure.

### AD05 — no-raw-code fresh-worker dogfood

Give fresh workers only the installed skill. Normal reconstruction/physical flows must be executable through SKILL/INDEX/GRAPH/interface metadata/templates/public APIs/CLI. Opening `scripts/lib/*.mjs` or repository-only tests for ordinary input-contract discovery is a failure.

### AD06 — discovery verifier

CI should fail on:

- graph interface symbol absent from public `scripts/lib/index.mjs`;
- missing/invalid advertised template;
- output-schema drift;
- documented enum drift where enumerated metadata is declared;
- executable graph node with no public discovery descriptor;
- protected closure relying on caller-authored PASS where trusted evaluation is required.

## AD01 concrete interface-schema proposal

Proposal only; **not implemented by AD00**.

A graph node that owns executable work should use a structure capable of representing multiple operations and separate runtime-capability ownership:

```json
{
  "id": "articulation-clearance",
  "owners": ["assembly"],
  "runtimeCapabilities": ["assembly"],
  "interface": {
    "mode": "library",
    "interfaces": [
      {
        "id": "create-articulated-joint",
        "operation": "create",
        "library": {
          "entrypoint": "scripts/lib/index.mjs",
          "symbol": "createArticulatedJoint"
        },
        "template": null,
        "inputContract": "refas.articulated-joint/v1 input",
        "outputSchema": "refas.articulated-joint/v1",
        "validator": {
          "library": "validateArticulatedJoint"
        },
        "minimumInvocation": "references/workflow.md#articulation-and-supported-clearance",
        "example": null
      },
      {
        "id": "evaluate-articulated-joint",
        "operation": "evaluate",
        "library": {
          "entrypoint": "scripts/lib/index.mjs",
          "symbol": "evaluateArticulatedJoint"
        },
        "template": null,
        "inputContract": "articulated joint + owner world frame + angle",
        "outputSchema": "refas.articulated-joint-report/v1",
        "validator": {
          "library": "validateArticulatedJointReport"
        },
        "minimumInvocation": "references/workflow.md#articulation-and-supported-clearance",
        "example": null
      }
    ]
  }
}
```

Rules for AD01:

- `id` is always the **instruction-node ID**;
- `runtimeCapabilities` contains only members of the canonical 11-capability runtime set and may contain zero, one, or several values;
- existing `owners` may retain non-runtime routing tags such as `control`, but those are not silently treated as checkpoint capabilities;
- `interfaces[]` is operation-oriented and supports multiple artifacts/actions per node;
- every interface has a stable operation ID and may independently declare CLI and/or library entrypoints;
- public library entrypoints name `scripts/lib/index.mjs`, never `scripts/lib/<implementation>.mjs`;
- `template`, `validator`, `minimumInvocation`, and `example` may be `null` when genuinely inapplicable, not when undiscovered;
- `outputSchema` names the persisted public contract where an artifact is emitted;
- instruction-only nodes use `mode: "instruction-only"` and `interfaces: []`;
- AD01 metadata must credit operations already exposed in required always-load documents rather than duplicating contradictory leaf-only descriptions;
- gate-producing interfaces should reserve an authority/evaluator field only if AD04 defines a trusted public gate evaluator; AD01 must not pre-commit the gate redesign.

## AD00 architecture decision

The current RefAs instruction graph is **semantically much more complete than its public execution discovery layer**, but the always-load workflow already exposes more of that layer than a leaf-only audit suggests. The correct next step is not to add more reconstruction semantics or another broad API. It is to formalize the existing node→multi-operation→runtime-capability relationships and then verify those public operations against runtime.

AD00 therefore recommends **AD01 GO** once this inventory is reviewed. The audit itself must be reopened if any current graph node is missing from this matrix or if a fresh-worker replay reveals an additional normal-use raw-code dependency not represented above.
