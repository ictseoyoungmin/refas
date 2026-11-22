# Same-input renderer isolation

This repository-only experiment compares the retained 1.x CPU PBR renderer with
the retained external Blender worker. It establishes whether the same geometry,
camera and known material factors can be checked independently of the final
beauty image. It is not part of the installed 2.0 skill, an asset-quality score,
or evidence that a new model is better.

The harness imports existing code from the explicit `--legacy-root`; it does not
copy or change renderer algorithms. Source hashes are checked before and after
each run. The two renderers receive one unchanged GLB generated in the output
directory. No historical image or production asset is edited.

## Run

From the repository root, with Python, NumPy, Pillow and Blender available:

```sh
python3 -B examples/renderer-isolation/run.py \
  --legacy-root "$PWD/legacy/v1" \
  --blender /usr/bin/blender \
  --out /tmp/refas-renderer-isolation-01 \
  --size 384 --samples 32
```

Choose a new output directory; existing evidence is never overwritten. The
recorded run used Python 3.12.14, NumPy 2.3.5 and Blender 4.3.2. The harness does
not install dependencies or select an external renderer implicitly. It exits
nonzero if any declared check fails. `ok: true` means those checks passed, not
that the images have received user approval.

## Controlled inputs

The 27,120-byte fixture contains four opaque, smooth spheres (960 triangles
each). They share position/normal/index accessors; each has its own material and
translation. There are no textures, vertex colors, alpha effects, skinning,
animation or material extensions.

| Material | Linear base color | Metallic | Roughness |
| --- | --- | ---: | ---: |
| Dielectric polymer | 0.08, 0.20, 0.42 | 0 | 0.24 |
| Painted metal | 0.54, 0.08, 0.055 | 0.72 | 0.32 |
| Bare metal | 0.62, 0.66, 0.72 | 1 | 0.12 |
| Rough rubber | 0.035, 0.04, 0.045 | 0 | 0.92 |

The perspective camera is at `(0, 0.55, 8)`, looks at `(0, 0.55, 0)`, uses
`+Y` up and a 31-degree vertical FOV, and renders a square image. The camera is a
synthetic diagnostic; it is not registered to a source photograph. This also
does not change the 2.0 production review camera contract.

After import, the Blender helper records actual world-space vertices, triangle
corner normals, used material slots, camera basis and FOV, and Blender's
projected vertex coordinates. The driver checks these against the source
primitives and an independent perspective calculation. The coordinate mapping
is glTF `(x, y, z)` to Blender `(x, -z, y)`.

## Two controls and a beauty comparison

1. **Albedo and coverage:** the CPU uses its existing albedo mode. Blender emits
   each imported base-color factor without lighting, with a transparent
   background. This explicitly recorded diagnostic shader override preserves
   geometry, camera and source factors. It checks placement and coverage; the
   two output color transfers are still different.
2. **Light-direction control:** CPU vectors point from the surface toward the
   light (`L`). The external worker's SUN vector follows light propagation
   (`-L`). The matched beauty uses `-L`. A second image retains the same-sign
   convention to demonstrate the direction confound, with all other beauty
   settings unchanged. The filename `cycles-as-shipped-direction.png` refers
   only to that sign convention; it does not replay every default of the
   separate legacy CLI.
3. **Beauty:** compare the CPU result and matched-direction Cycles result after
   inspecting the identity checks. The source material factors match; the
   complete shaders and output pipelines do not.

| Setting | Retained CPU PBR | Retained Blender worker |
| --- | --- | --- |
| Shading | NumPy Cook–Torrance approximation | Cycles / imported Principled BSDF |
| Ambient | Material-dependent analytic term, recorded in JSON | World color `(0.10, 0.12, 0.14)`, strength `0.7` |
| Direct lights | Directional surface-to-light vectors | SUN propagation vectors; angular size `0.03` radians |
| Reflections | No scene ray tracing | Cycles scene reflections |
| Output | Reinhard, then gamma 2.2 for this fixture | Standard view transform, sRGB output |
| Sampling | Integer coordinates on `size - 1`, no antialiasing | Pixel centers, 32 samples, Blackman–Harris filter width 1.5 |
| Background | Fixed RGB `(15, 18, 23)` | Visible world background in beauty |

Energy and RGB inputs are recorded, but equal numeric light settings do not
prove radiometric or BRDF equivalence. The direction control and albedo control
support narrow conclusions; the beauty pair is a comparison of these declared
rendering stacks, not a test with every shading variable equal.

## Declared checks and tolerances

The result checks source/script hashes, imported object set, all triangle
coordinates, smooth-normal directions, all used material factors, actual camera,
independent projection, SUN direction, coverage and nonconstant output images.

| Quantity | Tolerance |
| --- | ---: |
| World triangle coordinates | Absolute error below `1e-6` |
| Used material factors and camera pose/basis | Absolute error below `1e-6` |
| Camera vertical FOV | Error below `1e-4` degrees |
| Independent projected coordinates | NDC error below `1e-6` |
| Smooth normals | Angular error below `0.1` degrees |
| Light propagation | Direction cosine above `1 - 1e-6` |
| Coverage | No unmatched mask pixels outside a two-pixel sampling/filter band |

Normals are not claimed to be bit-identical. The first execution rejected a
provisional componentwise normal threshold of `2e-5`. Its result and harness are
retained. A separate Blender custom-normal API round-trip, with no glTF importer
or renderer involved, reproduced the observed component error of about
`1.53e-4` and angular error of about `0.00895` degrees. The final protocol checks
normal direction with the stated angular tolerance and retains both measured
errors. This is an observation of the recorded Blender version, not a precision
guarantee for other versions.

## Output and interpretation

| Output | Purpose |
| --- | --- |
| `known-materials.glb`, `materials.json`, `camera.json` | Exact shared input and declared factors/camera |
| `commands.json`, `blender-config.json` | Actual invocation, function parameters and worker configurations |
| `blender-observed.json` | Independent imported geometry, materials, projection and actual scene settings |
| `result.json` | Checks, errors, hashes, profiles, interior color samples, timings and limits |
| `cycles-worker.json`, `cycles-as-shipped-worker.json` | Existing worker reports for both beauty renders |
| `blender.stdout`, `blender.stderr` | Actual process logs |
| Five PNGs | CPU/Cycles albedo, CPU/Cycles beauty, and same-sign SUN control |

Inspect all five images as well as the numeric result. A small coverage offset
is expected from the recorded pixel conventions. Differing background,
reflection, brightness and highlight appearance are not geometry evidence when
the independent geometry/camera checks pass. Center RGB samples are diagnostics,
not a quality score.

The recorded second run passed 11 checks: maximum position error `8.35e-8`,
projection error `1.72e-7` NDC, normal-angle error `0.00895` degrees and coverage
IoU `0.99116`, with no unmatched pixels beyond the declared band. The same-sign
SUN control visibly moved strong lighting toward the rims/back of the spheres.
The matched beauty still showed different environment, reflection and highlight
behavior, as expected from the declared settings.

Only this small opaque factor-only fixture is covered. Texture handling,
transparency, deformation, broad renderer correctness, original-reference
likeness, production model quality, authoring cost and general performance
remain outside the experiment. Timings are actual run observations: the Blender
process includes startup, import, three renders and observation, while each CPU
time covers one render call. They are not comparable benchmark scores.
