# Independent cutover scope review

Reviewed 2026-11-22 against the current worktree at `/workspace/scratch/c52cb753f160/refas`, the raw evidence under `docs/development/evidence/v2-distribution-and-import`, and the fixed checklist version 1. This review does not modify the 31-item denominator or any acceptance wording.

## Decisions

| ID | Unchanged acceptance criterion | Review decision |
| --- | --- | --- |
| E3 | Renderer contribution is tested using the identical GLB, identical camera, and known material conditions. | **Demonstrated** for the recorded opaque, factor-only fixture and its two declared rendering configurations. |
| E5 | Explicit 1.x project/artifact import declares preserved/lost data, preserves legacy bytes, and does not transfer certifications. | **Demonstrated** for explicit selected archived native/GLB asset import into a new production history. |
| D1 | Coordinated 2.0 package/version/runtime/plugin/documentation cutover and supported-distribution acceptance are complete. | **Demonstrated** at the declared unpublished development scope: copied production skill and actual local npm archive/launcher, with coordinated plugin metadata. |

**No blocking finding at those scopes.** Do not extend D1 into an end-to-end host marketplace installation claim: plugin routes and identities were checked structurally, while execution evidence covers the copied skill and npm installation. The separate fresh-session user's result was still pending and was not used for these decisions.

## E3: execution and claim limits

- Inspected `examples/renderer-isolation/run.py`, `blender_observe.py`, both recorded configurations, the current retained renderer implementations, all five actual PNGs, and the losslessly compressed raw Blender observation. Independently decoded the input GLB and compared its triangle coordinate sets **and orientation** with all four observed meshes. All agreed; the maximum independently checked material-factor difference was about `2.9e-8`.
- Recomputed the GLB and all five output hashes and the five renderer/harness hashes: they match the recorded result and current source files. Raw observed camera data matches the result; the implementation separately checks camera position/basis/FOV, world-space coordinates and independent projected coordinates.
- The original failed componentwise normal check is retained. The separate custom-normal API probe reproduces the precision loss without either renderer, supporting the switch to an explicit angular tolerance. The actual maximum is about `0.00895°` against `0.1°`; this is neither bitwise identity nor a general Blender precision guarantee.
- The images support the stated lighting-direction control and visible reflection/background differences. Equal material factors do not establish equal shaders, radiometry, ambient treatment or tone mapping. The report discloses those differences and does not turn execution timing into a fair performance or authoring-cost result.

Evidence: `renderer/run-02/result.json`, `renderer/run-02/blender-observed.json.gz`, the five PNGs, `renderer/run-01/result.json`, `renderer/normal-roundtrip/result.json`, and the inspected harness. The aggregate README correctly explains the compressed filename referenced as JSON in the original raw run report.

## E5: explicit import, preservation and authority

- `skills/refas/scripts/production/legacy_import.py` explicitly selects one recorded checkpoint/artifact, verifies the archived size/hash, captures interpreted manifests and source bytes, rejects unsafe/ambiguous selections and overlapping destinations, and uses the ordinary frozen-input production transaction. The selected live asset is not substituted for archived content. The worker creates fresh outputs; it does not execute old validators or old construction scripts.
- Independently compared the 247-entry before/after inventories: identical. Recomputed the four retained asset/manifest/reference hashes against the old inventory: all match. Imported, edited and restored revision assessments are all `not-evaluated`; restored artifact/input inventories and migration provenance equal the imported revision.
- The actual wing-cover replay has a **null** legacy certificate and a generated contract reference. Its no-transfer assertion alone would therefore be weak evidence for a certified source. The separately inspected synthetic claimed-certificate test supplies that missing negative case, and the implementation has no certificate-promotion branch. Both qualifications are explicit in the aggregate report.
- The native and GLB routes have actual copied-skill Blender tests; refusal cases cover linked libraries, unpacked image files and an unsupported required extension. The final production log records 65 passing tests without skips. Unit transaction tests are appropriately distinguished from Blender execution.
- Preserved bytes are not universal semantic fidelity. The documented limits exclude active migration of other checkpoints/review history, reconstruction of authoring data absent from GLB, external GLB resources and universal rig/animation/driver/simulation or per-extension export fidelity. The import report records extensions and keeps certification/reference/target assessments separate.

Evidence: `installed-import/` raw commands, manifests, before/after inventories and revision records; `tests/test_production_import.py`; the three added integration methods in `tests/test_production_blender.py`; `checks/final-production.log`.

## D1: package and retained behavior boundary

- Independently checked all 17 package parity entries against current files: no mismatch. Package, Python runtime and both versioned plugin manifests agree on `2.0.0-alpha.1`. The npm launcher routes directly to the same production Python entry.
- `verify-packed-install.mjs` inspects the actual tarball, performs an offline install outside the repository, exercises CLI argument and exit behavior, and copies the skill into an environment without Node or Python site packages. The installed import/edit/restore replay supplies actual Blender execution beyond the small initialization smoke check.
- The exact 13-file substantive skill/17-file package allowlists reject accidental legacy reintroduction. The negative distribution test physically packs an injected old runtime file before rejecting it. The active skill contains no old CLI/library, graph, template tree or renderer dependency.
- Independently compared the 264-file move inventory to the pinned baseline and current destinations: every original hash matches; none is missing; only the seven documented graph/routing/verifier files differ. Inspected those diffs: the three production-only graph nodes are removed, the legacy root is resolved correctly, and boundary rejection includes both repository prefixes. Runtime library/renderer bytes remain unchanged.
- Normalized and reviewed all changed existing test files. Core old behavior assertions were preserved; changes beyond path routing concern the intentional graph separation, new production metadata/package contract and added migration cases. The final JavaScript log records 935 passes and zero skips. No old runtime behavior test was removed to obtain the result.

Evidence: `package/parity.json`, `package/pack.json`, `checks/move-inventory.json`, `checks/full-js-regression-final.log`, `checks/final-check.log`, `checks/final-release-audit.log`, and the package/distribution verification implementations.

## Boundaries for the next checkpoint

These three decisions can support adding E3, E5 and D1 to the existing demonstrated set, with no criterion rewording or denominator change. They do not resolve K4 source identity/construction gaps, E2 comparable elapsed-time/model/tool-cost measurement, D2 main merge, or D3 publication. They do not approve either unfinished model, close a Notion task, or certify arbitrary imported assets. Bind the final checkpoint to the actual committed code; if any shipped file changes after this review, refresh the package parity evidence for those bytes.
