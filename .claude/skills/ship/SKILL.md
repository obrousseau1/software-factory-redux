---
name: ship
description: Write the hand-off for one built shred of a task into .factory/<taskId>/ship.md — a clear, concise summary of what changed, the main decisions behind it, and the places a reviewer should look hardest — ready for the author to paste into the PR they open. Then wrap up — record as lessons, with the user's approval, the repo-specific holes the build did not record, and suggest transferable learnings for future work. Reads plan.md, spec.md, intent.md, lessons.json and the shred's commits and diff; runs no checks and opens nothing. Use after /build stops at a shred's branch, or when the user asks to ship or wrap up a shred, write its PR description or summarise what to review. Do NOT use to build, review or fix code (use build), and never to push or open a PR; the author does that.
argument-hint: "[taskId] [optional: S-n]"
model: opus
hooks:
  PreToolUse:
    - matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell"
      hooks:
        - type: command
          command: node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs" ship
---

# Ship a shred

`/build` stopped at a branch whose exit conditions are verified, or honestly marked open.
This step writes what the author needs to open the PR and what a reviewer needs to
review it: **what changed, why it is shaped this way, and where to look**. It then wraps
up what the shred taught: lessons for this repo, learnings for the user. It does not open
the PR. That gate stays with the author.

The reader is a teammate who did not take part in the task. They have five minutes before
they open the diff. Every line should save them more than it costs them to read.

**Input:** $ARGUMENTS — the task id, and optionally `S-n` to name the shred.

## 0. Load the task

Resolve the task id: use the one given, or list `.factory/*/` and ask. Never infer it from
the branch.

Read from `.factory/<taskId>/`:

- **`plan.md`** is required. If it is missing, point to `/plan-and-shred`. It holds the
  decisions, the risks, each shred's *Review focus*, the exit conditions and the changelog
  that `/build` wrote.
- **`spec.md`** is required. It holds the requirements the shred carries.
- **`intent.md`** gives the problem in the reporter's terms. The summary leads with it.
- **`ship.md`**, if it exists, holds the sections of shreds already shipped. Keep them.
- **`.factory/lessons.json`**, if it exists. Its entries for this task and shred are the
  holes the review loop found.

## 1. Pick the shred

Take `S-n` if given. Otherwise, take the shred whose branch is checked out, if
`git rev-parse --abbrev-ref HEAD` is `<branch>`. Otherwise, ask. `<branch>` is the
shred's **Branch** field in `plan.md`.

- **The branch must exist** (`git rev-parse --verify <branch>`). If it does not,
  point to `/build <taskId> S-n`.
- **`/build` must have finished it.** The plan's changelog has a `Build, S-n` line. If it
  does not, the build stopped partway: say so, and stop.
- **A `(no PR)` shred** has no PR to describe. Say so, and stop.
- **The PR already exists** (`gh pr list --head <branch> --state all`). Go on, and
  say that the author will need to update its description by hand.

**Find the base**, the commit the shred's diff is measured from:

- **The S-(n-1) PR is still open:** `git merge-base <branch> <S-(n-1) branch>`. The PR
  is stacked on S-(n-1).
- **Otherwise:** `git merge-base <branch> origin/<default-branch>`. Get the default
  branch from `git rev-parse --abbrev-ref origin/HEAD`.

Then read the shred as it was built, from refs, without checking anything out:

- `git log --oneline <base>..<branch>`, for the commits;
- `git diff --stat <base>..<branch>`, for the shape of the change;
- `git diff <base>..<branch>`, for the change itself. Read it. The summary and the
  review list are about the code that exists, not the code the plan expected.

## 2. Write the three parts

### Summary

Two to four sentences, in plain words:

1. **The problem**, from the intent, in the user's terms: who could not do what.
2. **What is different now**, as behaviour someone can observe, not as a list of files or
   commits.
3. **What it leaves out**, only when a reader would expect it to be there: a later shred,
   a deferred item, an open exit condition.

No "this PR", no adjectives, no restating the specs. If it takes more than four
sentences, the shred is probably two.

### Main decisions

