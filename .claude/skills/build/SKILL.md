---
name: build
description: Build one shred of a task's plan, then review and fix it until it is ready for a PR — spec + standards review always, security and UX (Playwright) reviews when the plan selected them. Reads .factory/<taskId>/plan.md, checks that the previous shred already has a PR, creates the shred's branch, and spawns a builder subagent for that shred only, which makes one commit per task, red-green-refactor. Then it runs a review + fix loop where the fixer may change production code but never tests. It verifies the shred's exit conditions, corrects plan.md (and spec.md if the code disproved a requirement), and stops at the branch. The user opens the PR. Use after plan-and-shred, or when the user asks to build, implement or code a task or a shred. Do NOT use to plan (use plan-and-shred), to build several shreds at once, or to push or open a PR.
argument-hint: "[taskId] [optional: S-n]"
model: opus
hooks:
  PreToolUse:
    - matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell"
      hooks:
        - type: command
          command: node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs" build
---

# Build one shred, then review and fix it

A shred is done when its exit conditions are **met**, not when the code looks finished,
and it ships when **the user** opens its PR. Everything below serves those two sentences.

You are the orchestrator. You do not write code. You pick the shred, set up its branch,
spawn the agents that do the work, run the checks yourself so that a green means you saw
it, and keep the plan true. The agents, each with its own guard:

- **`luke-builder`** — one spawn per shred. It writes the code and the tests, one commit per task.
- **Reviewers.** All of them are read-only, and each returns findings classed `fix`,
  `test-change` or `out-of-scope`:
  - **`threepio-spec`** — spec + standards. It always runs.
  - **`chewie-security`** — Opus. It runs when the plan selected security for the shred.
  - **`artoo-ux`** — drives the running app with Playwright. It runs when the plan
    selected UX for the shred.
- **`leia-fixer`** — production code only. Tests are locked by its guard and by a test lock it
  cannot stop past.

**Input:** $ARGUMENTS — the task id, and optionally `S-n` to name the shred.

## 0. Preconditions

- **Run in the main session.** Subagents cannot spawn subagents. If you are a subagent,
  say that `/build` runs from the main session, and stop.
- **Plugin.** The builder runs under `ponytail:ponytail`. If it is missing from your
  available skills, stop and say so, with: `/plugin marketplace add <owner>/<repo>`, then
  `/plugin install ponytail@<marketplace>`.
  `clean-code` ships in this repo's `.claude/skills/`.
- **A git repo, clean apart from `.factory/`.** Run `git status --porcelain`. Changes outside
  `.factory/` belong to the user: stop and ask them to commit or stash. Do not do it for them.

## 1. Load the task

Resolve the task id: use the one given, or list `.factory/*/` and ask. Never infer it from
the branch.

Read from `.factory/<taskId>/`:

- **`plan.md`** is required. If it is missing, point to `/plan-and-shred`. It holds the
  shreds, their tasks, the test for each requirement, the decisions, the risks, and the exit
  conditions as a JSON block.
- **`spec.md`** is required. It holds the requirements the shreds carry.
- **`intent.md`** — read it when the plan leaves you guessing about the problem.

Then read `CLAUDE.md` / `AGENTS.md`, and find the project's **real** build, lint, typecheck
and test commands, in the plan's *Specs and their tests*, the plan's *Exit conditions*,
`package.json` or the solution. You run them in step 4, so do not invent one.

## 2. Pick one shred, and pass the PR gate

**One shred per run. There is no "all".** Each shred is its own branch, its own review loop
and its own PR, and the user opens that PR. A run that builds two shreds has taken that gate
away from the user.

Print the shreds, numbered, with their state:

```
Shreds in OB-27:
  S-1  Add the client store             PR #41 (open)
  S-2  Add the registration endpoint    <-- next
  S-3  Advertise the scopes
  S-4  Update the Help Center (no PR)
```

**`<branch>`** is the shred's **Branch** field in `plan.md`. A plan written before that
field existed has none: derive it as `plan-and-shred` step 6 does, add it to the shred, and
record it in the changelog. The guard blocks any other name.

