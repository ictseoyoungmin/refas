# Worked example — whole-volume construction from one view

## Starting point

A single image shows a manufactured enclosure with a curved housing, repeated supports, a central fitting, and a rim. The deliverable is an editable, physically coherent 3D asset.

## 1. Establish shared construction

Record the overall width/height, principal curvature, visible seams, enclosure footprint, repeating hardware, and support relationships. Decompose by geometry ownership:

```text
whole enclosure
  continuous main housing
  curved cover
  repeated supports and bands
  central fitting
  attachment interfaces
```

Use measured shared profiles for corresponding bands and supports, and test camera projection before changing shared dimensions to fit image-space differences.

## 2. Create a complete whole-volume candidate

Construct the main body with continuous front, side, rear, top, and bottom geometry. Fit section profiles to the visible curvature and carry them across the body. Give separate plates and bands meaningful thickness and joined or intentionally spaced contact with the supporting body. Realize openings as modeled geometry.

Preserve the dominant silhouette, major negative spaces, and part placement in one whole-object blockout. Record the selected camera, depth, and attachment hypotheses in the project model.

## 3. Inspect the 3D structure

Render the registered source camera and front, side, rear, top, and grazing views of the exact candidate GLB. Inspect:

- silhouette and principal profile continuity;
- alignment and dimensions of repeated or mirrored parts;
- depth, body closure, appropriate wall thickness, and penetrating geometry;
- joints, supports, and attachment contacts;
- resemblance in the original camera.

Evaluate mesh integrity, per-component closure, and assembly separately from source resemblance.

## 4. Repair and refine

Choose the owner of the largest shape discrepancy: camera, enclosure sections, repeated hardware, or attachments. Make a local edit, rebuild the asset, recapture the same views, and retain the stronger candidate. Refine secondary details after the whole shape is credible.

## 5. Record the result

Source observations record image facts. Spatial and construction artifacts record chosen 3D hypotheses and structural priors. Source-bound certification uses the existing independent source/GLB evidence gates, with shape validity and resemblance reported separately.
