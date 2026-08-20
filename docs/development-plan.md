# RefAs 1.0 development plan

This plan records the completed route from an unstable prototype to the 1.0 product boundary. Workstream labels describe product meaning and are not runtime identities.

| Workstream | Completion evidence |
|---|---|
| Evidence recovery | Closure-time visual boards and project snapshots were inspected; reusable behavior was separated from historical naming and state. |
| Architecture freeze | The distributable skill became the single runtime authority; repository tests and examples import it directly. |
| Truth contracts | Source, hierarchy, observation, uncertainty, registration, surface network, assembly, finding, checkpoint, and certificate contracts were fixed. |
| Recovery runtime | Artifact bytes are content-addressed, bounded edits have one candidate, findings apply typed rollback state, and `resume` names one safe next action. |
| Reconstruction runtime | Watertight geometry, embedded GLB, immutable child composition, shared boundaries, assembly validation, and multiview rendering were closed. |
| Agent UX | Capability-specific references, templates, actionable CLI errors, handoff capsules, status, audit, and certification were aligned. |
| Dogfood | The licensed wing-cover fixture completed source intake through certification, including a deliberately defective candidate and exact rollback. |
| Release | Automated tests, naming/architecture audit, package audit, and official skill validation passed for 1.0.0. |

## Version boundary

Version 1.0.0 promises stable semantic capability names, artifact schema identifiers, checkpoint and recovery semantics, and canonical runtime entry points. Asset-specific coordinates, materials, camera hypotheses, and review thresholds remain project data and may evolve without changing the reusable architecture.

## Post-1.0 change rule

A change that alters ownership, invalidation, source authority, checkpoint identity, or public schema meaning requires a documented migration and an appropriate semantic-version increment. New primitives or validators may be additive when they preserve these contracts.
