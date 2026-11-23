# RefAs 1.0 development plan

This document records the route that produced the stable 1.0 product boundary. It is a release-history document, not the roadmap for the next architecture cycle.

| Workstream | Completion evidence |
|---|---|
| Evidence recovery | Closure-time visual boards and project snapshots were inspected; reusable behavior was separated from historical naming and transient state. |
| Architecture freeze | The distributable skill became the single runtime authority; repository tests and examples import it directly. |
| Truth contracts | Source, hierarchy, observation, uncertainty, registration, surface topology, assembly, finding, checkpoint, candidate-transaction, claim-policy, visual-review, and certificate contracts are explicit and content-bound. |
| Recovery runtime | Artifact bytes are content-addressed, bounded edits have one direct candidate, findings apply typed recovery state, and `resume` names one safe next action. |
| Reconstruction runtime | Watertight geometry, embedded GLB, immutable child composition, shared boundaries, attachment propagation, realized structural evidence, multiview rendering, independent PBR evidence, and owner-local fitting are present. |
| Certification authority | Exact candidate/evidence provenance is sealed into a transaction; claim policy controls evidence obligations; claim decisions reproduce before certificate issuance; weaker re-signed policy, replay, substitution, forgery, and cross-claim attacks fail closed. |
| Agent UX | Capability-specific references, templates, actionable CLI errors, handoff capsules, status, audit, and certification are aligned with the runtime boundary. |
| Dogfood | Repository fixtures cover reconstruction/recovery, parameter fitting, independent PBR, hard-surface topology, modular assembly, articulated geometry, and benchmark execution. Their claims remain limited to the evidence each fixture actually supplies. |
| Release | Repository checks, package audit, cross-Node CI, full Node 24 dogfood chain, release audit, release demo, changelog, and known-limit documentation define the v1.0.0 cut. |

## Version boundary

Version 1.0.0 promises stable semantic capability names, artifact schema identifiers, checkpoint/recovery semantics, candidate provenance and claim-certification meanings, and canonical runtime entry points as shipped by this release.

Asset-specific coordinates, materials, camera hypotheses, review thresholds, and project-specific worker implementations remain project data. They may evolve without changing the reusable architecture when public contract meaning is preserved.

## Explicitly deferred from 1.0

The first release does not retroactively claim fully resolved terminal 3D orientation from ambiguous single views, unseen manufacturer-specific internal mechanisms, or calibrated simulation-ready physical truth. Those limits are documented in `docs/known-limitations.md`.

Future work on full oriented frames, parent-child twist, engineering-inference authority, physical assembly, and cross-representation simulation verification belongs to a post-release architecture cycle rather than this release baseline.

## Post-1.0 change rule

A change that alters ownership, invalidation, source authority, checkpoint identity, candidate-provenance meaning, certification authority, or public schema meaning requires an explicit compatibility/migration decision and an appropriate semantic-version increment.

Additive primitives or validators may be introduced when they preserve these contracts and do not silently strengthen an old certificate claim after the fact.