A shred's state comes from git and GitHub, never from memory:

- **PR shred:** check the branch with `git branch -a --list "*<branch>"`, then the PR
  with `gh pr list --head <branch> --state all --json number,state,url`.
- **`(no PR)` shred:** it is done when all the exit conditions it carries are `verified`
  in the plan.

**Which shred.** If `S-n` was given, take it. Otherwise, take the first shred that has no
branch and is not a finished `(no PR)` shred. Say which shred you picked and wait for the
user's yes.

**The PR gate.** For any S-n after S-1, the previous shred must be shipped:

| S-(n-1) is | Then |
|---|---|
| A PR shred with a PR, open or merged | Pass |
| A PR shred with a branch but no PR | Stop: "Open the PR for S-(n-1) first; `/build` never opens it." |
| A PR shred with no branch | Stop: S-(n-1) has not been built. Shreds are in dependency order |
| A PR shred whose PR was closed unmerged | Stop and ask: the plan may need revising before S-n builds on it |
| A `(no PR)` shred | Pass if its conditions are verified. Otherwise ask the user to confirm it is done |

**The shred already has a branch** (an earlier run stopped partway). Show
`git log <base>..<branch>` and ask whether to resume at the review loop (step 4) or stop.
Never rebuild over it.

**Create the branch.** The base depends on where S-(n-1) stands:

- **S-1, or the S-(n-1) PR is merged.** Run `git fetch`, then
  `git checkout -b <branch> --no-track origin/<default-branch>`. Without `--no-track` the
  branch tracks the default branch, and a push lands there instead of opening a PR branch.
- **The S-(n-1) PR is still open.** Run `git checkout -b <branch> <S-(n-1) branch>`. This
  stacks S-n on S-(n-1), because S-n may depend on it. Tell the user that the PR for S-n
  will target `<S-(n-1) branch>` until S-(n-1) merges.

Say which base you took. Record **`base`** = `git rev-parse HEAD`. Every diff and the test
lock are measured from it.

**Name the exit conditions this shred carries**, by id, before anything is built. The
baseline conditions (`"shred": "all"`) apply to every shred: name them once as task-wide. A
shred that carries no condition cannot be called done: ask which conditions it should carry.

### A `(no PR)` shred

It has no diff, so there is no branch, no builder and no review loop. Walk its steps with
the user: run each action only after the user confirms it, record the observable result,
verify its conditions (step 5), then go to step 6. Ticking it off is done in the plan, and
the next shred's gate reads that.

## 3. Spawn the builder — once, for this shred

Spawn the `luke-builder` agent in the foreground. Give it:

- the task id, the shred id, and the **base** commit;
- the shred's section of `plan.md`, verbatim, which includes its tasks in order;
- the exit conditions it carries, with their descriptions;
- the project's build, lint, typecheck and test commands.

Read its summary. Check the commits against the plan with `git log --oneline <base>..HEAD`:
one commit per task, in order, with each task's commit line. Then:

- **Conflicts or work not done.** Put them to the user before reviewing. A requirement the
  code disproves, or a task that cannot be green on its own, changes the plan. That is the
  user's call, not the reviewers'.
- **Surprises.** Keep them for step 6.
- **Lessons.** The summary must have a `### Lessons` section. It lists each lesson the
  builder applied, and where, or says "none apply" or "no lessons file yet". If the section is
  missing, send the builder back once (`SendMessage`) to add it. A hook already forced the
  builder to read `.factory/lessons.md` before it could do anything else, and this section
  shows whether the builder used it. If the section is still missing, say so in the final
  report.

## 4. Review + fix loop — at most 3 rounds

### Which reviewers

Read the shred's **Reviews** field in `plan.md`. **`threepio-spec` always runs.** The
security and UX reviewers run only if the field lists them. The user chose them when they
approved the plan, and their opt-outs are recorded in *Reviews* and *Decisions*. **Do not
re-ask about opt-outs, and do not add a reviewer on your own.**

