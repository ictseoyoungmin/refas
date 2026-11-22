# AURIX compound-shell refinement

Date: **2026-11-22, Asia/Seoul**. This is an informed refinement of the actual
arm delivered at `e265a35f`, using the production skill frozen at `94930b3d`.
It is not a fresh no-skill/1.x/2.0 comparison. The earlier negative comparison
remains unchanged. Independent visual acceptance is recorded by the lead
outside this author report.

## Selected result and visible changes

Selected revision: **`358e1ecd90204e388120b258ceabf042`**. Final restored head:
**`94657a5cbc04466295f601f6620b1ea2`**. The editable selected native and GLB are
`after.blend` / `after.glb` in the author output package; the post-exercise
`candidate.blend` / `candidate.glb` copies have the same respective hashes.
See [delivery identities](delivery-identities.json).

The original baseline was reopened and imported through the public production
CLI. Its scene fingerprint remains exact; resaving the native file changes
its container bytes, while the original input file remains untouched. The
BEFORE is a rerender of that unchanged scene using the same observation
conditions as the AFTER.

- The shoulder socket has stepped axial/radial housing surfaces, recessed
  bores, nested narrow rims and shaped locking segments. Its existing named
  components remain individually editable.
- Both forearm front shells now vary in width, depth and convex transverse
  section. Independent lateral shells curve around them while leaving a
  long exposed mechanical channel. The two side profiles are asymmetric.
- The palm has a closed volumetric base and separate dorsal plates. Following
  lead review, the excessive first palm bulge was reduced; the center pad is
  shallow and the side pads have separate, asymmetric extents. Finger mesh
  geometry and joint pivots remain unchanged.

The major forearm surface still reads as a comparatively simple smooth white
blade. The upper arm remains much sparser than the source's dense nested
mechanisms, the socket retains a broad bilateral spool-like silhouette, and
the hand is still a schematic assembly. Small labels and bevels do not resolve
those source-fit differences. No finished-asset verdict is asserted here.

| Actual comparison | BEFORE | AFTER |
| --- | --- | --- |
| Whole three-quarter | [Hero](renders/before/hero.png) | [Hero](renders/after/hero.png) |
| Side and negative space | [Side](renders/before/side.png) | [Side](renders/after/side.png) |
| Forearm depth | [Detail](renders/before/armor-depth.png) | [Detail](renders/after/armor-depth.png) |
| Shoulder layers | [Detail](renders/before/socket-depth.png) | [Detail](renders/after/socket-depth.png) |
| Palm volume | [Detail](renders/before/palm-depth.png) | [Detail](renders/after/palm-depth.png) |

## Evidence and bounded technical checks

All eight matched views use Blender **4.3.2**, Cycles CPU, **512 × 512**, **16
samples**, AgX, no denoising, and the same camera, target, scale, light rig,
background and source-region association. The five existing review views are
unchanged; three additional detail views are fixed for both candidates.
[Observation checks](observation-check.json) compare the actual records.
These cameras are **unregistered** to the concept sheet.

The selected arm has **300 objects, 280 meshes, 201,632 evaluated triangles**.
Its evaluated height is **743.095 mm**, unchanged from the baseline, compared
with the source's approximate 760 mm label. Scale, all 20 hierarchy empties,
and digit pivot locations remain unchanged. Section depths, rear cavities and
overlap trajectories are visually inferred rather than calibrated dimensions.

Exactly **44 existing objects** change and no objects are added or removed.
The other **256 object records** retain exact fingerprints, transforms,
modifiers, material state and parent relationships. This includes the whole
service-cover subtree, finger chains, joints, actuators and rails. The
[preservation summary](refinement-summary.json) names every changed and
protected object. Existing material datablock parameters are untouched. The
socket backs use the existing dark recess material; the palm base uses a
private graphite copy with metallic 0.08 and roughness 0.52.

Independent native reopening checks all 44 changed meshes. **42 have no
boundary edges, nonmanifold edges or zero-area faces after modifiers.** The
two moved, pre-existing lettering meshes retain 796 and 224 boundary edges;
their topology was not rebuilt. Shell modifier thickness is 4 mm at the crown,
3.4 mm at front forearm armor, 3 mm at lateral armor and 2.5 mm at dorsal palm
plates, in object-local coordinates. The report retains object scale and
evaluated world bounds; these settings are not a uniform world-thickness
certificate. Closed topology also does not prove nonintersection or physical
manufacturability. See [native inspection](native-inspection.json).

The service cover and its 25 descendants move **3 mm along local +Y**. All
**274 other objects** remain unchanged, and the selected subtree preserves
geometry, material, modifiers and parents. The full state comparison is in
[the compressed preservation record](panel-preservation.json.gz).

Restoration after the cover edit and after the pose sequence returns **all
16 selected artifact/input files byte-for-byte**, including the eight renders,
native, GLB, scene record and captured inputs. The selected revision remains
available independently of the final restored revision.
[Exercise summary](exercise-summary.json) and [integrity result](integrity-check.json)
record the actual results.

