# Initial independent usability code review

Date: 2026-11-22. Review baseline: `5fd694ade366bba9f1a977df7ebcae67625e1b9c`.
This review inspected the actual uncommitted working files, not a proposed design
or a test-count summary. It read `AGENTS.md`, the literal expanded user scope,
`PROTOCOL.md`, the changed production entry/guides, the new mesh helper and its
tests, and the package allowlist/callers. It did not review private character
geometry, appearance, or final asset acceptance. Consumer playback and final
candidates remain for a later pass.

## Decision

**Request changes before relying on this helper for the new mesh-condition
acceptance.** Two independent actual Blender counterexamples expose an inward
shell that produces a clean summary and an attachment gap that incorrectly
passes its declared threshold. The helper appropriately avoids a global readiness
verdict; that boundary does not make these incorrect or incomplete lower-level
observations safe evidence for U2.

Only this review document was written in the repository by the reviewer.
Implementation, model work, progress state, GitHub and Notion were not changed.
The full executable reproduction is retained below so the report is reproducible
without the reviewer's temporary files.

## Reviewed bytes and executions

| Item | SHA-256 / result |
| --- | --- |
| `skills/refas/scripts/production/mesh_audit.py` | `ae8d4e88fe0df187152306f4409428ebc4768171a3633fd27b6ca6a7196d82d2` |
| `tests/test_production_mesh_audit.py` | `09f2f0c9f08056a94dea760b8333139bea1fd92ba67163d798c2d33f0cf55fbd` |
| Counterexample script below | `c0c6cd79b583a2abaf54e6e51d408c3c7bb195b83fe1e8e8fdf745e1f5d56d1a` |
| Complete temporary counterexample JSON | `6e306a861c8c2b9bd568cdadb61b415c778794d6303f206cc79e8e4de7d68a06` |
| Actual runtime | Blender 4.3.2, `/usr/bin/blender` |
| Existing mesh-audit regression | 10 passed, 0 failed/skipped; unittest elapsed 1.630 s |
| Actual package/install regression | 4 passed, 0 failed/skipped; Node runner elapsed 2.770 s |
| Independent counterexample probe | Exit 0; confirmed findings R1 and R2 below |

Commands executed from the repository:

```bash
REFAS_BLENDER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_production_mesh_audit.py -v
node --test tests/production-distribution.test.mjs
blender -b --factory-startup --threads 2 --python-exit-code 1 --python /tmp/refas_usability_review_probe.py
```

These timings are execution observations, not modeling or workflow comparisons.

## R1 — An inward surface fan disappears at a shared vertex

**Priority: P1 for the intended inward/nonmanifold detection coverage.** Relevant
code: `mesh_audit.py` lines 126–151 (index-connected union and component creation),
155–174 (edge-only topology observations), and 193–203 (closed/reliable orientation).

Create an ordinary outward cube spanning `[-1, 1]³` and an inward cube spanning
`[1, 2]³`. Give them a single shared vertex at `(1, 1, 1)`, with no shared edges
and no crossing faces. The two closed surface fans have volumes +8 and −1 m³.
This is a pinched, nonmanifold vertex, and the smaller surface remains entirely
inside-out.

The current union merges both surfaces into one index component. Every edge
still has exactly two incident faces and each fan has internally consistent
winding, so the merged component qualifies as a reliable closed surface. Its
positive net volume masks the inward fan:

| Observation | Current result |
| --- | --- |
| `components` | 1 |
| `boundaryEdges`, `wireEdges`, `looseVertices` | 0 each |
| `nonManifoldEdges`, `inconsistentWindingEdges`, `degenerateTriangles` | 0 each |
| `negativeClosedComponents`, `nearZeroClosedComponents` | 0 each |
| `closedSurface`, `orientation` | `true`, `positive` |
| `orientationAdjustedVolumeM3` | approximately 7 |
| Independent `bmesh` check | Vertex 6 has `is_manifold == False` |

The same two surfaces with separate vertex indices correctly produce two
components and one negative component. The probe includes that control.
Connecting the shells with one wire edge also suppresses negative component
reporting, although that variant does at least report the wire edge and mark
orientation indeterminate.

