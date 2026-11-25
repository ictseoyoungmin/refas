# Retained RefAs 1.x code

The 2.0 production skill is `skills/refas/`. The old 1.x runtime is retained
once at `legacy/v1/` for repository compatibility, old saved-project regressions
and controlled renderer comparisons. It is excluded from the production npm
package and plugin discovery.

## Existing saved projects

To inspect or continue a 1.x project with the retained repository runtime:

```bash
node legacy/v1/scripts/refas.mjs status --root OLD_PROJECT
node legacy/v1/scripts/refas.mjs next --root OLD_PROJECT
```

Read [the legacy entry](../legacy/v1/SKILL.md) and its explicit
[reference index](../legacy/v1/references/INDEX.md) for that format. The legacy
runtime keeps its own 1.4.2 development identity; changing the production
package version does not rewrite old project versions or certificates.

The old Python diagnostic/render tools use the repository's legacy development
requirements. The active production runner needs Python's standard library and
Blender instead. Old CPU renderers remain comparison tools; they are not an
automatic fallback when production Blender fails.

## Moving an asset into 2.0

Use the production `import-v1` command with an explicit recorded checkpoint and
artifact path. It reads the selected archived native/GLB bytes and starts a new
production history. Read the [supported import scope](../skills/refas/references/production-import.md).

The original 1.x project remains unchanged. Its other checkpoints, journals,
candidate decisions, rendered evidence and certificates continue to belong to
that original project. They do not become current approval of the imported
2.0 output. A GLB cannot recover authoring data that was never stored in it.

## Earlier documentation and evidence

The [1.x documentation index](archive/v1/README.md) links the complete
[immutable historical archive](https://github.com/ictseoyoungmin/refas/tree/285413169bf8fd5aeb666061ff6a113ef364f6f3/docs/archive/v1).
Earlier plans, reports and duplicate contract notes are not needed in the
current checkout. The four locally retained historical documents are test inputs,
not active authoring instructions. Original paths and literal dogfood records
describe their recorded checkout, not the current production package. The [pre-cutover README](https://github.com/ictseoyoungmin/refas/blob/ef1d6b8acb944b545bebb486571d7841a3eea1b6/README.md)
preserves the complete earlier capability, workflow, physical-contract and
installation description. Current executable examples/tests use the explicit
legacy root; historical raw records are not rewritten.

Legacy file preservation supports regression and migration claims. It does not
make the old capability graph or certification progression a prerequisite for
new 2.0 modeling work.
