# Appearance ownership

Appearance owns material identity, semantic material assignment, base color, metallic and roughness response, coatings, texture inputs, and the visible finish hierarchy. It does not own silhouette, curvature, relief geometry, attachment, camera, lighting, or final whole-object certification.

Begin only from a trustworthy geometry and assembly checkpoint. A material edit invalidates appearance, rendering, visual critique, and certification; it does not reopen upstream geometry unless the render exposes a typed geometry finding.

## Evidence model

Record three different kinds of evidence without blending them:

- source-image observations: albedo clues, highlight width, reflection strength, finish variation, and ambiguity caused by lighting;
- comparison-asset facts: digest-bound GLB material factors, texture identities, extensions, and node-to-material assignments;
- renderer interpretation: environment, exposure, tone mapping, color space, and supported shading features.

When restoring a supplied comparison GLB, bind its SHA-256 and preserve the material table and semantic assignments exactly when the claim is exact recovery. Do not redistribute the comparison bytes unless the user authorized that separately. Never treat a rendered pixel sample as an intrinsic base color without accounting for lighting and color management.

## Material hierarchy

Create one semantic material ID for every visually distinct finish that the evidence supports. Do not collapse a dark structural metal, bright trim, enamel panel, and fastener inlay into one convenient metal merely because they share a broad color family.

For each semantic material record:

- evidence scope and source references;
- base-color factor or texture and its color space;
- metallic and roughness factors or textures;
- normal, coating, transmission, emissive, or other required features;
- assigned roles or part IDs;
- which values are measured, restored, inferred, or still ambiguous.

Keep material IDs semantic, such as `enamel`, `brass-light`, or `fastener-inlay`. Development iterations and benchmark codes are not material identities.

## UV and embedded base-color textures

RefAs supports deterministic `TEXCOORD_0` generation through `generateUvCoordinates()`:

- `planar`: normalize two declared object-space axes into UV space;
- `cylindrical`: wrap one declared longitudinal axis with repeat-aware seam handling;
- `per-section`: use section-profile loft ring index as U and section position as V.

The result carries `refas.uv-mapping/v1` metadata and a digest over the exact UV coordinates. A textured material cannot be serialized unless every mesh vertex has a finite `TEXCOORD_0`.

For a base-color texture, provide exact PNG bytes as the material's `baseColorTexture`. The GLB writer:

1. verifies the optional caller SHA-256 against the PNG bytes;
2. embeds those bytes in the GLB BIN chunk as an `image/png` buffer view;
3. emits glTF `images → textures → pbrMetallicRoughness.baseColorTexture`;
4. records the PNG digest in image/material RefAs metadata and the asset-level texture manifest.

The portable PBR renderer independently re-hashes the embedded PNG before decoding it. It perspective-correctly interpolates UVs, handles repeat seams, samples the texture, converts sampled sRGB base color to linear space, multiplies it by `baseColorFactor`, and uses that result in both albedo and beauty rendering.

A normal appearance `refas.pbr-render-report/v1` declares `base-color-texture` and `texcoord-0` support and includes `textureBindings[]` with the exact PNG SHA-256. This makes the texture bytes part of the render evidence in addition to their inclusion in the asset SHA-256. Normal maps, metallic/roughness textures, and image-based lighting remain unsupported unless separately implemented and declared.

## Neutral-clay boundary

R04 neutral-clay rendering is upstream shape evidence, not appearance evidence. `render-pbr --neutral-clay` deliberately replaces the candidate material response with the canonical runtime-owned neutral material and fixed review lighting so shape identity can be judged without finish polish.

A neutral-clay `refas.pbr-render-report/v1` therefore declares `claimScope: shape-resemblance-only`. Never use it to satisfy `appearance-plausibility`, material feature coverage, or final visual fidelity. Appearance still requires a normal `claimScope: visual-fidelity` PBR report that preserves the candidate's actual materials.

## Verification sequence

1. Freeze the accepted geometry, camera, exposure, tone mapping, and environment.
2. Inspect albedo independently of lighting to catch assignment and color-family errors.
3. Inspect the serialized GLB to verify exact PBR factors, extensions, textures, and every node-to-material assignment.
4. After the portable integrity gate passes, render hero and grazing views in an independent PBR renderer that supports every feature required by the appearance claim.
5. Compare before and after with identical render settings; review color, metalness, roughness, highlight width, and finish hierarchy separately.
6. Route any mismatch as `material-mismatch` or `finish-mismatch` to appearance. Route a newly exposed shape, topology, or assembly defect to its actual owner instead of compensating with materials.

The bundled software renderer is useful for render integrity, albedo, and coarse factor response. Its report declares `claimScope: render-integrity-only`; therefore it cannot by itself pass `appearance-plausibility`. Exact material-table parity is strong regression evidence, but it is not an independent visual-fidelity verdict.

Use Blender Cycles or Eevee headless, Three.js/WebGL, Filament, glTF Sample Viewer, VTK, or another independently executed PBR-capable renderer. A family name is not proof of capability: record the exact version/backend and declare the supported and unsupported glTF material features for that run. The appearance gate passes only when a `refas.pbr-render-report/v1` binds the candidate, canonical frame, fixed lighting rig, color pipeline, and output digests, and its supported feature set covers the asset's required material features.

## Exit and recovery

Appearance may close only when:

- every observed finish has a semantic material owner;
- source observations and comparison-asset facts are digest-bound;
- serialized factors and assignments match the intended appearance specification;
- a capable renderer covers all required material features;
- identical-setting before/after views contain no unresolved major material or finish finding.

Checkpoint the accepted material specification, exact candidate GLB, renderer disclosure, and comparison views. If the edit fails, restore the appearance checkpoint and invalidate only its downstream capabilities. A score never chooses the rollback point.
