# Articulation and supported clearance

RefAs treats articulation and intentional clearance as explicit assembly semantics. Neither case is represented by an unconstrained world transform or by a visual guess that two parts merely appear connected.

## Bounded revolute articulation

The first `ARTICULATED` primitive is a bounded revolute joint. It stores two rigid frames:

- an owner-local joint frame;
- a subject-local joint frame.

The owner joint frame's local Z axis is the revolute axis. The zero configuration is the pose where the two joint frames coincide. At a requested angle the target is:

```text
subject world
  = owner world
  × owner joint frame
  × rotation-about-local-Z(angle)
  × inverse(subject joint frame)
```

The angle must remain inside the declared minimum/maximum interval, whose span is at most one full turn. Evaluation emits a target rigid frame only. It does not edit mesh bytes or authorize closure.

This preserves the actual pivot. If the subject joint frame is offset from the subject origin, rotation moves the origin around the pivot rather than rotating the object around an unrelated world-space center.

## Supported clearance

`SUPPORTED_CLEARANCE` means a subject may intentionally remain separated from another part while still having an explicit structural support path.

Example:

```text
panel ──supported by──> bracket ──rigidly follows──> housing
  │
  └──── intentional 0.08–0.12 gap from housing
```

The support path must be a real path through the attachment semantic graph. An edge cannot be invented merely because two parts are nearby. Every path edge is also bound to a realized-assembly attachment proof ID.

The clearance contract separately declares one or more counterpart gap ranges. A positive gap is allowed; direct contact with the clearance counterpart is not required. However, the gap and the complete support path must be demonstrated by a valid, digest-bound `refas.realized-assembly-proof/v1` derived from the realized GLB.

`SATISFIED` therefore means both:

1. every declared support edge has passing realized support/contact evidence with no penetration; and
2. every declared signed-clearance measurement is inside its local bound.

If either condition fails, the report is `BLOCKED`. The runtime must not invent a hidden brace, convert a gap to contact, or move geometry to force a pass.

## Public artifacts

- `refas.articulated-joint/v1`: bounded revolute definition, joint frames, axis convention, and limits.
- `refas.articulated-joint-report/v1`: one angle evaluation and deterministic subject target frame.
- `refas.supported-clearance/v1`: semantic support path, realized-proof bindings, and local gap bounds.
- `refas.supported-clearance-report/v1`: digest-bound evaluation against one exact realized assembly proof.

These artifacts are assembly state/evidence. They do not replace later graph ordering, transform realization, whole-object contact review, or certification.
