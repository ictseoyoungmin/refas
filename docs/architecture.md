# RefAs 1.0 architecture

## Architecture contract

The distributable skill at `skills/refas/` is the product boundary and the single runtime authority. Tests, examples, and package exports import it directly. Repository tooling may validate or package the skill but must not implement a competing reconstruction engine.

## Capability graph

| Order | Capability | Authoritative output |
|---:|---|---|
| 1 | `source-intake` | immutable source identity and acquisition context |
| 2 | `visual-hierarchy` | whole-to-feature scopes with context-preserving ROIs |
| 3 | `visual-observation` | source-cited facts, interpretations, hypotheses, ambiguities |
| 4 | `spatial-hypotheses` | ranked camera, depth, orientation, and hidden-form alternatives |
| 5 | `shape-reconstruction` | silhouette, mass, curvature, thickness, coarse negative space |
| 6 | `surface-topology` | projection-anchored cells, seams, ribs, relief, and shared boundaries |
| 7 | `assembly` | reference-frame registration and immutable child placement |
| 8 | `appearance` | evidence-supported color, roughness, metalness, and finish |
| 9 | `rendering` | reproducible actual multiview images and camera records |
| 10 | `visual-critique` | typed finding ledger with evidence references |
| 11 | `whole-object-certification` | fail-closed certificate over current gates and an independent digest-bound visual review |

Each finding is owned by exactly one capability. Reopening an owner invalidates the owner and its transitive dependents, while upstream evidence and unrelated scopes remain intact.

## Project state

```text
project/
├── source/                 primary images and manifests
├── evidence/               deterministic observation aids
├── model/                  hierarchy, observations, hypotheses, specifications
├── assets/                 GLB assets and closed children
├── renders/                actual frames and review boards
├── reviews/                findings, metrics, and gate evidence
└── .refas/
    ├── project.json        active head and recovery state
    ├── checkpoints/        immutable semantic checkpoint records
    ├── objects/            content-addressed artifact bytes
    ├── decisions/          edit and failure-routing decisions
    └── certification.json  current whole-object certificate
```

Checkpoint IDs are content-derived. Timestamps are metadata and do not decide identity. An artifact reference is recoverable only when its exact bytes exist in `.refas/objects/` and match the recorded SHA-256.

## Bounded edit transaction

A transaction contains one baseline checkpoint, one capability, one hierarchy scope, one testable intent, protected metrics, and exactly one direct candidate checkpoint.

Possible decisions are:

- `KEEP_EDIT`: objective improved without a protected regression.
- `ROLLBACK_EDIT`: the baseline bytes are restored.
- `REOPEN_OWNER`: a typed blocker selects an owner and pre-owner checkpoint.
- `REQUEST_REVIEW`: evidence is insufficient or utility is tied; baseline remains active.
- `MAY_CLOSE`: all declared local closure gates pass.
- A whole-object certificate additionally requires a `refas.visual-review/v1` artifact bound to the exact source and asset digests. When appearance passes, it must cite a valid `refas.pbr-render-report/v1` and digest-bound frames from an independent PBR renderer. Local gate strings cannot override its verdict or findings.

Rejected candidates remain in checkpoint history as evidence, but they do not become the active head.

## Runtime boundary

The dependency-light JavaScript core owns:

- canonical JSON and SHA-256;
- hierarchy and observation contracts;
- spatial hypotheses and 2D reference registration;
- deterministic mesh and embedded GLB construction;
- shared-boundary surface networks;
- immutable child composition and assembly validation;
- digest-bound portable-integrity and independent-PBR visual-review validation with fail-closed certification readiness;
- an external-process PBR boundary: the bundled Cook–Torrance fallback and optional Blender/Three.js/Filament/glTF Sample Viewer/VTK workers emit the same renderer report without linking those engines into RefAs;
- checkpoint object storage, restore, audit, and failure routing.

Pillow and NumPy provide portable evidence generation and software rendering. Their outputs are observation and validation aids. They never replace agent inspection of the raw source.

## Truth and uncertainty

Single-view depth, hidden topology, symmetry, physical dimensions, and material identity are not facts unless evidence supports them. RefAs stores plausible alternatives and falsifiers instead of collapsing uncertainty into a convenient mesh.

Metrics summarize evidence but cannot choose a repair owner. The repair unit is always a localized, typed visual finding.
