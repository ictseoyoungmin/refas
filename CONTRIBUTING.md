# Contributing

RefAs accepts changes that improve reconstruction truthfulness, recoverability, or transferable agent UX.

Before opening a change:

1. Read the [GitHub governance contract](docs/github-governance.md).
2. Open one structured Issue with one runtime capability and hierarchy scope, or one explicit non-runtime repository boundary and the `repository` scope, plus acceptance evidence and a safe recovery point.
3. Wait until the Issue is routable and `workflow: ready`; only one implementation path may become `workflow: active`.
4. Create a semantic feature branch and open one Draft Pull Request that closes the primary Issue.
5. Keep reusable runtime logic asset-agnostic. Put benchmark coordinates and proportions in model specifications.
6. Add or update a typed contract before changing a public behavior.
7. Include an automated test for every repaired failure mode.
8. Run `npm test`, `npm run test:python`, `npm run check`, `npm run dogfood`, and `npm run release:audit`.
9. For visual changes, attach raw-reference context, actual BEFORE/AFTER renders, split comparison, required diagnostic views, and the typed capability owner.

Do not add parallel `new`, `v2`, `final`, `backup`, or iteration-coded implementations. Replace a path deliberately and remove the superseded implementation in the same change.

The canonical installed product is `skills/refas/`. Retained 1.x code lives
once under `legacy/v1/` for explicit saved-project regressions and comparison;
it is not a second production implementation or a package fallback. Update
legacy test/example imports directly when their code moves. Product package
checks must reject accidental reintroduction of old graphs, templates or runtimes.

A green check does not override a visible regression. Reopen the owning capability when stronger evidence invalidates a prior acceptance, and retain rejected candidates as evidence.