When the threepio-spec reports a *Missed review* (a security trigger or a UI change that the
plan did not select for this shred), put it to the user: "Add the security/UX review for
S-n?" Record the answer in step 6's changelog line.

### Starting the app for the UX reviewer

Only when `artoo-ux` runs. The plan's *Reviews* section gives the run command, the URL,
the pages, and the names of the sign-in env vars.

- **Start it.** Run the command in the background, then poll the URL until it answers
  (`curl -s -o /dev/null -w "%{http_code}"`), for up to about 2 minutes.
- **It does not start.** That is a **blocking** finding for the build, not a skipped review.
  Show its output.
- **Sign-in.** Read the values of the named env vars and pass them to the reviewer. Tell the
  user once that they must belong to a throwaway test account, because they appear in the
  transcript. If a var is unset, ask the user.
- **Restart** the app after each fixer round, so the reviewer sees the fixed code.
- **Stop** the app when the loop ends, however it ends.

### Each round

1. **Run the checks yourself:** the build, lint, typecheck and full test commands, and each
   requirement's narrowed test from the plan. Record each command and its exit code. A check
   is green only if you watched it pass in this run.
2. **Spawn the reviewers in parallel,** in one message, in the foreground:
   - **Round 1:** every reviewer selected for the shred.
   - **Round 2 on:** `threepio-spec`, plus every reviewer that had a blocking finding in the
     previous round. A fix can re-open security or UX.

   Each reviewer gets the task id, the shred id, the base, and the conditions the shred
   carries. Each also gets its own inputs:

   | Reviewer | Also gets |
   |---|---|
   | `threepio-spec` | the check output |
   | `chewie-security` | the plan's security triggers for the shred |
   | `artoo-ux` | the URL, the shred's pages, and the sign-in values |

   From round 2 on, every reviewer also gets its own previous findings, with what the fixer
   did about them. Every reviewer reads `.factory/lessons.md` itself, and tags a finding
   that repeats a known lesson with `repeats: L-n`.
3. **Merge the findings.** Remove duplicates: the same `path:line` with the same cause,
   whichever reviewer found it. Keep the reviewer's name on each finding. A finding tagged
   `repeats: L-n` is **blocking**, whatever its severity. Keep every finding (fixed,
   accepted, or still open) for step 6b.
4. **Exit the loop** when every reviewer that ran says *ready*, no blocking `fix` finding is
   left, and every check from step 4.1 is green.
5. **Lock the tests.** Write `.factory/build-lock.json` as
   `{ "base": "<git rev-parse HEAD>", "taskId": "<taskId>", "shred": "S-n" }`. The tests as
   they stand now are the contract.
6. **Spawn one `leia-fixer`** in the foreground with all the `fix` findings, from every reviewer:
   blocking ones first, then minor. Give it the check output, the base and the commands.
7. **Verify the lock yourself:** `node "$CLAUDE_PROJECT_DIR/.claude/hooks/test-lock.mjs" verify`.
   The fixer's Stop hook already ran it, but your own run is the one you can vouch for. If
   it blocks, stop the loop, show the user the paths, and do not continue until they decide.
8. Set aside the `test-change` findings for the user (see below), and every `out-of-scope`
   finding for step 6.

**After round 3, if a blocking finding is still open, stop.** Report what is still open,
which reviewer raised it, and what the fixer tried. A fourth round on the same finding is the
loop arguing with itself.

When the loop ends, however it ends, delete `.factory/build-lock.json` and stop the app.

### `test-change` belongs to the user

The fixer cannot touch a test, and you do not decide that one should change or be added.
Typical cases:

- a test that asserts the wrong thing;
- a missing test for a requirement;
- a missing regression test for a security fix;
- a missing end-to-end test for a broken UX scenario.

For each finding, show the test (or say that it is missing), what it asserts, what the spec
says, and the reasoning of whoever raised it. Then ask:

- **Change or add the test.** Spawn the `luke-builder` in test-correction mode with only the
  tests the user agreed to, and what each must assert. This is the only path to a test edit
  after the first build. Then run one more review round. It does not count toward the cap.
