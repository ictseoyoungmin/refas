# Literal instructions for this continuation

These files contain the actual current-turn messages, saved before the
corresponding dispatch. [dispatch.json](dispatch.json) records their hashes,
roles, recipients, context mode when applicable, and save/dispatch confirmation
times. Each text file has one final newline. [attachments.json](attachments.json)
binds the current user request to the unchanged original source images.

| Message | Purpose |
| --- | --- |
| [Current user request](user-request.txt) | Continue development with the two reattached sources. |
| [Garment author](garment-author.txt) | Informed native refinement and edit/recovery/export evidence. |
| [Automail author](automail-author.txt) | Informed shell/hand refinement and articulation evidence. |
| [Palm feedback](automail-feedback-palm.txt) | Lead correction after inspecting the first actual palm render. |
| [Garment package replay](garment-package-replay.txt) | Final runner repair and extracted-package compatibility check. |
| [Arm package replay](automail-package-replay.txt) | Extracted-package compatibility after the frozen-skill replay. |
| [Anonymous visual reviewer](visual-reviewer.txt) | Isolated original-source and A/B render judgment. |

Authors inherited the preceding conversation and were explicitly informed about
prior weaknesses. The visual reviewer starts without that history and receives
only original sources and anonymous renders. The condition mapping is outside
its input packet. Authoring, informed correction, compatibility replay and
independent visual review are distinct activities.

The old recovery-time [prepared instructions](../../garment-and-automail/NEXT_EXECUTION_PROMPTS.md)
remain a historical unsent draft. These new records do not reconstruct missing
earlier messages, prove backend model identity, or establish token/cost data.
