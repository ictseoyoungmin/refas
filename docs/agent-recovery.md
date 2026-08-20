# Agent recovery protocol

The project state, not filenames or prose, decides where an agent resumes.

## Fresh turn

Run:

```bash
node skills/refas/scripts/refas.mjs resume --root <project>
```

Interpret only the returned state:

| `nextAction` | Required response |
|---|---|
| `BIND_PRIMARY_SOURCE` | Bind exact source bytes before reconstruction. |
| `CHECKPOINT_SOURCE_INTAKE` | Close source identity with a recoverable artifact and evidence-backed gate. |
| `CREATE_CANDIDATE_CHECKPOINT` | Continue the single active edit; do not start another capability. |
| `FINISH_EDIT` | Compare the named baseline and candidate, then keep, rollback, reopen, or request review. |
| `BEGIN_REPAIR_EDIT` | Work only on the first invalidated capability and returned scope. |
| `REQUEST_REVIEW` | Stop mutation until evidence or ownership is resolved. |
| `ADVANCE_CAPABILITY` | Load only the next capability's reference and work on its returned scope. |
| `CERTIFY` | Create a whole-object-certification checkpoint, audit, then certify. |
| `DONE` | The current head has a valid certificate. |

## Failure recovery

Preview a route with `route`. Apply it only with `report-finding`; this persists the decision, restores the selected artifact bytes, and invalidates the owner plus dependents. Run `resume` again after application.

If a bounded edit cannot be judged, use `abort-edit`. Never manually move the head, delete a rejected candidate, edit internal state, or infer a rollback location from a low score.
