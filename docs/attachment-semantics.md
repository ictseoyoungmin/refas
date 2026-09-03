# Attachment semantics

RefAs records why one semantic part should follow, fuse with, remain offset from, articulate relative to, or stay independent of another part before it attempts geometric propagation or contact validation.

Attachment semantics are canonical construction state. They do not move geometry by themselves and they do not authorize closure. Later propagation and realized-contact stages consume these relations.

## Modes

| Mode | Meaning | Owner count | Solver later? |
|---|---|---:|---:|
| `FUSED` | subject belongs to the same logical body as its owner and will participate in a later fusion bake | 1 | no for declaration; fusion logic follows |
| `RIGID_FOLLOW` | subject keeps a fixed owner-local transform | 1 | no |
| `SURFACE_OFFSET` | subject follows an owner surface frame while preserving an offset | 1 | yes |
| `MULTI_ANCHOR` | subject satisfies anchors on two or more owners | 2+ | yes |
| `ARTICULATED` | subject is attached through a joint frame | 1 | yes |
| `SUPPORTED_CLEARANCE` | subject may remain physically separated from one or more owners while a declared support path keeps it valid | 1+ | yes |
| `FREE` | subject intentionally has no attachment owner | 0 | no |

Every declared entity must have an explicit relation, including `FREE`. There is no implicit "looks attached" default.

## Owner and dependent direction

Relations are directed from owner to subject. Changing an owner may invalidate its dependents; the relation itself does not yet prescribe the propagation algorithm.

```text
owner head-shell
├─ FUSED → face
├─ FUSED → nose
├─ FUSED → left-ear
└─ FUSED → right-ear

nose ────────┐
left-ear ────┼─ MULTI_ANCHOR → glasses
right-ear ───┘
```

This direction makes stale dependent state detectable. The runtime rejects self-attachment, unknown owners, and ownership cycles.

## Mannequin glasses example

A mannequin head may be authored as separate semantic parts while the body remains logically unified:

```text
head-shell       FREE root
face             FUSED → head-shell
nose             FUSED → head-shell
mouth            FUSED → head-shell
left-ear         FUSED → head-shell
right-ear        FUSED → head-shell
glasses          MULTI_ANCHOR → nose + left-ear + right-ear
```

Lowering the nose must therefore invalidate the glasses relation in a later propagation stage instead of leaving the glasses at an unrelated world coordinate. This file only declares that semantic obligation. Surface anchor frames and the multi-anchor solver are separate later capabilities.

## Evidence basis

Each relation records a basis:

- `observed`: directly visible support/attachment evidence;
- `interpreted`: a bounded reconstruction interpretation;
- `construction`: a semantic construction decision required to realize the asset.

Every relation and entity carries evidence references so later repair can distinguish source observation from implementation choice.

## Fail-closed rules

`createAttachmentSemantics` rejects:

- missing or unknown modes;
- entities without an explicit relation;
- a `FREE` entity with an owner;
- `MULTI_ANCHOR` with fewer than two owners;
- single-owner modes with the wrong owner count;
- unknown owners or subjects;
- self attachment;
- ownership cycles;
- missing evidence references.

The contract intentionally does not yet solve transforms, fuse meshes, compute surface anchors, or validate mesh-to-mesh contact. Those operations depend on this semantic graph rather than replacing it.
