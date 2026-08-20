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

## Verification sequence

1. Freeze the accepted geometry, camera, exposure, tone mapping, and environment.
2. Inspect albedo independently of lighting to catch assignment and color-family errors.
3. Inspect the serialized GLB to verify exact PBR factors, extensions, textures, and every node-to-material assignment.
4. Render hero and grazing views in a renderer that supports every feature required by the appearance claim.
5. Compare before and after with identical render settings; review color, metalness, roughness, highlight width, and finish hierarchy separately.
6. Route any mismatch as `material-mismatch` or `finish-mismatch` to appearance. Route a newly exposed shape, topology, or assembly defect to its actual owner instead of compensating with materials.

The bundled software renderer is useful for render integrity, albedo, and coarse factor response. Its report declares `claimScope: render-integrity-only`; therefore it cannot by itself pass `appearance-plausibility`. Exact material-table parity is strong regression evidence, but it is not an independent visual-fidelity verdict.

## Exit and recovery

Appearance may close only when:

- every observed finish has a semantic material owner;
- source observations and comparison-asset facts are digest-bound;
- serialized factors and assignments match the intended appearance specification;
- a capable renderer covers all required material features;
- identical-setting before/after views contain no unresolved major material or finish finding.

Checkpoint the accepted material specification, exact candidate GLB, renderer disclosure, and comparison views. If the edit fails, restore the appearance checkpoint and invalidate only its downstream capabilities. A score never chooses the rollback point.
