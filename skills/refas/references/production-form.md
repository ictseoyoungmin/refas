# Whole form, sculpt and mesh operations

Use this guide when the reference is best approached as a complete volume, or
when cutting, engraving or combining forms helps an existing model. Read the
original image first. Choose a few primary proportions, silhouette landmarks,
negative spaces and characteristic transitions. Check the combined shape from
the source view and a useful side or rear view before investing in decoration.

## Choose the construction that expresses the shape

Start with a blockout whose topology allows the intended next edit. An outline
and section cage may describe a vehicle or folded shell better than assembled
primitives; an evenly sampled volume may suit broad sculpting. Use
`surface_patch.sample_profile` and `surface_patch.build_surface` for explicitly
connected outlines/sections; see `production-assemblies.md`. Ordinary mesh
modeling, sculpt, curves and lattice can be combined with those surfaces.

Inspect a neutral material to judge the whole volume. If proportions are wrong,
change that volume even when small parts have already been made. Build separate
parts when a real seam, removable component, joint or different material makes
them useful. Inspect their assembly early and after changes. Neither one-piece
construction nor part-first assembly is compulsory.

| Need | Useful operation | Inspect next |
| --- | --- | --- |
| Whole silhouette or broad proportion | Cage edit, `sculpt_brush` GRAB, native lattice | Combined silhouette and depth |
| Rounded transition, raised mass or flattened area | SMOOTH, DRAW, INFLATE, FLATTEN | Evaluated curvature and nearby surfaces |
| Explicit outline or controlled section | Shared `build_surface` boundaries | Continuity, corners and thickness |
| Through-opening or arbitrary prepared cut | `boolean_form` DIFFERENCE | Actual walls, openings and manifoldness |
| Union of intersecting volumes | `boolean_form` UNION | Combined volume, seams and remeshing needs |
| Incised line or pattern | `engrave_path` | Groove depth, intersection and remaining wall |
| Blind pocket with sampled floor/wall bounds | `cut_recess` | The declared samples and visible cavity |

Use a production revision before a destructive remesh, applied Boolean or
topology replacement. A dense mesh alone cannot supply the missing shape.
Refine or remesh when the current cage cannot support the intended feature;
UVs, weights and shape keys need explicit transfer if topology changes.

## Reshape the whole or a masked region

`from sculpt import sculpt_brush` edits an existing single-user mesh in Object
Mode. `center`, `radius`, GRAB `delta` and DRAW/FLATTEN `direction` use world
coordinates. Lengths use the scene's world coordinate unit. Radius is positive.
The brush has a smooth radial falloff and touches only the selected support.

| Operation | Inputs | Effect |
| --- | --- | --- |
| `GRAB` | `delta=(x,y,z)` | Moves the supported cage by a weighted world displacement |
| `DRAW` | `direction`, signed `strength` | Moves along a chosen world direction |
| `INFLATE` | signed `strength` | Moves along the cage's world-space vertex normals |
| `SMOOTH` | `strength` in 0..1, optional `iterations` | Relaxes neighboring cage positions |
| `FLATTEN` | `direction`, `strength` in 0..1 | Moves toward the plane through `center` |

`mask` can be existing vertex indices or a weighted vertex-group name. Omit it
for the whole cage. `pin_boundary=True` freezes open boundary vertices. Optional
`symmetry=('X',)` reflects the brush about world planes through
`symmetry_origin`; overlapping reflected brushes do not add their strengths.
Do not impose symmetry when the source is asymmetric.

```python
from sculpt import sculpt_brush

# body is an existing scene mesh. Read the whole form before choosing these
# world-space measurements; the numbers illustrate the call, not a reference.
result = sculpt_brush(body, operation='GRAB', center=(1.2, 0, 0.3),
                      radius=0.9, delta=(0.1, 0, 0.08))
sculpt_brush(body, operation='SMOOTH', center=(1.2, 0, 0.3),
             radius=0.5, strength=0.2, iterations=2)
```

The result reports affected/changed vertex counts, maximum displacement and
storage error. A brush outside the mesh can return `no-effect`; it is not a
shape improvement. Inspect the render after a meaningful edit.

The object, parent, materials, UVs, groups and modifiers remain ordinary Blender
data. Existing shape keys receive the same local displacement, retaining their
relative offsets. The brush edits the **base cage**, before modifiers, posing
and active shape-key deformation. Its center is not a hit on the evaluated
surface. Inspect both the base and evaluated form, especially with armatures,
Boolean operands or large deformations. The helper does not add vertices,
guarantee thickness or prevent intersections. Invalid or unrepresentable edits
restore the stored coordinates. Use `edit_region` for supported explicit handle
targets and sampled distance bounds instead of treating this brush as a solver.