- **The test stands.** The finding becomes a `fix` for the next fixer round, marked "the
  test is the contract".
- **Defer.** Leave the test as it is, record the finding in the plan's changelog, and keep
  the condition it touches `false`.

## 5. Verify the conditions, honestly

Walk every condition this shred carries.

- **When a condition counts as met.** Only when you watched its check pass in this run, after
  the last commit. A pass before the last fix does not count, and neither does code that
  looks like it would pass. An unearned green is worse than a missing one, because the next
  shred and the reviewers trust it.
- **Test commands that pull in more.** The exact test command may also discover manual,
  credentialed, live-service or environment-bound tests.
  - Run the exact command and record its real exit code.
  - Fix and re-run every failure related to this task. That is a new fixer round, if rounds
    are left.
  - Run the narrowest relevant set as extra evidence.
  - Keep the condition `false` unless the exact command exits 0, and record both results in
    the changelog.
  - Never rewrite a condition or add an exclusion after seeing the result.
- **Task-wide conditions** (`"shred": "all"`) stay `false` until the run for the **last**
  shred watches them pass. Record each shred's result for them in the changelog.

Not all met is a legitimate outcome. Say exactly which conditions are still open and why.

## 6. Correct the plan, and the spec if the code disproved it

The build is the first time anyone finds out what the plan got wrong.

**`plan.md`**, whole, every section in place:

- **Exit conditions:** flip only the conditions you verified in step 5. Keep every id, and
  leave every other shred's flags exactly as they were.
- **This shred's section:** correct it to what was true, including its scope, its tasks,
  and its real commits if they differed.
- **Discovered work:** work that belongs to a later shred goes into that shred's section.
  Work that belongs to no shred goes under *Deliberately not shreds* with a reason. The
  same goes for `out-of-scope` findings.
- **Ids are stable.** A new task or shred takes the next free number.

**`spec.md`**, only when the code disproved a requirement: a requirement that turned out
wrong, impossible, or already met elsewhere is rewritten or struck, never silently
deleted. Requirement ids stay stable.

**Changelog:** each document you touched gets one line, appended, newest last, in the user's
terms:

```markdown
- **2026-10-17 — Build, S-2** — EC-3..EC-6 verified; EC-7 open (live OAuth call cannot run
  unattended). R-4 said the store owned expiry; it is the endpoint, and the plan now says so.
  2 review rounds (spec, security); UX opted out at the plan; 1 test-change deferred.
```

Even when nothing else changed, write the line that says so. A missing entry reads as
"nobody ran this".

Do not commit `.factory/`: those files are the user's to commit, and they must not ride
along in the shred's PR.

## 6b. Record the lessons

Every real hole this shred fell into becomes a lesson in `.factory/lessons.json`, the
repo-wide file the next builder has to read. Do this however the loop ended.

**Which findings to record:**

| Record | Don't record |
|---|---|
| every `fix` the fixer resolved | `out-of-scope` findings |
| every blocking finding still open | findings a later round or the user withdrew |
| every `test-change` the user accepted | a `test-change` rejected with "the test stands": record the `fix` it became instead |

**Turn each finding into a lesson:**

- **`rule`** — preventive guidance in the imperative: what to do next time, not what went
  wrong this time. Generalise beyond this one line, but no further than the evidence: "Build
  SQL with `Parameterized()`; never concatenate input into a query", not "Be careful with
  SQL". Name the codebase's own helper or pattern when there is one.
- **`paths`** — globs as narrow as the code allows (`src/Data/**`, `web/src/forms/**`). Use
  `[]` only when the lesson applies anywhere.
- **`category`** — `security/<kind>`, `ux/<kind>` (`ux/a11y`, `ux/states`), `spec/<kind>`,
  `design/<kind>`, `test/<kind>`.
- **`reviewer`**, **`severity`**, **`taskId`**, **`shred`**, **`at`** (`path:line`, or the
  page for a UX finding with no code location).
