# RefAs release criteria

## Production 2.0 release boundary

The prepared package is `2.0.0`. Its installed skill contains
only the production workflow, directly used guidance, metadata and resources.
Required distribution evidence includes the real npm archive's intended file
set, matching package/runtime/plugin versions, the isolated npm entry and copied
skill execution without the repository or retained 1.x implementation.

Use the [2.0 plan](development/refas-2-plan.md) and its
[fixed acceptance checklist](development/refas-2-progress.md) for the declared
production scope. Actual Blender creation/edit/import/restore, source retention,
failure/concurrency handling and honest visual/target assessments remain
required. An explicit 1.x import must preserve selected bytes, report lost scope
and leave both legacy project bytes and legacy certification authority separate.
Broader rig, physics and engine profiles require evidence when promised.

A development metadata cutover or successful package audit does not publish
a release. The existing explicit manual publication authorization, exact current
main SHA, immutable tag rules and required current CI remain in force. Main
merge and formal publication are separate delivery criteria. Main integration
was completed through #435 and #399; preparation alone does not complete
formal publication.

The publication artifact is the verified production npm archive attached to
the matching GitHub Release with its SHA-256 file. It is not the full repository
source archive and does not imply npm registry publication. The upload must
match the reviewed main commit, package allowlist and actual tested archive.
An existing asset must match exactly; conflicting assets are not overwritten.

Comparable first-useful-edit time and actual model/tool cost remain open in
[Issue #436](https://github.com/ictseoyoungmin/refas/issues/436). This bounded
production release makes no speed/cost superiority claim. The selected assets'
declared use and retained failures remain as recorded in their acceptance
reports; neither release identity nor package integrity grants final-art,
universal fitting, continuous-motion collision or physical-retention approval.

## Earlier release contracts

The [historical 1.x release contracts](https://github.com/ictseoyoungmin/refas/blob/285413169bf8fd5aeb666061ff6a113ef364f6f3/docs/archive/v1/release-criteria.md) describe
the earlier implementation and its published formats. Use them only for that
version boundary; they do not add requirements to the 2.0 production workflow.