The decisions that **shape this shred's diff**, at most five, most consequential first.
Take them from the plan's *Decisions*, and from the changelog lines where the build
corrected the plan: those corrections are decisions too, made later.

Each decision gets one line: what was decided, why, and the main option rejected with the
reason. The rejected option is the useful part. It answers "why didn't you just…" before
the reviewer asks. Leave out decisions that only concern other shreds.

### Review these

The places where a reviewer's attention is worth the most. **At most seven, ranked by
risk**, most dangerous first. Each item gives:

- **where** — `path:line` in this shred's diff, or the exit condition's id;
- **what to check** — the question the reviewer should answer, concretely;
- **why** — the reason it is risky.

Where to find them:

| Source | What becomes an item |
|---|---|
| The shred's *Review focus* and the *Risks and brittle seams* it carries | the seam, located in the diff |
| Exit conditions still `false` for this shred | what is unproven, and why it could not be checked |
| Deferred `test-change` items and open findings in the changelog | what is untested or still disputed |
| Where the build corrected the plan or the spec | code that differs from what was agreed |
| This shred's lessons in `lessons.json` | the fixed hole: check that the fix holds |
| The diff itself | a shared path with other callers, a new public surface, persisted data or a migration, error handling, concurrency, anything hard to undo |

Do not list:

- what the checks already prove: a passing build, the formatting, the test count;
- style nits;
- "review everything" or "check the tests" with no place and no question.

A short list that is right beats a long one that is complete. If nothing is risky, say so
in one line.

## 3. Write `ship.md`

Write `.factory/<taskId>/ship.md`. It has one section per PR shred, in shred order. Write
or replace this shred's section only, and keep every other one exactly as it is.

```markdown
# Ship: <task title, the same line the plan uses>

> Plan: `.factory/<taskId>/plan.md` · one section per PR, to paste as its description

## S-2 <PR title, from the plan>
`OB-27-S-2-add-checklist-endpoint` → `OB-27-S-1-store-shred-checklist` (stacked until S-1 merges) · 4 commits · EC-3..EC-6 verified · EC-7 open

### Summary
<two to four sentences>

### Main decisions
- **<what was decided>** — <why>. Not <rejected option>: <why not>. (D-n)

### Review these
1. `<path:line>` — <what to check> — <why it is risky>.
```

Rules for the writing:

- **Only what the documents and git say.** The status line reads the plan's exit
  conditions. Never call a condition verified that the plan does not mark `verified`, and
  never run a check to make it so. This step runs no checks.
- **Short.** One screen per section. Cut every sentence the reviewer would not miss.
- **Ids, not copies.** Refer to `R-n`, `D-n` and `EC-n` by id with a short name. The
  documents hold the detail.
- **No code.** Paths, lines and names, not snippets.

## 4. Wrap up

Inspired by TaskFlow's wrap-up, this answers two questions. What did this shred teach the
repo that the lessons don't hold yet? And what did it teach the user that would help on any
repo? Collect everything in one pass, ask once, and write only what the user keeps. An empty
wrap-up is a valid wrap-up. Never fabricate an entry.

**Scope.** Usually this shred. On the task's last PR shred, look back over the whole task:
every shred's changelog lines and every open item.

### 4a. Lessons the build did not record

`/build` records the review findings as lessons. It does not record what the other steps
found: a plan assumption the code disproved, a requirement struck, a check that could not
run. Those are holes too, and the next task in this repo will fall into them.

**Where the candidates come from:**

| Source | Candidate |
|---|---|
| The `Build, S-n` changelog lines in `plan.md` and `spec.md` | an assumption or a requirement the code disproved; a task that could not be green alone; a builder that skipped red |
| Exit conditions still `false`, and their reasons | the environment gap that left them unproven |
| Deferred `test-change` items | the test the plan should have asked for |
| Work moved to a later shred or under *Deliberately not shreds* | the seam the plan missed |
| This session, when `/ship` runs in the session that built the shred | a surprise put to the user, a conflict the builder raised |

**Keep a candidate only if** it is specific to this repository (it names its code, paths,
helpers or tooling) and it would change what the next planner, builder or reviewer does.
Anything transferable belongs in 4b instead.

