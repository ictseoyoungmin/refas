# RefAs instruction router

This file is the canonical progressive-load router for the installed RefAs skill. `SKILL.md` enters the instruction graph here. The physical installation boundary is the directory that contains this file's parent `references/` directory: normally `skills/refas/` in the repository, but Claude/Codex may install only that directory.

## Installation-root invariant

Every executable instruction and runtime dependency must resolve inside the installed skill root.

- `references/...`, `assets/...`, `scripts/...`, and the temporary compatibility routes `docs/...` resolve from the **installed skill root**.
- `references/contracts/...` is the authoritative home for detailed agent-facing contracts.
- `docs/...` inside the skill is compatibility-only and must be byte-identical to its matching `references/contracts/...` file.
- Repository-root `docs/`, `schemas/`, `tests/`, `examples/`, `tools/`, `.github/`, and `package.json` are support-layer resources, never skill execution dependencies.
- `../` traversal, absolute repository paths, and `skills/refas/...` self-prefixing are forbidden in skill instruction routes.
- `requirements.txt` at the skill root is the canonical Python dependency manifest.

The repository may depend on the skill. The skill must never depend on the repository around it. CI copies `skills/refas/` into an isolated temporary directory and reruns the boundary verifier there.

## Always-load control path

Read these before reconstruction work:

1. `references/workflow.md` — capability ownership, dependency barriers, finalization routing, and handoff behavior.
2. `references/checkpointing.md` — recoverable state, bounded edits, rollback, resume, and checkpoint authority.
3. `references/failure-routing.md` — typed findings, repair ownership, invalidation, and fail-closed routing.

## Progressive-load routes

Load only the references needed by the active capability or conditional closure path.

| Work or condition | Reference leaves |
|---|---|
| Source provenance, hierarchy, visible facts | `references/observation.md`, `references/provenance.md` |
| Camera, depth, orientation, competing spatial hypotheses | `references/spatial-reasoning.md` |
| Whole-system proportions, alignments, ordering, planes, volumes | `references/relational-structure.md` |
| Observed vs inferred vs engineered vs unknown vs forbidden authority | `references/inference-authority.md` |
| Transition from macro relational closure to lower-scope hardening | `references/whole-system-relational-barrier.md` |
| Shape/surface construction | `references/construction.md` |
| Evidence-bound parameter search and actual-render trial fitting | `references/parameter-fitting.md` |
| Organic or articulated manufactured form | `references/organic-articulated-construction.md` after `references/construction.md` |
| Parent/child placement, attachment, modular assembly | `references/assembly.md` |
| Material identity and finish | `references/appearance.md` |
| Render integrity, registered comparison, visual review, closure evidence | `references/validation.md` |
| Candidate/checkpoint/evidence provenance sealing | `references/candidate-transactions.md` |
| Controlled physical weld/boolean finalization of a logically fused group | `references/physical-fusion.md` |
| Final-GLB contact, support, penetration, and support-root validation | `references/realized-contact-support.md` |
| Claim policy, claim decision, and final authorization | `references/claim-certification.md` |
| Canonical edit source/realization boundary | `references/contracts/canonical-edit-boundary.md` |
| Attachment mode semantics | `references/contracts/attachment-semantics.md` |
| Logical fusion before physical fusion | `references/contracts/logical-fusion.md` |
| Surface-relative anchor frames | `references/contracts/surface-anchor-frames.md` |
| Rigid-follow and surface-offset propagation | `references/contracts/attachment-follow.md` |
| Simultaneous multi-owner rigid fitting | `references/contracts/multi-anchor-solver.md` |
| Articulation and supported-clearance semantics | `references/contracts/articulation-clearance.md` |
| Deterministic attachment dependency propagation | `references/contracts/attachment-propagation.md` |

## Conditional finalization and closure chain

Do not create new runtime capabilities for this chain. It is a conditional instruction path inside the existing assembly, validation, and whole-object-certification owners.

```text
logical fusion is semantically closed
  -> references/physical-fusion.md          (only when physical fusion is justified)
  -> references/realized-contact-support.md (validate the realized final GLB)
  -> references/validation.md               (current render/comparison/review evidence)
  -> references/claim-certification.md      (policy-driven final authorization)
  -> whole-object certificate
```

When constructing the certification evidence transaction used by the final authorization step, also read `references/candidate-transactions.md`. Physical fusion is optional; if no logical fusion group requires a final weld/boolean operation, skip that leaf but still run the realized structural validation required by the asset's claims.

## Graph invariant

Every Markdown leaf under `references/` must remain reachable from `SKILL.md -> references/INDEX.md`. A new reference file is incomplete until it is registered here. Every routed file must exist inside the copied skill tree. Instruction routes that escape the skill, runtime imports that escape the skill, compatibility docs that drift from their canonical contracts, or a missing skill-local dependency manifest are CI failures.