- **`lesson`** — read `.factory/lessons.json` first. If the finding is the same hole as an
  existing lesson, even worded differently, set its id (`"L-3"`). Always set it for a finding
  tagged `repeats: L-n`. Otherwise leave it `null`. The script also merges a rule identical to
  an existing one.

**Write and record:**

1. Write the findings as a JSON array to `.factory/lessons-inbox.json`.
2. Run `node "$CLAUDE_PROJECT_DIR/.claude/hooks/lessons.mjs" record .factory/lessons-inbox.json`.
   It removes duplicates inside the batch and against the file, never counts the same
   occurrence twice, rewrites `lessons.json`, and re-renders `lessons.md`.
3. Delete the inbox.

Quote the script's output line (`created L-7 · +1 L-3 (seen 3×)`) in step 6's changelog line
and in the final report. If the script refuses (an unknown id, a field missing), fix the inbox
and run it again. Never edit `lessons.json` by hand.

## 7. Stop at the branch

End with:

- the branch, its base, and whether the PR for S-n will be stacked on S-(n-1);
- the commits (`git log --oneline <base>..HEAD`);
- the conditions verified and the conditions still open, with the reasons;
- the reviewers that ran, the ones opted out at the plan, the rounds, and anything still open: findings, deferred `test-change` items;
- the lessons: the builder's `### Lessons` section, any `repeats: L-n` (a lesson that did not
  stick), and the line from `lessons.mjs record`;
- **"Run `/ship <taskId> S-n` for the PR's summary, decisions and review pointers, then push
  the branch and open the PR when you're happy with it. `/build <taskId>` builds the next
  shred once that PR exists."**

Then stop.

## Guardrails

- **One shred per run.** Never start a second shred in the same run, even if the first went
  quickly.
- **Don't push or open a PR.** Opening the PR is the user's gate, and the guard refuses
  `git push` and `gh pr create`.
- **Don't build past the PR gate.** No PR for S-(n-1) means no S-n.
- **Don't write code yourself.** The builder writes it and the fixer repairs it. You write
  only `plan.md`, `spec.md`, the test lock and the lessons inbox.
- **Don't skip the lessons.** Every run records what it found, through the script.
- **Don't let a test change slip through review.** The only path to a test edit after the
  first build is a user-approved test-correction spawn.
- **Don't mark a condition verified that you did not watch pass.**
- **Don't commit `.factory/`, and don't touch the user's own changes.**
- **Don't run more than 3 review rounds** on the same open finding.
- **Don't re-open a rejected option.** If the work seems to need one, stop and take it to the
  user.

## Troubleshooting

| Issue | Response |
|---|---|
| `plan.md` missing | Point to `/plan-and-shred`. |
| The working tree has changes outside `.factory/` | Stop. The user commits or stashes them. |
| A plugin is missing | Stop, name it, and give the install commands. |
| `gh` is not authenticated, or the repo has no GitHub remote | The PR gate cannot be checked. Ask the user whether the PR for S-(n-1) exists, and record the answer in the changelog. |
| The builder skipped red on a task | Say so in the changelog, and have the threepio-spec check that the test can actually fail. |
| A test passed on its first run | Treat it as suspect. Ask the threepio-spec whether it would still pass with the feature broken. |
| The fixer's Stop hook keeps blocking | It changed a test. Run `verify`, show the paths, and let the user decide. |
| The shred is much bigger than its plan section | Stop after the build and ask whether to split it. The plan changes first. |
| The app will not start for the UX review | A blocking finding for the build. Show the output; never skip the review the user kept. |
| The UX reviewer has no browser tools | The Playwright MCP server did not start: Chrome missing, `npx` blocked, or the project folder not trusted yet. Say so and stop the round; see the README's prerequisites. |
| A reviewer the plan selected now looks unnecessary | Run it anyway. Opting out was the user's call at the plan. |
| The builder is stuck on "Read .factory/lessons.md in full" | That is the lessons gate working. Tell it to read the file with one `Read`, no offset or limit. |
| `lessons.mjs record` refuses the inbox | Fix the field it names, or the lesson id it does not know, and run it again. Nothing was written. |
