# Mesh condition, retopology and optimization

Use this guide when a mesh must deform, move as an assembly, or fit a delivery
budget. Keep the detailed editable source and create a recoverable candidate.

## Inspect before choosing an operation

Inspect actual evaluated geometry, including modifiers and the declared pose.
Locate unexpected boundary edges, nonmanifold junctions, loose elements,
degenerate faces, inconsistent winding and inward closed components. Inspect
self-intersections and contact near the affected parts. A signed volume for
the entire object can hide one inverted component inside another outward one.
Negative object scale and inner/outer shell surfaces need explicit interpretation.

Classify the surface before repairing it. A garment has intended neck, front,
hem and cuff openings; armor may contain access holes; chains have separate
links. Blindly filling every boundary or joining all components destroys these
designs. Check attachment points against the actual receiving surface and pose.
Parenting and object names alone do not establish support or connection.

An ordinary production Blender script can use the installed observation helper:

```python
import json
from pathlib import Path
from mesh_audit import audit_mesh, anchor_gap

scale = bpy.context.scene.unit_settings.scale_length
observed = audit_mesh(bpy.data.objects["garment"], meters_per_unit=scale)
Path(REFAS_OUTPUT_DIR, "mesh-observations.json").write_text(
    json.dumps(observed, indent=2, allow_nan=False) + "\n", encoding="utf-8")
```

The worker makes its bundled modules importable. `audit_mesh` examines one
evaluated object at the current frame and reports bounded details, tolerances
and observation scope. Surface components joined only at a vertex are examined
separately; check nonmanifold vertices as well as edges. `anchor_gap` checks a
fixed object-local attachment point against a named evaluated target surface
and an explicit maximum distance. That point follows its object transform,
not a skin, shape key or modifier; measure an actual evaluated point for a
deforming garment. A distance overlapping numerical uncertainty returns an
explicit indeterminate result, which must not be treated as within the limit.
These helpers
do not assign visual or game-readiness approval, infer intended openings, or
perform an exhaustive scene collision scan. Save additional findings into
`REFAS_OUTPUT_DIR` so the existing revision inventory retains them with the
candidate. Inspect suspicious locations in actual geometry and renders.

## Retopologize for function

Choose topology that follows the form and deformation. For clothing, place
connected loops around armholes, shoulders and elbows and enough controlled
loops through torso bends. For rigid armor, use purposeful panel sections,
thickness and edge support while keeping moving parts separate. Preserve
source-visible asymmetry and named edit regions.

Rebuild a mesh over the source surface when its existing edges cannot express
the required deformation or density. Project the new surface carefully and
inspect it from several views. Generic voxel remeshing or triangulated
decimation may be useful intermediate operations; neither alone demonstrates
deformation-friendly edge flow. Retopology can also be a deliberate local
rebuild, provided its affected region and benefit are shown.

Transfer and verify UVs, material boundaries, weights, shape keys and semantic
attachments required by the task. Preserve untouched data. Record deliberate
loss or replacement and test the resulting use; do not describe newly generated
UVs as preservation. Inspect wireframe and the actual deformed surface before
calling the topology suitable.

## Optimize against a declared budget

Choose the target consumer, intended viewing distance and task-specific limits
before selecting the delivery candidate. Record base, evaluated and exported
vertices/triangles, material primitives, skin influences, file bytes and any
LOD choices. Primitive count is an indicator, not a measured frame-time or
draw-call guarantee. There is no universal polygon budget for every game or film.

Reduce geometry where it has little effect: excessive subdivision or bevel
segments, invisible repeated internal detail and over-tessellated small parts.
Keep silhouette, openings, armor layers and joint clearances. Consolidate
rigid parts only when they share motion/material needs and retain a mapping to
the editable source. Do not remove defining features just to meet a count.

Compare the candidate against the source with fixed cameras and identical
poses. Measure surface deviation in both directions with stated sampling and
units; a few sampled vertices are not an exhaustive maximum-error bound.
Inspect silhouette, shading, UV seams, material boundaries, thin features and
the worst measured regions. Keep an over-aggressive failed reduction as a
rejected candidate and revise the responsible part.

## Reopen and exercise the deliverable

Repeat the relevant topology, attachment and pose checks after export/import.
Play skinning or rigid animation in the declared consumer and inspect its
actual result. An animated node count does not prove an actuator stays joined,
and an engine import does not prove an acceptable frame budget. Keep engine
playback, deformation/clearance, visual likeness and measured performance
claims separate. Deliver the source, selected optimized asset, reproducible
operations and the exact tested range or remaining limitations.

Further reference: [Blender retopology](https://docs.blender.org/manual/en/latest/modeling/meshes/retopology.html)
and [glTF export](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html).
Verify exporter options against the installed Blender version.
