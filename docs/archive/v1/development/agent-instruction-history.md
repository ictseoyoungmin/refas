# Agent instruction cleanup — development history archive

Date: 2026-10-12

This document contains **historical implementation-stage commentary** that was removed from the installed RefAs skill's current working instructions. It is not a reconstruction procedure, a certification policy, a release gate or evidence of achieved photo-to-3D fidelity. Current runtime behavior is defined by `skills/refas/scripts/lib/`, the current installed reference contracts and their tests.

## Why the history was removed from the installed skill

Earlier integration and QA slices were documented incrementally inside `skills/refas/references/`. Phase names and projected implementation states then became visible to agents as if they were live dependencies. This can make an agent attempt development work instead of constructing geometry, or incorrectly assume that a verifier has not been implemented.

### Superseded historical statements

- `references/host-integration.md` called strict handoff a "**v1.2.1 QA-01b candidate**" and said "**QA-01a is still conservative about contact/support until QA-02 independently replays the typed plan, contact graph and candidate GLB**", and "**not ... a claim that 1.2.1 is release-ready**". Those are development-time statements, not current instructions. QA-02's `replayRealizedContactEvidence` and coverage integration now replay actual GLB contact/support evidence with positive, negative, stale and tampered tests. A real final source-bound authorization still refuses to pass when **independent original-photo semantic interpretation** is insufficient; that is a different limitation from "QA-02 not implemented". v1.2.1 was officially released; releasing the software is not certification that any source image was faithfully reconstructed.
- `references/validation.md` said a "**later early-resemblance barrier may consume**" source/candidate perceptual signatures. The implemented neutral-clay early resemblance barrier already consumes exact current evidence. The necessary authority limitations and `PROCEED/REWORK/HOLD` semantics remain in the installed validation guide.
- `references/INDEX.md` referred to "**AD01 interface descriptors**". AD01 was an implementation slice, not a public contract name. The present contract is the instruction graph's discoverable public interface descriptor.
- `references/checkpointing.md` called persisted checkpoint compatibility "**Pre-AD04**". The actual useful distinction is the **legacy gate-record shape** `{id,status,evidenceRefs}` versus the current runtime's independent re-evaluation of gate authority; the installed skill retains that compatibility detail without requiring knowledge of AD04.
- `references/contracts/control-profile.md` referred to "**future P09 bus/transport/runtime latency**"; P09 runtime binding exists and its own delay semantics remain distinct from control-profile and intrinsic actuator delays.
- `references/contracts/canonical-edit-boundary.md` referred to "**future attachment propagation**" while the attachment propagation facility exists. The statement was corrected to describe what the existing pose edit contract is and is not allowed to do.
- `references/contracts/logical-fusion.md`, `contracts/attachment-semantics.md`, `contracts/surface-anchor-frames.md` and `workflow.md` used "later stages" and "not yet" to describe *separate module ownership*. They now describe the separate current semantic/propagation/contact/fusion steps, without falsely implying an unimplemented feature. Their distinct contracts are preserved.
- `references/single-view-volumetric-reasoning-example.md` referred to "**future dogfood**". It is a worked current troubleshooting example, not a planned test.
- `skills/refas/SKILL.md` front matter advertised a "visually certified 3D asset". Capability descriptions should not imply that independent photo semantic fidelity is always certifiable; current strict source-bound final handoff remains fail-closed when source meaning cannot be independently established.

## Boundaries retained intentionally

- **Contract identities:** Names such as `refas.* /v1`, `P01`–`P16` where they label actual physical semantics modules, `VC01/VC02/VC03` where they identify specific runtime evidence, and `R03/R04` when an operator must locate a real existing artifact are not development promises. They remain where removing them would break public interface alignment or understanding.
- **Live compatibility:** Old checkpoint gate shapes and deprecated finding categories remain documented when the runtime actually reads them. Compatibility is operational guidance, not backlog text.
- **Release and implementation history:** Version-by-version narratives and project plans belong here, `CHANGELOG.md`, `docs/development/` or `docs/architecture.md`, not in the required installed instructions.
- **Known limits:** Missing independent original-photo positive semantic evidence remains clearly disclosed in current user and agent instructions. Green CI, a valid GLB, a generic certificate or a successful draft handoff do **not** establish image likeness.
- **Source of truth:** No present-tense command, validation rule, parameter, gate or authority should be downgraded merely to simplify prose.

## Future maintenance rule

When shipping a new feature, update only its **current callable usage**, concrete inputs/outputs, ownership, and actual failure handling inside the installed skill. Record slice chronology, anticipated features, release readiness and deferred problems under `docs/development/`; user-facing README describes the Foundry's available capabilities and limitations, not a running implementation diary.

See also `docs/development/foundry-production-roadmap.md` for the construction-first product priorities and `CHANGELOG.md` for version chronology.
