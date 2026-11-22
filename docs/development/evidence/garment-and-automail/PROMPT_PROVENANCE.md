# Dogfooding prompt provenance — garment and automail

Date: 2026-11-22 (Asia/Seoul). Baseline: `rewrite/v2@e265a35f`.
This document is an **evidence index**, not a reconstruction of missing chat messages.
The original trials, the informed refinement, the later scripted replays, and the interrupted next refinement are distinct events.

## What is actually preserved verbatim

| Record | Verbatim source | Scope and provenance |
| --- | --- | --- |
| Uniform jacket common authoring brief | [`examples/uniform-jacket/TASK.md`](../../../../examples/uniform-jacket/TASK.md) | File bytes on the baseline commit; assignment artifact, **not proof of the exact surrounding chat message** |
| AURIX arm 2.0 assignment | [`examples/automail-arm/TASK.md`](../../../../examples/automail-arm/TASK.md) | File bytes on the baseline commit; explicitly the 2.0 workflow, not a universal message for all three conditions |
| Existing garment/arm execution instructions | [`examples/uniform-jacket/run_refinement.py`](../../../../examples/uniform-jacket/run_refinement.py), [`examples/automail-arm/run.py`](../../../../examples/automail-arm/run.py) | Verbatim executable scripts and command arguments; **reproduction commands, not historical agent instructions** |
| Original authored results and feedback | [`records/author-garment-report.md`](records/author-garment-report.md), [`records/author-automail-v2-report.md`](records/author-automail-v2-report.md), [`records/author-automail-legacy-report.md`](records/author-automail-legacy-report.md), [`records/author-automail-plain-report.md`](records/author-automail-plain-report.md) | Agent-written reports of actions, feedback, failures and revisions; only a literal quotation inside these reports is an exact quotation from that report |
| Anonymous review outputs | [`records/blind-garment-review.md`](records/blind-garment-review.md), [`records/blind-automail-review.md`](records/blind-automail-review.md) and paired JSON/mappings | Reviewer responses are preserved; **their original request messages are not established by the responses** |
| Actual source/review input specification | [`examples/uniform-jacket/review.json`](../../../../examples/uniform-jacket/review.json), [`examples/automail-arm/review.json`](../../../../examples/automail-arm/review.json) | Fixed observation inputs, not chat prompts |

The common jacket task and AURIX task differ in purpose, conditions and wording.
Do not replace a missing condition-specific prompt with either TASK file or claim
that all three independent AURIX authors received character-identical messages.

## Prior interrupted-session recovery claims — not independently recovered here

The interrupted session reported **6 recovered earlier instruction messages**
(including 1.x automail initial/follow-up and anonymous review instructions)
and **8 unrecovered instructions**. Those counts are retained as a report of
that session, **not an audited corpus**: neither the six literal message bodies
nor a mapping of eight unavailable IDs could be recovered from the branch,
the archived two-asset bundle, or the accessible Work OS page in this recovery.
Do not invent their text, reconstruct them from agent reports, or label
replayed commands as historical prompts.

The same session reported that new jacket and automail follow-up prompts had
been written before sending, including cross-section width/depth,
curved fabric folds, overlapping plate thickness and mechanism clearance.
Their literal sent-message bytes and exact delivered attachments were not
published to the baseline branch. Their status is **UNAVAILABLE**, even though
the high-level task intent survives in the conversation progress record.

| Unresolved prompt category | Status | Safe treatment |
| --- | --- | --- |
| Earlier 1.x automail literal messages (reported among the six) | UNAVAILABLE_VERBATIM | Preserve the reported count and provenance caveat only |
| Earlier anonymized reviewer request message(s) | UNAVAILABLE_VERBATIM | Preserve actual reviewer outputs separately |
| Other eight reported missing instructions | UNAVAILABLE_VERBATIM | No invented IDs, sequence, or wording |
| Interrupted post-`e265a35f` jacket/arm author messages | UNAVAILABLE_VERBATIM | Previous session summary only; no claims about final candidate hashes |
| Subsequent replay commands and deterministic task scripts | AVAILABLE_AS_COMMANDS | Label as replay, never as a prompt sent at the original authoring time |

## New prompts prepared after recovery

[`NEXT_EXECUTION_PROMPTS.md`](NEXT_EXECUTION_PROMPTS.md) contains **new, unsent**
instructions for continuing the two geometry corrections and a new blind
review. They were prepared **after** recovery and must not be included in an
old-trial prompt dataset or treated as an executed test.

## Capture contract for subsequent dogfooding

1. Before agent dispatch, save the **exact literal message bytes** and the
   source attachments' identities. If messages differ per condition, give
   each its own ID and record its condition; never silently coalesce them.
2. Record sent time, explicit model/provider only when observed, skill snapshot,
   repository commit, file hashes and author scope. Unknown values stay null.
3. Append literal subsequent feedback/corrections as ordered events. Keep
   reviewer prompts and responses separately; retain the anonymous mapping
   under a non-reviewer-visible path.
4. Record executed commands, generated scripts and rerun manifests as
   **execution evidence**, not as replacements for message provenance.
5. On interruption, mark unsaved text UNAVAILABLE and retain the last
   published asset revision. A reconstructed summary is a summary, not a
   verbatim prompt. Never treat an unverified post-cutoff claim as a new result.

Related: [two-asset evidence](README.md), [recovery checkpoint](FOLLOWUP_HANDOFF.md),
[baseline Draft PR #399](https://github.com/ictseoyoungmin/refas/pull/399).
