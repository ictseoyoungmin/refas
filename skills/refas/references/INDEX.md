# RefAs instruction router

This file is the canonical progressive-load router for the RefAs skill. `SKILL.md` enters the instruction graph here; every Markdown leaf under `references/` is registered here exactly once as a routable instruction target.

## Path roots

Instruction paths are root-qualified by convention even when written without a prefix marker:

- `references/...`, `assets/...`, and `scripts/...` are resolved from the **skill root** `skills/refas/`.
- `docs/...` and `schemas/...` are resolved from the **package/repository root**.
- Never resolve these paths relative to the Markdown file that mentions them.
- Do not introduce `../` traversal or a second spelling for the same instruction target.

The npm distributable must contain every routed target. Repository CI verifies reachability and the package boundary.

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

Every reference leaf must remain reachable from `SKILL.md -> references/INDEX.md`. A new reference file is incomplete until it is registered here. A route to a missing file, a leaf omitted from this index, or a routed package-root document omitted from the npm distributable is a CI failure.