**Check each one against `.factory/lessons.json`:**

- already recorded for this task and shred → drop it;
- the same hole as an existing lesson, even worded differently → keep it, with
  `"lesson": "L-n"`;
- otherwise → keep it, with `"lesson": null`.

**Write each one** as `/build` step 6b does (`rule`, `paths`, `category`, `taskId`, `shred`,
`lesson`), with:

- `reviewer` = `"wrap-up"`;
- `severity` = what the source says, else `"minor"`;
- `at` = the `path:line`, or the document and id when there is no code location
  (`plan.md D-3`, `spec.md R-4`).

**Ask once.** Show the candidates, one line each, with the rule and its paths. Then ask
"Which of these should become lessons?" with `AskUserQuestion`, multiSelect. It takes four
options per question and four questions per call, so batch more than four. If the user
picks nothing, record nothing. If there are no candidates, say "Nothing new for the
lessons." and move on.

**Record** the kept ones the way `/build` does: write the JSON array to
`.factory/lessons-inbox.json`, run
`node "$CLAUDE_PROJECT_DIR/.claude/hooks/lessons.mjs" record .factory/lessons-inbox.json`,
then delete the inbox. Quote the script's output line in the hand-off. If the script
refuses, fix the field it names and run it again.

### 4b. Learnings for future work

Lessons belong to the repo. Learnings belong to the user: what this task taught them that
would help on the next one, wherever it is. Suggest **at most three**. Each gets a bold
imperative, then the moment in this task that taught it, in one line.

A learning is about the way of working:

- framing the problem, writing specs, choosing between approaches, cutting shreds;
- testing at the right boundary, reviewing, working with the agents;
- a factory step that misled: a skill instruction that was ambiguous or wrong. Name the
  skill and what happened. That is a fix for the factory, not for the repo.

These are not learnings:

- anything that names this repo's code, paths or tools: that is a lesson (4a);
- point-in-time facts ("the build takes 4 minutes");
- advice not rooted in something that happened here ("write good tests").

**Suggest only.** Print them in the hand-off, and write them nowhere: the user decides
whether they go into memory, notes, or nowhere. If nothing qualifies, say so.

## 5. Hand off

Print the section you wrote, then end with:

- the path of `ship.md`;
- **Lessons:** the line from `lessons.mjs record`, or "nothing new";
- **Learnings:** the suggestions from 4b, or "none this time";
- **"Push the branch and open the PR with this section as its description. The PR
  targets `<base branch>`."**

Then stop. Do not commit `ship.md`: `.factory/` is the user's to commit, and it must not
ride along in the shred's PR.

## Guardrails

- **Don't open, push or edit a PR.** The guard refuses them; the author ships.
- **Don't run the build or the tests,** and don't claim a result the plan does not record.
- **Don't edit `plan.md`, `spec.md` or the code.** If the diff contradicts the plan, put it
  under *Review these* and tell the user. Correcting the plan is `/build`'s job.
- **Don't rewrite other shreds' sections.**
- **Don't record a lesson the user did not pick,** and never edit `lessons.json` by hand:
  only the script writes it.
- **Don't write the learnings anywhere.** They are suggestions; where they go is the user's
  call.

## Troubleshooting

| Issue | Response |
|---|---|
| No task id given | List `.factory/*/` and ask; never guess from the branch. |
| `plan.md` or `spec.md` missing | Point to `/plan-and-shred` or `/define-specs`. |
| No `Build, S-n` line in the changelog | The build did not finish. Point to `/build <taskId> S-n`. |
| `gh` is not authenticated, or no GitHub remote | Ask the user whether the S-(n-1) PR is still open, to pick the base. |
| No `origin/HEAD` | Ask the user for the default branch. |
| The diff holds work that no task in the plan names | Put it first under *Review these*, and tell the user. |
| `lessons.mjs record` refuses the inbox | Fix the field it names, or the lesson id it does not know, and run it again. Nothing was written. |
| A candidate fits both a lesson and a learning | It is a lesson if it names this repo's code or tooling. If its general point is worth keeping too, the learning states it without the repo. |