The documented `nonManifoldEdges` definition is precise, but an edge-only
manifold check cannot justify the current reliable shell-orientation inference.
A clean outward summary here can conceal the very inverted geometry the guide
asks the author to find. This is not a demand for an exhaustive self-intersection
solver; the counterexample is detectable from vertex/face adjacency alone.

**Requested correction:** detect disconnected face fans around vertices and
prevent a singular vertex from receiving unqualified reliable shell orientation.
For orientation checks, distinguish edge-connected surface shells/fans from
vertex-connected object components, so an unrelated outward fan cannot cancel
an inward fan. Retain the useful index-component observation if desired, with
clearly separate meaning. Add this actual Blender counterexample and its
separate-shell control to regression coverage. Tests should check both the
nonmanifold-vertex observation and the inward-fan behavior rather than merely
adding a generic failure flag.

## R2 — World translation changes metric gaps and creates false degeneracy

**Priority: P2; blocks using these metric observations without a supported
precision bound.** Relevant code: `mesh_audit.py` lines 50–55 (world coordinates
rounded by `mathutils` before conversion to Python floats), 268–269 (same problem
for the anchor), and 283–285 (BVH built directly in large absolute coordinates).

Use a cube spanning `[-1, 1]³`, an Empty with the same translation, and
`anchor_local=(1.01, 0, 0)`, `meters_per_unit=1`, `max_gap_m=0.001`. The declared
local geometry places the anchor 1 cm beyond the cube face. Translation should
not change the distance.

| Common world X translation | Reported gap | `withinDeclaredGap` |
| --- | --- | --- |
| 0 m | 0.009999990463256836 m | `false` |
| 10,000 m | 0.009765625 m | `false` |
| 100,000 m | 0.0078125 m | `false` |
| 1,000,000 m | **0 m** | **`true`** |

At the final translation the mesh, transform and local anchor remain distinct
input data, but `matrix @ local` rounds the anchor to the face coordinate before
the later float conversion. The BVH also uses float32 coordinates. The return
value claims the explicit 1 mm threshold is met without any uncertainty or
precision warning.

The same path creates false mesh defects. A cube of side 0.02 m has volume
approximately `7.99999946e-6 m³` and no degenerate triangles at the origin. Merely
translating it to `(1e6, 1e6, 1e6)` makes all reported bounds coincide, all 12
triangles become degenerate, and its orientation become indeterminate. At
`(1e5, 1e5, 1e5)`, its reported volume already drops to `3.814697265625e-6 m³`.
These are translation-induced observation changes, not modifications to local
mesh topology or scale.

**Requested correction:** measure areas, volumes and distances in a common
nearby coordinate frame before float32 operations. Preserve the available local
mesh/transform information with sufficient precision when forming that frame;
rebasing after the current `matrix @ co` operation is too late. Keep world-space
report coordinates separate from the numerical calculation. If a requested
tolerance cannot be resolved from the available inputs, return an explicit
unsupported/indeterminate result rather than a false within-gap result. Add
translation-invariance controls for both `audit_mesh` and `anchor_gap`.

## Additional scope and documentation observations

1. **A local anchor does not follow mesh deformation.** The helper evaluates
   only the anchor object's transform, while it evaluates the target's actual
   surface. In the included probe a Geometry Nodes modifier moves every vertex
   of the attachment by +10 m, but `anchor_local=(1, 0, 0)` still returns zero
   gap to the cube. The attachment's evaluated bounds are around X=11 m. This
   follows the current fixed-local-point implementation and is not classified
   here as an independent mathematical defect. The guide should explicitly
   require a transform-driven anchor that follows the intended attachment, or
   an evaluated geometry point supplied through an appropriate path. Merely
   passing a skinned/deforming mesh as `anchor_obj` cannot validate an ornament
   on that moving mesh. Final clothing/assembly evidence must use actual moving
   attachment points, not treat this result as contact proof.
