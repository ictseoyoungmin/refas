# Interrupted follow-up — recovery and execution handoff

Date: 2026-11-22 (Asia/Seoul). Source branch `rewrite/v2`, last
**published asset/evidence commit before recovery**:
[`e265a35f`](https://github.com/ictseoyoungmin/refas/commit/e265a35f7694d111401e470fdbb998b9bc8b5842).
[Draft PR #399](https://github.com/ictseoyoungmin/refas/pull/399) is unmerged.

## Recovered and checked

- The existing downloadable [two-asset delivery bundle](https://chatgpt.com/library?file_id=libfile_82649e8a6bc4819195786ef69f1efef5&account_id=personal)
  was materialized from the user's Library, **not regenerated**.
- Filename: `refas-garment-automail-dogfood.zip`; size:
  **93,743,833 bytes**; archive SHA-256:
  `8bb25bc22678be184354bca950296568d7c89cda0885d389279d843b08e9b259`.
- ZIP integrity: Python `ZipFile.testzip()` returned `None`.
  There are **416** archive entries: `MANIFEST.json` and **415**
  manifest-tracked files. Every tracked file exists and matches the
  recorded byte length and SHA-256; no extra unlisted files.
- Contains selected jacket/arm editable `.blend` and GLB, older candidates,
  partial edits, pose samples, original source sheets, comparison renders,
  original author/reviewer reports and validation records. These are the
  **pre-follow-up baseline**, not a recovered new geometry revision.

The preceding checkpoint has recorded local Blender 4.3.2 and independent
GLB checks, documented in [README](README.md) and [Work Status](../../WORK_STATUS.md).
This recovery verified archive bytes and repository state only; it did **not**
rerun Blender, revise the shapes or repeat the anonymous review.

## Missing from reachable durable storage

The interrupted run described additional jacket collar/lapel and automail
armor/hand changes, reviewed comparison boards, an enhanced prompt archive,
replay of last candidate and preparation for a new PR commit. Its **new**
native/GLB bytes, image set, scripts, exact sent prompts and new review
transcripts were not found in the GitHub `rewrite/v2` HEAD, existing
published artifact bundle, or current Work OS page. Do not assume these
session-local outputs survived. The old blind-review preference must not be
presented as a verdict on the missing follow-up candidate.

This recovery environment has no available Blender executable or `bpy`,
and its sandbox cannot clone GitHub over public DNS. Therefore a native
geometry change and a real fixed-view Blender rerender are **not claimed**.
The published and checked baseline remains authoritative.

## Safe restart, with actual source and native bytes

1. Retain the fixed baseline bundle unchanged. Use a **new output root** and
   inspect the two source sheets, native candidates and reports. Verify the
   archive before extraction; reject unsafe paths and hashes.
2. Use the [prepared new, unsent prompts](NEXT_EXECUTION_PROMPTS.md) and the
   [historical prompt evidence index](PROMPT_PROVENANCE.md). Capture literal
   agent instructions *before* a new dispatch, and subsequent feedback in
   sequence. Do not retroactively populate unavailable original prompt text.
3. With a real Blender 4.3.2-capable environment, execute fresh native edits
   on copies of `garment/jacket.blend` and `automail/arm.blend`.
   Use a separate source-specific script and preserve the rejected versions.
   Regenerating a scene from scratch without its historical context must be
   clearly labelled a **replay**, not a recovery of unsaved session output.
4. Inspect fixed-source comparisons for the jacket's actual folded collar,
   lip/notch relationships, 42 cm body length, cloth strap response, and the
   arm's shoulder housing, contoured overlapping armor, glove and mechanical
   negative spaces. Fix shape before secondary material changes.
5. Require an editable new native, GLB reimport, same before/after cameras,
   explicit changed-vs-protected fingerprint lists, jacket cuff +1 cm
   edit-and-byte recovery, arm service cover +3 mm subtree preservation,
   and sampled elbow/wrist/finger poses. Keep all visual rejections.
6. Blind-review **only new actual renders**, save its literal prompt/response,
   and distinguish preference from finished-asset acceptance. Audit the
   packaged artifacts and update PR #399, Work OS and R2-05/06 only after
   that evidence exists. Do not merge an unfinished visual evaluation as a
   2.0 release.

## Known prior results (not a new result)

The prior informed jacket refinement was preferred, though the collar stayed
unconvincing. The prior independent AURIX ranking was ordinary Blender
narrowly ahead of fixed 1.x, then candidate 2.0; none passed finished
visual acceptance. This recovery changes neither verdict. The production
runtime and package metadata remain 1.4.2; main/official releases stay
unchanged.

Links: [two-asset evidence](README.md) · [prompt evidence](PROMPT_PROVENANCE.md)
· [prepared prompts](NEXT_EXECUTION_PROMPTS.md) ·
[Work OS](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7).
