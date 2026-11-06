---
name: plan-and-dispatch
description: Split a long request or feedback list from the owner into focused tasks (GitHub issues) and start one fresh worker session per task. Use for any message with several to-dos, playtest feedback, or anything that would take one chat a long time. The planner does not write game code itself.
---

# Plan and dispatch

You are the **planner**. Your job is to turn the owner's message into well-cut tasks,
file them as GitHub issues, and start one worker session per task. Keep your own
context small: read only what you need to cut the work well (`CLAUDE.md`,
`ROADMAP.md`, file names, a quick `grep`). **Do not implement anything yourself.**

Reply to the owner in German. Issues, prompts and branch names are English.

## 1. Pull the message apart

Write down every single point of the message as a short line, keeping the owner's
words. Split run-on sentences: "Regen zu laut und bewegt sich mit der Karte" is two
points. Mark each point as:

- **do**: a change to make,
- **question**: something to answer (answer it yourself in your final reply, no task),
- **decision**: needs the owner's choice before work can start (ask, don't guess).

## 2. Cut tasks

Group the "do" points into tasks:

- **Same theme and same files → one task.** E.g. rain look + rain sound + rain
  following the camera = one "Rain" task.
- **Different themes → separate tasks**, even if the message mixed them.
- A task should be doable by one worker in one session: one coherent change, one
  PR a person can review. Split a task that would touch more than ~3 areas of the
  code map in `CLAUDE.md`.
- **Conflicts:** two tasks that both change a *hot file* (`js/ui.js`, `css/style.css`,
  `js/renderer.js`, `index.html`) in overlapping places must not run in parallel.
  Merge them into one task, or mark the later one `Blocked by #N` and dispatch it
  only after the first PR is merged. `js/i18n.js` additions alone are fine in parallel.
- Research tasks ("look at how Stronghold does X") belong inside the task that uses
  the result, unless the owner asked for research on its own.
- Check open PRs and issues first (`list_pull_requests`, `list_issues` with label
  `task`) so you don't duplicate work or start on top of an unmerged rewrite.
  If an open PR changes the same area, the task waits for it (Blocked by) or builds
  on its branch (say so in the issue).

If anything is a **decision**, ask the owner now with one short question per decision
(AskUserQuestion), then continue. Don't ask about things with a sensible default.

## 3. File one issue per task

Create it with the GitHub tools in `5ebi/first_web_game_medieval`, label `task`
(plus `blocked` if it waits for another issue). Use this body:

```markdown
## Goal
<one or two sentences: what the owner should see when it's done>

## Owner's words
> <the original German lines this task covers, verbatim>

## Scope
- <concrete change 1>
- <concrete change 2>

## Out of scope
- <what the worker must not touch; related points that are separate issues (#N)>

## Where
<files / areas from the code map in CLAUDE.md, and hot files touched>

## Done when
- [ ] <checkable result, e.g. "rain stays on the ground while the map is dragged">
- [ ] `sh tests/run-all.sh` passes; desktop, phone portrait, phone landscape screenshots checked
- [ ] Strings in `en` and `de`

## Base
`main` <or: "branch `claude/x` from PR #N, which is not merged yet">

## Blocked by
<#N or "nothing">
```

## 4. Start the workers

For every issue that is **not blocked**, start a new cloud session with
`create_session` (claude-code-remote tools):

- `source_url`: `https://github.com/5ebi/first_web_game_medieval`
- `source_revision`: the base branch from the issue (usually `main`)
- `model`: `claude-opus-5-5` (effort comes from `.claude/settings.json`: medium)
- `title`: `#<N> <short task title>`
- `outcome_branch`: `claude/task-<N>-<slug>` (lowercase, hyphens)
- `prompt`:

```
/work-task <N>

You are a worker for issue #<N> in 5ebi/first_web_game_medieval.
Work only on that issue. Base: <base branch>. Push to: claude/task-<N>-<slug>.
Read CLAUDE.md first. When done, open a draft PR "Closes #<N>" and stop.
```

Start independent workers in parallel (several `create_session` calls in one
message). Comment on each issue with the session link so the owner can follow it.

## 5. Report and follow up

Reply to the owner in German, short:

- answers to their **questions**,
- a table: task · issue link · session · status (running / waiting for #N),
- what you deliberately left out or need a decision on.

Then schedule a check-in for yourself (`send_later`, ~45 minutes) to look at the
worker sessions (`get_session`, `list_events` with `kinds: ["result"]`). When a PR
for a blocking issue is merged, dispatch the waiting issues the same way. Workers
that failed: read their last events, then fix the issue text or restart once.
