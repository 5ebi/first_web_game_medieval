---
name: work-task
description: Implement exactly one GitHub issue (a task filed by the planner) in a fresh session, from branch to draft PR. Use when the prompt says "/work-task <N>" or asks to work on one issue of this repository.
---

# Work one task

You are a **worker**. You own one issue and nothing else. Your context starts empty:
the issue plus `CLAUDE.md` / `ROADMAP.md` are your briefing.

## 1. Brief yourself (keep it short)

1. Read the issue #N with the GitHub tools (`issue_read`), including comments.
2. `CLAUDE.md` is already loaded; skim `ROADMAP.md` decisions.
3. If the issue names a base branch other than `main`, check it out first.
4. Create / switch to the push branch named in your prompt
   (`git checkout -B claude/task-<N>-<slug>` from the base).
5. Read only the files listed under "Where", plus what they call. Use `grep`
   instead of reading whole large files.

If the issue is unclear in a way that changes the result, ask in a short German
question and wait. If it is only a detail, pick the sensible option and note it in
the PR.

## 2. Build it

- Stay inside **Scope**. Things you notice outside it: list them in the PR under
  "Follow-ups" (the planner turns them into issues). Don't fix them.
- Follow the conventions in `CLAUDE.md` (pixel art, `en` + `de` strings, save format).
- Look at the result, not just the code: run the game in Playwright, take
  screenshots at desktop 1440×900, iPhone 15 portrait and landscape, and look at them.

## 3. Check

```sh
sh tests/run-all.sh
```

It must pass. If your change adds behaviour, add a check to `tests/smoke.js`.
Tick the "Done when" boxes in your head one by one; if one can't be met, say so.

## 4. Deliver

1. Commit in small steps with clear English messages (why, not just what).
2. `git push -u origin claude/task-<N>-<slug>`.
3. Open a **draft PR** against the base branch:
   - title: what changed, in plain words
   - body: `Closes #N`, what changed, what you checked (devices, test output),
     screenshots worth seeing (describe them if you can't attach), "Follow-ups".
4. Comment on the issue with the PR link.
5. Reply in German with 3–6 lines: what is done, the PR link, what to look at
   when playtesting, anything left open. Then stop.
