# Worked example — single-view volumetric reasoning

This example is illustrative, not a mechanical-bird recipe. It shows how RefAs should reason when a single front view strongly constrains the source projection but leaves much of the 3D form underdetermined.

The example exists to demonstrate one behavior:

```text
unseen -> do not construct                         WRONG
unseen -> invent freely and report it as source   WRONG

unseen
  -> construct the 3D hypothesis needed for a coherent asset
  -> test that hypothesis from orthogonal and grazing views
  -> revise when the hypothesis contradicts itself or the source
  -> keep inference/engineering provenance distinct from observation
```

Evidence constrains the reconstruction; it does not confine the reconstruction to the pixels directly visible in the source camera.

## Scenario

Input: one frontal reference of a mechanical bird. The image clearly shows the hero silhouette, head, torso, wing spread, major layered plates, circular mechanical elements, legs, and some overlaps. It does not directly show the exact side profile, top profile, rear shell, internal shafts, or back-side attachment geometry.

The agent should not begin by tracing the frontal silhouette into a thin extruded card. It should first understand the visible whole, then propose a spatial explanation that could produce that view.

## 1. Observe the whole before modeling

Create the whole-to-part hierarchy first:

```text
whole mechanical bird
  -> head
  -> torso
  -> left wing
  -> right wing
  -> pelvis / tail
  -> left leg
  -> right leg
```

Record source-supported facts such as the central axis, bilateral relationships, visible overlaps, major negative spaces, apparent wing angles, head/torso proportion, silhouette changes, and large lighting or plane transitions.

At this point the front-to-back dimensions are not observations merely because they are needed later.

## 2. Turn observed form into spatial hypotheses

For the head, a plausible reasoning record may look like:

```text
OBSERVED
- frontal outline reads as a rounded mechanical housing
- central face plate overlaps lateral structures
- eye/lens elements sit forward of surrounding surfaces

3D HYPOTHESIS
- head is a volumetric housing rather than a flat plate
- face plate occupies a forward surface
- lateral armor wraps around a deeper shell
- central optical parts protrude forward
```

The exact rear profile is still inferred. That does not require setting rear depth near zero.

For the torso:

```text
OBSERVED
- substantial shoulder span
- narrower lower body
- central mechanical stack
- wing roots disappear behind/into body structure
- shading and overlap imply multiple surface planes

3D HYPOTHESIS
- torso has a substantial bilateral volume
- front shell, side masses, and rear continuation form a coherent body
- wing roots attach at nonzero depth rather than being pasted onto one plane
```

The agent may choose a rounded, faceted, tapered, or compound section according to the evidence and selected hypothesis. The example does not prescribe one universal cross-section.

## 3. Do not confuse a thin part with a thin object

A mechanical bird naturally mixes volumetric and thin structures. The agent should decide per scope rather than applying one global thickness rule.

```text
head housing      -> volumetric
main torso        -> volumetric
shoulder housing  -> volumetric
wing root         -> volumetric / articulated
main wing mass    -> layered 3D structure
large wing plate  -> thin shell may be appropriate
feather blade     -> thin shell / plate may be appropriate
gear housing      -> volumetric
gear              -> cylindrical volume
shaft             -> tubular / axial structure
leg link          -> tubular or articulated structure
```

Therefore the correct lesson is not “make everything thick.” Thin geometry is valid when the part calls for it. The failure is allowing an entire object whose major masses imply volume to collapse into nearly the same depth plane merely because the reference is frontal.

## 4. Treat the initial model as a complete 3D hypothesis

Build the first whole-object blockout with real front-to-back relationships. Do not descend into feather seams, screws, material wear, or fine gears while the major masses are still uncertain.

A conceptual blockout might read as:

```text
             head volume
                ███
              ███████

 wing mass  ███  ███  ███  wing mass
            ███████████
               █████
               █████     torso volume
                ███
                ███
              ██   ██    legs
```

This diagram is only about hierarchy and mass. It specifies no asset-class dimensions.

## 5. Render views that the source did not provide