Four saved pose samples exercise elbow **0°, 45°, 90°**, then elbow 45° with
wrist 20° and index joints 35°/20°/10°. Each tests 30 named upper-armor/forearm
triangle-surface pairs and reports no intersection in that limited set.
The actual pose images were inspected. This excludes containment, all-part
interference, continuous movement, working hydraulics, loads and physics.

An independent factory-startup GLB import retains **300 named nodes and all
required parents**, no matrix differences over 1e-5, and maximum bounds error
**4.25e-9 m**. Its service-cover displacement and analytic elbow/wrist/finger
orbits pass. See [GLB checks](export-check.json) and the actual reimported
[hero](renders/glb-readback/hero.png), [armor](renders/glb-readback/armor-depth.png)
and [palm](renders/glb-readback/palm-depth.png) renders. These preserve the broad
native appearance at this scale; no engine integration or universal shader
equivalence is claimed.

## Iterations and provenance

The author inspected the complete unchanged
[original source](../../../../../examples/automail-arm/source/reference.png),
the actual baseline and each subsequent rendered candidate. The first rounded
shell candidate made the palm too bulbous. A second candidate opened the
forearm side channel. Lead feedback then requested a shallower palm and more
distinct pads; the selected candidate also corrects closed-mesh normals and
reduces palm-base sheen. Native/GLB/renders for the rounded-shell, open-channel
and restrained-palm intermediate selections remain in the delivery's
`iterations/` directory and their revision histories are retained.

The literal [author request](../prompts/automail-author.txt) and
[lead palm feedback](../prompts/automail-feedback-palm.txt) are retained by the
lead. The author inherited the complete prior conversation; this is deliberate
informed development. The model's exact deployed identifier, tokens and cost
were not instrumented. Render contention and concurrent work preclude a speed
comparison. [Command records](refinement-commands.json) retain exact argv and
timestamps; [exercise commands](exercise-commands.json) distinguish technical
execution from authoring time. Before numbered log names were added, some
repeated status-command stdout basenames were overwritten; this is explicitly
bounded in [command-log provenance](command-log-provenance.json). Their exact
argv/timestamps and all production revisions remain; missing old stdout is
not reconstructed.

The [clean portable replay](replay-check.json) executes the final runner from
a fresh output root against the frozen skill. Every selected object record
and the overall scene fingerprint match the original author selection, and
the selected GLB bytes are identical. The cover and four-pose sequence again
restore all 16 selected files exactly.

A separate [installed-package compatibility replay](package-compatibility.json)
uses the actual extracted `refas-1.4.2.tgz`, SHA-256
`0b62e372e335cdf090718ee0a3384e5a51b3e48f309d8c7c1e9e0ba8bbf4e01a`.
That package includes the lead's new instance/modifier consistency guards.
It imports the selected native without changing its scene fingerprint,
renders three fixed views, performs the 3 mm cover edit with 274 other
objects unchanged, restores all **10** files in its selected artifact/input
bundle, verifies integrity and independently reimports the GLB. The full
build and four rendered poses were already executed in the frozen-skill clean
replay and are not attributed to this shorter package replay. This is
compatibility evidence, not a new visual trial. Exact commands and logs are
in [package commands](package-commands.json).

A subsequent runner review found that repeating the exercise reused a fixed
readback-project directory. The final runner scopes that directory to the
selected revision and, when it already exists, appends a guarded new readback
revision. Two distinct revision scopes were actually initialized, the restored
selection was rendered, and its existing scope was reopened and rendered
again with the prior revision retained. [The focused check](readback-path-fix.json)
binds the final runner hash separately from the original full-replay hash.
The visual assets and geometry script are unchanged; the full pose loop was
not repeated solely for this small path/history fix.

## Reproduce

Run from the repository or preserve the `examples/automail-arm/` directory,
including its original source image, review specification and existing edit,
pose and runner helpers:

```bash
python3 examples/automail-arm/run_refinement.py \
  --root /absolute/fresh-output \
  --skill-root /absolute/installed-refas \
  --input-blend /absolute/baseline-arm.blend \
  --blender /absolute/blender
```

The default `all` phase imports the explicit baseline, renders BEFORE, applies
the final refinement, renders AFTER, checks protected records, executes the
cover/pose/restore exercises and independently reopens and renders the GLB.
`build`, `revise` and `exercise` phases support informed visual iteration.
The runner uses public production commands; asset-specific geometry stays in
the example, with no runtime or skill changes in this author work.

Rollback uses the original delivered `arm.blend` or this project's initial
revision **`0ff9172fe69f4171a5efc37b74f4c2a8`**. Native editable modifiers,
hierarchy and output integrity are demonstrated. No complete UV layout, skin
rig, physically valid mechanism, animation package or target-engine acceptance
was completed.