2. **One example import is inconsistent with the worker.**
   `references/production-topology.md` correctly uses `from mesh_audit import ...`.
   The new evidence README uses `from production.mesh_audit import ...`.
   `blender_worker.py` inserts its `production` directory, not the containing
   `scripts` directory, into `sys.path`; a script running through the worker
   from an unrelated working directory should use the former documented path.
   Align the README example or state its separate import-path setup. The
   packaged-file tests establish inclusion and CLI installation, not execution
   of this particular import example.
3. **Regression execution is opt-in.** The production workflow discovers the
   new test file but does not install Blender or set `REFAS_BLENDER_TESTS=1`.
   The actual ten-test run is valid local evidence, while ordinary CI discovery
   skips these checks. Keep that distinction explicit after the fixes. The
   existing test suite covers closed/open cubes, flipped faces, disconnected
   inward shells, reflected/scaled objects, simple modifier evaluation,
   degeneracy and fixed local anchors; it does not currently cover either
   confirmed failure above or mesh-deformed anchors.

The package allowlist additions are coherent: both the new topology guide and
mesh module are present in the actual npm payload, and all four distribution
regressions passed. The guide changes correctly distinguish original-source
likeness, mesh condition, deformation/motion, and consumer execution. They also
correctly state that signed volume, sampling, a successful import or a triangle
reduction cannot establish universal game readiness. No request is made here
to add a certification framework or to silently repair observed geometry.

## Reproduction script

Save this exact script as `/tmp/refas_usability_review_probe.py` and run the
Blender command above. Change only the absolute repository module path when
replaying in another checkout. It creates synthetic public geometry only and
writes its complete JSON to `/tmp/refas_usability_review_probe.json`.

```python
import bpy, bmesh, importlib.util, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('audit','/workspace/scratch/5765cde18054/refas/skills/refas/scripts/production/mesh_audit.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
verts=[(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]
faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def make(name, v, f, e=()):
    me=bpy.data.meshes.new(name);me.from_pydata(v,e,f);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);return ob

def summary(ob):
    result=audit.audit_mesh(ob,meters_per_unit=1)
    bm=bmesh.new();bm.from_mesh(ob.data)
    nonmanifold=[v.index for v in bm.verts if not v.is_manifold];bm.free()
    return {'stats':result['statistics'],'components':result['components'],'bmeshNonmanifoldVertices':nonmanifold}

result={}
cube=make('cube',verts,faces)
anchor=bpy.data.objects.new('anchor',None);bpy.context.collection.objects.link(anchor)
for distance in (0,10000,100000,1000000):
    cube.location.x=distance;anchor.location.x=distance
    result['gapAt'+str(distance)]=audit.anchor_gap(anchor,cube,anchor_local=(1.01,0,0),meters_per_unit=1,max_gap_m=.001)
cube.location.x=0;anchor.location.x=0
small=[tuple(1+(x+1)/2 for x in p) for p in verts]
remap={0:6,**{i:7+i for i in range(1,8)}}
joined=make('pinched-outward-and-inward',verts+small[1:],faces+[tuple(remap[i] for i in reversed(f)) for f in faces])
result['pinchedMixedOrientation']=summary(joined)
separate=make('separate-outward-and-inward',verts+small,faces+[tuple(8+i for i in reversed(f)) for f in faces])
result['separateMixedOrientation']=summary(separate)
wire_joined=make('wire-connected-outward-and-inward',verts+[tuple(x+3 for x in p) for p in small],faces+[tuple(8+i for i in reversed(f)) for f in faces],[(6,8)])
result['wireMixedOrientation']=summary(wire_joined)
for distance in (0,100000,1000000):
    fine=make('fine-cube-'+str(distance),[tuple(x*.01 for x in p) for p in verts],faces)
    fine.location=(distance,distance,distance)
    result['smallCubeAt'+str(distance)]=summary(fine)

# An explicit local anchor stays at its undeformed position under mesh deformation.
attached=make('deformed-attachment',[(.99,-.1,-.1),(1.01,-.1,-.1),(1,.1,.1)],[(0,1,2)])
nodegroup=bpy.data.node_groups.new('move-attached-geometry','GeometryNodeTree')
nodegroup.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry')
nodegroup.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
inp=nodegroup.nodes.new('NodeGroupInput');out=nodegroup.nodes.new('NodeGroupOutput');transform=nodegroup.nodes.new('GeometryNodeTransform')
transform.inputs['Translation'].default_value=(10,0,0)
nodegroup.links.new(inp.outputs['Geometry'],transform.inputs['Geometry']);nodegroup.links.new(transform.outputs['Geometry'],out.inputs['Geometry'])
modifier=attached.modifiers.new('move real geometry','NODES');modifier.node_group=nodegroup
result['undeformedAnchor']=audit.anchor_gap(attached,cube,anchor_local=(1,0,0),meters_per_unit=1,max_gap_m=.001)
result['deformedAttachmentBounds']=audit.audit_mesh(attached,meters_per_unit=1)['boundsM']
Path('/tmp/refas_usability_review_probe.json').write_text(json.dumps(result,indent=2,allow_nan=False))
print(json.dumps(result,indent=2,allow_nan=False))
```

