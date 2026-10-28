# Stable task startup and anchors

Deliver one reviewed PR. Keep cold task opens compact for every URL fragment.
Use a disposable local task with a long thread, a saved plan, document cards,
and saved PR cards, modeled on the reported staging page with synthetic text.

| Acceptance | Evidence |
| --- | --- |
| Documents, comments, artifacts and unknown anchors keep compact history | Route tests inspect recent reads and reject full-history reads |
| Older comment links still work | Fetch only the target comment; browser checks target and recent replies |
| Saved cards do not insert after first reveal | Delayed-response browser test records frames, card counts, geometry and video; demonstrate red then green |
| Fast reads remain independent of slow task enrichment | Stall full task detail while opening the local fixture |
| Refresh and More messages preserve mounted content | Browser checks reading position and composer identity |
| Reviewable handoff | Full required checks, token/maps checks, PR template, review and CI |

The task route owns expansion and targeted comment loading. The document service
owns the saved document projection. The thread owns its first coherent reveal.
No anchor may request all comments, full activity, or historical transcripts.
No deployment is included.

Evidence so far: the baseline document/plan cards changed from 0 to 1 to 4
visible cards after reveal, and thread height grew from 690 to 1,432 pixels.
The first candidate keeps all 7 saved cards present and height constant. A
second regression showed delayed PR counts changing card heights from 62 to
82 pixels; reserving that statistics line makes both states 82 pixels.
Focused UI tests: 507 pass. Focused server tests: 16 pass. Token and map checks pass.
Final browser checks, full workspace typecheck/tests/build and hosted review are
in progress. One early candidate browser run exceeded the initial 5-second dev
readiness deadline; later runs use 10 seconds. No reliable latency gain is claimed.
The initial 503 linked-comment fixture exercised the app's global reconnect and
30-second retry policy. The target-specific failure check uses a terminal 404.

Local reproduction: http://127.0.0.1:3223/TAS/issues/TAS-1#document-investigation.
Synthetic task data only; no live provider execution. Restart with
`PAPERCLIP_HOME=/tmp/paperclip-stable-task-loading PAPERCLIP_INSTANCE_ID=task-loading PAPERCLIP_UI_DEV_MIDDLEWARE=true node cli/node_modules/tsx/dist/cli.mjs cli/src/index.ts run`.
Evidence is retained under `/tmp/task-loading-proof/` until final attachment.

State: branch `codex/stable-task-anchor-loading`; baseline `063cfd4381`.
Dependencies installed locally; the existing lockfile was stale and will not be committed.
