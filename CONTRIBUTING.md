# Contributing

RefAs accepts changes that improve reconstruction truthfulness, recoverability, or transferable agent UX.

Before opening a change:

1. Keep reusable runtime logic asset-agnostic. Put benchmark coordinates and proportions in model specifications.
2. Add or update a typed contract before changing a public behavior.
3. Include an automated test for every repaired failure mode.
4. Run `npm test`, `npm run test:python`, `npm run check`, and `npm run release:audit`.
5. For visual changes, attach actual before/after renders and state which capability owns the difference.

Do not add parallel `new`, `v2`, `final`, `backup`, or iteration-coded implementations. Replace a path deliberately and remove the superseded implementation in the same change.