## Retained compact counterexample results

```json
{
  "pinchedMixedOrientation": {
    "stats": {
      "vertices": 15,
      "edges": 24,
      "polygons": 12,
      "triangles": 24,
      "components": 1,
      "boundaryEdges": 0,
      "boundaryGroups": 0,
      "closedBoundaryLoops": 0,
      "wireEdges": 0,
      "looseVertices": 0,
      "nonManifoldEdges": 0,
      "inconsistentWindingEdges": 0,
      "degenerateTriangles": 0,
      "negativeClosedComponents": 0,
      "nearZeroClosedComponents": 0
    },
    "components": {
      "count": 1,
      "items": [
        {
          "index": 0,
          "firstVertex": 0,
          "vertices": 15,
          "edges": 24,
          "faces": 12,
          "triangles": 24,
          "boundaryEdges": 0,
          "wireEdges": 0,
          "nonManifoldEdges": 0,
          "inconsistentWindingEdges": 0,
          "degenerateTriangles": 0,
          "boundsM": {
            "min": [
              -1.0,
              -1.0,
              -1.0
            ],
            "max": [
              2.0,
              2.0,
              2.0
            ]
          },
          "volumeToleranceM3": 1.4029611541307907e-10,
          "worldSignedVolumeM3": 6.999999999999998,
          "closedSurface": true,
          "orientationAdjustedVolumeM3": 6.999999999999998,
          "orientation": "positive"
        }
      ],
      "truncated": false
    },
    "bmeshNonmanifoldVertices": [
      6
    ]
  },
  "separateControlNegativeComponents": 1,
  "gapAtOrigin": {
    "schema": "refas.anchor-gap/v1",
    "anchorObject": "anchor",
    "targetObject": "cube",
    "anchorLocal": [
      1.01,
      0,
      0
    ],
    "anchorWorldM": [
      1.0099999904632568,
      0.0,
      0.0
    ],
    "nearestSurfaceM": [
      1.0,
      0.0,
      0.0
    ],
    "targetTriangle": 7,
    "distanceM": 0.009999990463256836,
    "maximumGapM": 0.001,
    "withinDeclaredGap": false,
    "areaToleranceM2": 1.2e-13,
    "excludedDegenerateTriangles": 0,
    "metersPerUnit": 1.0,
    "scope": "one explicit anchor to evaluated surface; unsigned distance; no attachment or collision verdict"
  },
  "gapAtLargeTranslation": {
    "schema": "refas.anchor-gap/v1",
    "anchorObject": "anchor",
    "targetObject": "cube",
    "anchorLocal": [
      1.01,
      0,
      0
    ],
    "anchorWorldM": [
      1000001.0,
      0.0,
      0.0
    ],
    "nearestSurfaceM": [
      1000001.0,
      0.0,
      0.0
    ],
    "targetTriangle": 7,
    "distanceM": 0.0,
    "maximumGapM": 0.001,
    "withinDeclaredGap": true,
    "areaToleranceM2": 1.2e-13,
    "excludedDegenerateTriangles": 0,
    "metersPerUnit": 1.0,
    "scope": "one explicit anchor to evaluated surface; unsigned distance; no attachment or collision verdict"
  },
  "smallCubeAtOrigin": {
    "stats": {
      "vertices": 8,
      "edges": 12,
      "polygons": 6,
      "triangles": 12,
      "components": 1,
      "boundaryEdges": 0,
      "boundaryGroups": 0,
      "closedBoundaryLoops": 0,
      "wireEdges": 0,
      "looseVertices": 0,
      "nonManifoldEdges": 0,
      "inconsistentWindingEdges": 0,
      "degenerateTriangles": 0,
      "negativeClosedComponents": 0,
      "nearZeroClosedComponents": 0
    },
    "components": {
      "count": 1,
      "items": [
        {
          "index": 0,
          "firstVertex": 0,
          "vertices": 8,
          "edges": 12,
          "faces": 6,
          "triangles": 12,
          "boundaryEdges": 0,
          "wireEdges": 0,
          "nonManifoldEdges": 0,
          "inconsistentWindingEdges": 0,
          "degenerateTriangles": 0,
          "boundsM": {
            "min": [
              -0.009999999776482582,
              -0.009999999776482582,
              -0.009999999776482582
            ],
            "max": [
              0.009999999776482582,
              0.009999999776482582,
              0.009999999776482582
            ]
          },
          "volumeToleranceM3": 4.1569216594219736e-17,
          "worldSignedVolumeM3": 7.999999463558208e-06,
          "closedSurface": true,
          "orientationAdjustedVolumeM3": 7.999999463558208e-06,
          "orientation": "positive"
        }
      ],
      "truncated": false
    },
    "bmeshNonmanifoldVertices": []
  },
  "smallCubeAtLargeTranslation": {
    "stats": {
      "vertices": 8,
      "edges": 12,
      "polygons": 6,
      "triangles": 12,
      "components": 1,
      "boundaryEdges": 0,
      "boundaryGroups": 0,
      "closedBoundaryLoops": 0,
      "wireEdges": 0,
      "looseVertices": 0,
      "nonManifoldEdges": 0,
      "inconsistentWindingEdges": 0,
      "degenerateTriangles": 12,
      "negativeClosedComponents": 0,
      "nearZeroClosedComponents": 0
    },
    "components": {
      "count": 1,
      "items": [
        {
          "index": 0,
          "firstVertex": 0,
          "vertices": 8,
          "edges": 12,
          "faces": 6,
          "triangles": 12,
          "boundaryEdges": 0,
          "wireEdges": 0,
          "nonManifoldEdges": 0,
          "inconsistentWindingEdges": 0,
          "degenerateTriangles": 12,
          "boundsM": {
            "min": [
              1000000.0,
              1000000.0,
              1000000.0
            ],
            "max": [
              1000000.0,
              1000000.0,
              1000000.0
            ]
          },
          "volumeToleranceM3": 1e-36,
          "worldSignedVolumeM3": 0.0,
          "closedSurface": true,
          "orientationAdjustedVolumeM3": 0.0,
          "orientation": "indeterminate"
        }
      ],
      "truncated": false
    },
    "bmeshNonmanifoldVertices": []
  },
  "undeformedAnchor": {
    "schema": "refas.anchor-gap/v1",
    "anchorObject": "deformed-attachment",
    "targetObject": "cube",
    "anchorLocal": [
      1,
      0,
      0
    ],
    "anchorWorldM": [
      1.0,
      0.0,
      0.0
    ],
    "nearestSurfaceM": [
      1.0,
      0.0,
      0.0
    ],
    "targetTriangle": 7,
    "distanceM": 0.0,
    "maximumGapM": 0.001,
    "withinDeclaredGap": true,
    "areaToleranceM2": 1.2e-13,
    "excludedDegenerateTriangles": 0,
    "metersPerUnit": 1.0,
    "scope": "one explicit anchor to evaluated surface; unsigned distance; no attachment or collision verdict"
  },
  "deformedAttachmentBounds": {
    "min": [
      10.989999771118164,
      -0.10000000149011612,
      -0.10000000149011612
    ],
    "max": [
      11.010000228881836,
      0.10000000149011612,
      0.10000000149011612
    ]
  }
}
```
