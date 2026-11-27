# Automail arm: independent production task

Use `source/reference.png` as the only visual design reference. Build one
complete editable cybernetic arm in Blender: shoulder socket, shaped upper-arm
armor, exposed actuator core, elbow, tapered forearm armor with a service panel,
wrist and five separate articulated digits. Preserve the ivory/graphite/metallic
gold design and broad proportions before adding small hardware. No body or
mannequin is part of the asset.

Interpret the whole sheet before modeling. `reference.json` records the original
bytes, panel regions, labels and ambiguities. Use metres and an explicit front/up
frame. Select a consistent neutral pose and document inferred hidden structures;
the source's diagrams are neither calibrated cameras nor physical test evidence.

## Deliver and exercise

- An editable native `.blend`, GLB, construction/correction scripts and actual
  neutral front, side, back and oblique renders.
- A named rigid-part hierarchy with meaningful shoulder, elbow, wrist and digit
  pivots. This task does not require skinning, dynamic hydraulics or a full rig.
- A local service-panel edit: move the removable forearm cover and its attached
  hardware outward by 3 mm along a declared local normal. Keep all other part
  geometry, transforms and materials unchanged. Save both states and restore
  the selected neutral baseline exactly through the production CLI.
- A separate sampled pose check of the elbow at 0, 45 and 90 degrees, with wrist
  and one finger articulation checked where implemented. Inspect actual output,
  identify intersections and static spanning links, and restore neutral. Verify
  the required parent relationships in an independently reimported GLB. A pose
  sample does not establish full collision clearance or physical performance.

Read the copied RefAs skill entry and only relevant optional guidance. Use its
public production commands for creation, changes and restoration. Save the first
complete candidate before correction, inspect actual renders, and make focused
corrections for visible problems. Retain rejected attempts and record which
images led to which changes. Keep camera/light settings fixed for each comparison.

Report actual start/end times, instructions accessed, revisions, object-level
preservation, native/export checks and unresolved visual/technical findings.
Distinguish direct measurements from source interpretation. Do not infer tokens,
cost, model identity or likeness scores from file sizes or successful commands.

This is a fresh 2.0 usability/generalization exercise, not another randomized
no-skill/1.x/2.0 comparison. Quality is reviewed separately from file integrity.