## Cut or combine prepared forms

`from mesh_form import boolean_form` takes a scene-linked target and prepared
mesh operand. Both must evaluate to closed, consistently wound solids at the
chosen stack position; the operand must be one connected solid. Use `DIFFERENCE` for an opening, `UNION` for a combined volume,
or `INTERSECT` to retain their overlap. Blender's native Exact Boolean stays
editable. The target cage, object identity, parent and existing layers survive;
the evaluated topology can change.

```python
import bpy
from mesh_form import boolean_form

# Prepare a closed solid crossing the intended opening. Place and size it
# against the actual body rather than guessing from a front view alone.
bpy.ops.mesh.primitive_cube_add(size=1, location=(1.15, 0, 0.15))
cutter = bpy.context.object
cutter.name = 'OpeningCutter'
cutter.scale = (0.45, 2.0, 0.35)
boolean_form(body, 'Opening', operand=cutter, operation='DIFFERENCE')
```

The operand becomes an enabled construction mesh with `hide_render=True`.
It remains in the native scene and drives the Boolean; production framing and
GLB omit its own surface. Do not disable or unlink it. A prepared part is still
an ordinary asset until you explicitly use it as this operation's operand.
To reuse a cutter for a different feature, create a new object from a copied
mesh datablock and set its intended transform. A whole-object copy also copies
the existing feature ownership and is rejected; it is not an independent cutter.

By default, a new operation is placed before trailing Bevel/Weighted Normal/
Triangulate finishes; an existing operation keeps its position. Use
`before='ExistingModifierName'` to specify the intended position.
For an open shell, cut after Solidify has produced a closed solid. Cutting
before Solidify is supported only if that earlier stage is already solid.
Reusing the operation name edits that native
operation instead of stacking duplicates. Edit the retained cutter with
ordinary Blender tools for later corrections.

Use closed, consistently wound solids for predictable solid operations. Nearly
tangent surfaces, coplanar overlaps and self-intersections need inspection.
The helper rejects empty or unmeasurably changed results and disconnected unions;
UNION needs both a real overlap and added volume. Its current-frame solid/volume
observations do not establish freedom from self-intersections, good edge flow
or visual quality. Inspect new face materials/UVs, the interior and the reopened export;
prepare a suitable deformation mesh if the result must bend.

## Engrave a path on the form

`from mesh_form import engrave_path` builds a round-section cutter from
world-space `points` and a positive `radius`, then retains a DIFFERENCE Boolean.
Choose the path from the actual surface. Position its center so its cross-section
intersects the solid to the intended depth; it does not automatically project
the path onto the host. Use `cyclic=True` for a closed outline.

```python
from mesh_form import engrave_path

# Example on a locally flat top at z=0.55: the tube intersects the surface.
engrave_path(body, 'PanelGroove',
             points=[(-0.8, -0.3, 0.54), (0.3, -0.3, 0.54),
                     (0.55, -0.1, 0.54)], radius=0.035)
```

For a curved host, sample or deliberately author points on that surface, with
consistent inward depth. A separate raised ornament can instead use a prepared
solid with UNION. Keep a removable ornament separate and use the mounting
guide when it must follow later host edits.

Reusing the path operation name updates its retained cutter. Its source mesh
stays editable and follows the target transform. Inspect groove corners,
remaining thickness and nearby openings. The helper neither recognizes a
pattern from an image nor certifies minimum wall thickness. Use a different
native technique when a round cutter does not express the desired section.

## Continue from the whole to detail and back

Preserve a useful native revision before each meaningful change. Compare the
new render with the original and previous revision at fixed framing. Check
large volume, openings and part relationships before judging small decoration.
If the detail weakens the form, revise or remove it; if the whole shape needs a
broader correction, return to the cage and revisit affected cutters/mounts.

Keep the editable native model for continued authoring. Delivery evaluates
supported static modifiers and excludes construction surfaces. Shape-key or
skinned meshes with unapplied non-armature modifiers need an explicit delivery
decision; static Boolean evaluation does not bake deformation or motion. Read
`production-topology.md` for evaluated checks and `production-review.md` for
fixed views. Passing a command or a topology check does not approve resemblance
or visual quality.