The source view checks source agreement. Diagnostic views test whether the selected 3D explanation remains spatially coherent.

```text
FRONT / HERO -> source projection agreement
OBLIQUE       -> mass transitions and layering
SIDE          -> depth, thickness, protrusion, attachment depth
TOP           -> bilateral mass and fore/aft offsets
GRAZING       -> shell curvature and layered plates
NORMAL        -> surface orientation
OBJECT-ID     -> part separation and accidental coplanar stacking
```

These views do not become new source evidence. They are tests of the reconstruction hypothesis.

Suppose the frontal render is excellent but the side render reads approximately as:

```text
      |
      |
     |||
      |
```

For a subject whose head, torso, housings, and wing roots were interpreted as substantial mechanical masses, this is evidence that the chosen reconstruction has collapsed toward a billboard. “The source did not show the side” is not sufficient justification for preserving that solution.

The agent should revisit the responsible spatial or shape hypothesis, not hide the failure with PBR materials, normal detail, or additional front-facing decoration.

## 6. Preserve epistemic status while revising geometry

A plausible side/top result is still not proof of the original object's exact hidden surfaces.

Keep the distinction:

```text
observed source fact
    !=
selected 3D inference
    !=
engineered downstream choice
```

A good inferred back shell remains inferred. A functional engineered shaft remains engineered unless new direct evidence promotes the proposition. Certification must not rewrite that history.

## 7. Mechanical relations can require active inference

A frontal circular gear-like element may admit several spatial explanations:

```text
Hypothesis A
axis is approximately camera-forward
-> gear appears circular from the source view

Hypothesis B
axis is moderately tilted
-> perspective still produces a near-circular projection

Hypothesis C
gear belongs to a deeper assembly
-> only its front face is exposed through an opening
```

Use nearby shafts, bearings, meshing candidates, overlaps, occlusion, and available structural cues to compare the alternatives. A shaft continuation that is required by the selected mechanical hypothesis may be modeled even when its rear portion is not directly visible. It must not be reported as manufacturer-observed geometry without corresponding evidence.

## 8. Use relational barriers only when the relations matter

Important relations for this subject might include head-to-torso proportion, shoulder span, left/right wing-root alignment, torso-to-wing mass balance, major plane chains, or ordering along the forward axis.

When those macro/identity relations materially constrain the active construction, declare and close them before dependent local hardening. Do not invent placeholder relations merely because this example mentions them.

## 9. Expected agent behavior

A healthy RefAs pass over this kind of input should approximately follow this sequence:

1. inspect the full frontal reference;
2. establish whole-to-part hierarchy;
3. record source-space silhouette, landmarks, negative spaces, and important overlaps;
4. estimate camera and pose hypotheses;
5. propose 3D mass and connection hypotheses for major regions;
6. construct a whole-volume blockout;
7. compare the registered front projection to the source;
8. render side, top, oblique, grazing, normal, and object-ID diagnostics;
9. revise whole shape when those views reveal implausible depth collapse, attachment depth, or mass transitions;
10. descend into plates, feathers, gears, joints, and other parts only after the whole is credible;
11. establish topology and assembly relations;
12. add appearance/PBR after geometry can explain the form;
13. run final multiview review from the whole object again.

This sequence is an example of reasoning, not a mandatory asset-specific script. A different object may justify different geometry, different hypotheses, or different diagnostic emphasis.

## 10. Failure interpretation

If a future dogfood still produces a convincing frontal image but a paper-thin side/top model after following this reasoning pattern, do not respond by adding another instruction that says “make it thicker.” First localize the failure.

Possible causes include:

- the spatial hypothesis itself selected a flat interpretation;
- the construction backend could not express the intended volume;
- side/top/grazing evidence was generated but not treated as a blocking visual finding;
- the review layer lacks a sufficient non-degeneracy or planar-collapse check;
- downstream detail/PBR masked an unresolved whole-shape defect.

The repair owner should come from the localized defect. This example teaches the intended reasoning pattern; it does not replace typed findings, construction-quality closure, projection review, or future geometry-level safeguards.
