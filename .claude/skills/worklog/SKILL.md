---
name: worklog
description: Append today's work to worklog.md in the user's established checkbox format (a running dated session log, distinct from the AI-agent-facing agent/walkthrough.md). Use at the end of a work session, or when the user asks to update the worklog, log today's work, or write down what was done today.
---

# Update worklog.md

`worklog.md` (repo root) is the user's own daily log — short, checkbox-driven, human-facing. It is **not** the same file as `agent/walkthrough.md` (that one is the AI-agent implementation log per `CLAUDE.md`'s Agent Workflow Convention, with fuller prose and relative markdown links). Don't conflate the two, and don't skip this one just because `agent/walkthrough.md` was already updated in the same session — they serve different readers and both should be kept current when relevant.

## Format (match exactly — read the existing file first to confirm nothing has drifted)

```
### [D/M/YYYY] <short title for the session's theme>

[x] <completed item, terse, one line, imperative-ish tone>
[x] <another completed item>
    - <optional indented sub-bullet with detail, e.g. root cause or a caveat>
[] <item looked at but not finished / still open>

TODO:
[] <outstanding follow-up item>
[] <another outstanding item>
```

Notes on the convention as actually used in this file:
- Date format is `D/M/YYYY` (no zero-padding, e.g. `18/8/2026` not `18/08/2026`), matching the user's locale — don't switch to ISO or US format.
- `[x]` = done this session, `[]` = not done (open checkbox, no space between brackets).
- Every entry ends with its own `TODO:` block. Items that are still unresolved from a previous entry's TODO carry forward into the new one (don't just leave them orphaned in an old entry) — resolved ones get dropped or flip to `[x]` and can stay in the old entry.
- Multiple sessions can land on the same date — append a new `### [date] <title>` section rather than overwriting or merging into an existing same-day section, unless the user is clearly continuing the exact same session.

## Steps

1. **Read the current `worklog.md`** in full first — confirm the format above still matches what's actually there, and see the current trailing `TODO:` block so you know what's outstanding to carry forward.
2. **Figure out what actually got done.** Default to summarizing the current conversation/session — code changes made, bugs fixed, investigations run, deploys done, files touched. If the user says "today" and this is a fresh session picking up from earlier work (e.g. `git log`/`git diff` shows uncommitted or recently-committed changes not covered by this conversation), pull from there too rather than only the visible chat. Keep each line terse — one line per item, matching the existing entries' brevity (see the file for tone/length calibration). Don't pad with filler; skip anything trivial.
3. **Draft the new section**: a `### [today's date] <title>` header summarizing the session's theme in a few words, one `[x]`/`[]` line per accomplishment (sub-bullet only when a one-liner isn't enough — e.g. a root cause worth remembering), and a fresh `TODO:` block carrying forward unresolved items from the previous entry plus any new ones that surfaced.
4. **Append it to the end of the file** (after the current last line/TODO block) via Edit — don't rewrite earlier entries.
5. **Show the user what got added** (just the new section is enough, no need to reprint the whole file) so they can correct anything before it's final. This is a low-stakes personal file, not outward-facing — no need for a confirmation gate before writing, just a clear "here's what I logged" after.

## Explicitly out of scope

This skill only touches `worklog.md`. It does not commit anything, does not touch `agent/walkthrough.md` or `agent/workspace_overview.md`, and does not deploy. If the user wants those too, that's `commit-and-deploy` (which also expects the agent docs kept current) — this skill is the lightweight daily counterpart, not a replacement.
