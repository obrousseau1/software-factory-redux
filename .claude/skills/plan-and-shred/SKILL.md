---
name: plan-and-shred
description: Turn a task's intent and specs into a reviewable plan, then write .factory/<taskId>/plan.md — the problem, the chosen solution, the decisions taken and the options rejected, the risks, the test that proves each spec, the exit conditions, which reviews (security, UX) each shred needs, and atomic-commit tasks grouped into shreds that each ship as one PR. Use after define-specs, or when the user asks to choose an approach, plan, shred, split or break a task down into commits or PRs. Do NOT use to frame the problem (use define-intent), to write the requirements (use define-specs), or to implement.
argument-hint: "[taskId]"
model: opus
hooks:
  PreToolUse:
    - matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell"
      hooks:
        - type: command
          command: node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs" plan-and-shred
---

# Plan a task and shred it into shippable pieces

The specs say what the system must do. This step decides **how**: pick the approach with
the user, give every spec the test that proves it, say how we will know the task is done,
then cut the work into pieces someone can review. Two units, two promises:

- A **task** is **one atomic commit**: one reason to change, and the build and the tests
  are green after it on its own.
- A **shred** is **one PR someone can review in one sitting and merge on its own**. It is
  not a phase of a big-bang branch.

**Input:** $ARGUMENTS — the task id whose `intent.md` and `spec.md` this plan builds on.

## 0. Load the inputs

Resolve the task id:

- If the user gave one, use it.
- Otherwise list the folders under `.factory/` and ask which task. Never infer the id
  from the current branch or the working tree.

Then read, from `.factory/<taskId>/`:

- **`intent.md`** — what is actually wrong and for whom, and its constraints. It keeps the
  plan aimed at the problem rather than at the task list. Missing: stop and point to
  `/define-intent`.
- **`spec.md`** — the story and the requirements (`R-n`) the plan must satisfy, and what
  is out of scope. Missing: stop and point to `/define-specs`. A plan without agreed
  requirements is a guess with numbers on it.

If `.factory/<taskId>/plan.md` already exists, this is a second pass: read it now. Its
ids, its decisions and every `verified: true` carry over (see step 9). A rejected option
recorded in its *Decisions* stays rejected unless the user re-opens it.

## 1. Map the change surface

The intent's *Where it lives* says where the **problem** is. A change touches more than
that, and shred boundaries are drawn in the codebase, not in the markdown. Dispatch the
`falcon-explorer` subagent with the intent's summary, its *Where it lives* paths and
the requirements, and ask for:

- what a change there would touch: other callers, shared code, persisted data, config;
- where the tests for this area live, how they are named, and how to run one of them;
- **the project's real build and test commands**;
- if the change touches a web UI: the command that runs the app locally, the URL it
  serves, and how a user signs in (step 6b needs them for the UX review).

When the change plausibly spans two distinct areas, dispatch two researchers in
parallel, one per area — no more. Show the user a short digest, and keep the `path:line`
citations; the plan needs them. Then open the key files yourself: reading the code is
what turns a list of paragraphs into a list of PRs.

If the code contradicts the specs or the intent — the intent says "the same two scopes",
the code has two different ones — that is the most valuable thing this step can find.
Raise it with the user; do not quietly plan around it.

## 2. Propose approaches — the first gate

Lay out **two or three** candidate approaches. For each, one short block:

- **Shape** — what changes, in a sentence.
- **Touches** — the files or seams, with paths from the map.
- **Trade-off** — what it costs or risks, and which requirements it leaves hard or
  unsolved.

Recommend one and say why. Then ask:

> Which approach should the plan commit to?

Nothing else is planned before the user picks one (or a blend). Discuss as long as it
takes; draw an ASCII diagram when a flow or boundary would take a paragraph. The approach
chosen becomes the first decision, and the ones not chosen are its rejected options,
each with the reason. So are ideas the user ruled out along the way.

Then name what this approach makes fragile:

- **Brittle seams** — what the change can break that the diff will not show: a shared
  path, an implicit contract, a file two other features read. Name the file or the seam.
- **Biggest risks** — most dangerous first: what would go wrong, how likely, and what
  would make it visible. A risk nobody could notice is the one worth writing.

Both are about **this change**, not the codebase in general. "The store has no tests" is
background; "this diff is the third caller of a method whose other two callers assume it
never returns null" is a finding.

## 3. Give every requirement its test

For each requirement, name the test that proves it:

- **Where** — the test file, existing to extend or new following the project's
  convention, and the test's name.
- **At which boundary** — the one the requirement's scenarios observe: the HTTP response,
  the CLI output, the rendered screen, the delivered message. A test that would still
  pass with the feature broken for the user is the wrong test.
- **How to run it** — the real command, ideally narrowed to that test.

Every scenario is covered by some test; one test may cover several scenarios of the same
requirement. In a project with no test framework, the test is the manual check, written
as steps someone could follow literally. Do not invent a suite the project does not have.

## 4. Derive the exit conditions

An exit condition is a **check someone else could run and get the same answer as you**.
"Code is clean" is not one. "`dotnet build` exits 0 with no warnings" is.

### The baseline

Every plan gets these five, adapted to the actual project. Never drop one silently — if
one does not apply, keep it and say why in its description.

1. **Specs pass** — one condition per requirement, phrased as the observable outcome of
   its scenarios and checked by the test from step 3. Eight requirements yield eight
   conditions here, not one.
2. **Build pass** — the project's real build command from the map, exiting clean. Name
   it. Include "no new warnings" only if the project is currently warning-free.
3. **Tests pass** — the project's real test command. If the project has no tests, the
   condition is that the one check covering this change's logic runs and passes.
4. **Complexity is low** — see below.
5. **As lean as possible** — the diff contains nothing the requirements did not ask for:
   no speculative abstraction, no config for a value that never changes, no interface
   with one implementation, no dependency added for what a few lines would do.

### The complexity gate

"Complexity is low" is the one condition no command resolves, so give it a concrete
shape. Pick the one or two that fit the change:

- No function longer than the file's existing norm
- No new indirection layer between caller and effect
- Nesting depth no deeper than what is already there
- A reader who knows the domain can trace the main path without jumping files

If the chosen approach is still complex after an honest simplification pass, do not
quietly accept it and do not force a rewrite. Add a condition that **flags the task for
a roundtable review with `/local-review --deep`**, naming what stayed complex and why
simplification failed:

```json
{
  "id": "EC-<next>",
  "description": "Roundtable review required: run local-review --deep after implementation because <specific complexity and failed simplification>.",
  "shred": "all",
  "verified": false
}
```

The condition is only the flag. Do not run the review here; the review step owns it.
Keep `--deep` spelled exactly that way.

### Risks that can be checked

A risk you can check is an exit condition, not just a sentence. Write it in both places:
named under *Risks and brittle seams*, observable in *Exit conditions*.

### Keep the set lean

Delete any condition another already implies, any nobody would actually check, and any
with no way to be verified. Merge near-duplicates. Ten sharp conditions beat thirty
aspirational ones.

## 5. Break the work into tasks

A task is the commit the build step will make. Each one gets:

- **Id** — `T-<shred>.<n>`, so `T-2.3` is the third commit of shred 2.
- **Commit** — the commit message's first line: imperative, under 72 characters.
- **Files** — what it touches.
- **Covers** — the requirements and tests it adds or makes pass, or "none" for a
  refactor or a mechanical change.
- **Green when** — the command that shows this commit is good on its own.

Rules for the cut:

- **One reason to change per commit.** If the title needs an "and", it is two tasks.
- **Every commit leaves the build and the tests green.** Code and the test that proves it
  go in the same commit. A test-only commit is fine when it pins existing behaviour
  before a refactor.
- **Refactor, then change behaviour** — two commits, refactor first.
- **Mechanical changes stand alone.** Renames, moves and formatting never share a commit
  with logic; they bury the change a reviewer needs to see.
- **Small enough to read in a few minutes.** A task that touches more than one concern or
  more than a handful of files gets split.
- **Order is a dependency order.** Commit N never needs commit N+1 to build.

## 6. Group the tasks into shreds

A shred is a run of consecutive tasks that ships as one PR. Each gets:

- **Title** — imperative, PR-sized ("Add the shreds checklist endpoint").
- **Scope** — the files or region it touches. One area of the code, not a vertical
  slice through five.
- **Ships alone because…** — what makes it mergeable on its own: it is additive, it is
  behind a flag, nothing calls it yet, the old path still works — **or it has no diff at
  all** (an ops step, a manual verification run) and is a distinct, independently
  finishable piece of work. If you cannot finish that sentence, it is not a shred; "it is
  part of the same task" is not a reason.
- **Review focus** — where the reviewer should look hardest: the brittle seam or named
  risk it carries, and what makes it visible when it goes wrong. Or "none".
- **Specs** — the requirements it satisfies. Every requirement lands in exactly one shred.
- **Exit conditions** — the `EC-n` ids it carries. The baseline ones (build, tests,
  complexity, lean) apply to every shred; mark them task-wide once instead of repeating
  them.
- **Size** — commits and an estimate of changed lines.

Rules for the split:

- **Order is a dependency order.** Shred N must not need shred N+1 to be correct. If two
  shreds depend on each other, they are one shred. This rule wins over the next one:
  dependency order is correctness, risk order is only a preference.
- **Riskiest first, where the order is free.** A shred carrying a named risk gets the most
  review attention and the most time to be found wrong, which it only has if it lands
  early.
- **Isolate a brittle seam into its own shred** where the split allows it. A PR that
  touches a named brittle seam *and* three unrelated files is a PR nobody can review
  carefully at the seam.
- **Reviewable in one sitting.** As a guide, up to about 400 changed lines and half a
  dozen commits. Over that, split, or say in *Size* why it cannot be split.
- **Prefer fewer, larger shreds.** Three real PRs beat nine that each move one file.
  Split when a boundary buys independent shipping, not for symmetry.
- **A shred that cannot ship alone** gets merged into its neighbour, or reordered until
  it can.
- **Refactor-then-use is usually two shreds**, refactor first — but a refactor with no
  caller is hard to review, and splitting may scatter one requirement's conditions across
  both halves. Offer the split with that trade-off stated and let the user decide.
- **A shred with no diff is still a shred if it can be finished on its own.** Mark its
  title `(no PR)`; its tasks are steps, not commits. Work that is only a prerequisite
  owned elsewhere, or that cannot be done until a later shred lands, stays off the list
  and goes under *Deliberately not shreds*.
- **No shred re-opens a rejected option.** If the split seems to need one, say so and
  stop rather than quietly reversing the decision.
- **Say plainly when a task should not be shredded at all.** One coherent change is one
  shred.

## 6b. Decide the reviews

During `/build`, every shred is reviewed for spec and standards. Two more reviewers run only
where they earn their cost. Decide them **per shred**, from the code map, and name the
trigger with its `path:line`. "It feels sensitive" is not a trigger.

**Security review** — Opus traces data flow and hunts for vulnerabilities. It is
**required** if the shred touches any of:

- authentication, authorisation, sessions or tokens;
- user-controlled input that reaches a DB query, a shell, the file system, HTML,
  deserialisation or an outbound URL;
- secrets, keys or crypto;
- PII, or other sensitive data stored, logged or returned;
- a new public endpoint, or a file upload;
- tenant or permission boundaries;
- CI/CD or infrastructure config;
- a new or upgraded dependency.

Otherwise, it is **not required**.

**UX review** — a reviewer drives the running app with Playwright. It is **required** if the
shred changes what a user sees or does in a **web UI**: a page, a component, a form, a flow,
copy, or an error state. It is **not applicable** when the project has no web UI: a CLI, an
API or a library. Otherwise, it is **not required**.

When UX is required anywhere, the plan must say how to reach the UI. Take this from the code
map, and from `falcon-explorer` if the map is missing it:

- the **run command** (`dotnet run --project …`, `pnpm dev`);
- the **URL** it serves;
- the **pages** each shred affects;
- if there is a login, the **names** of the env vars that hold a test account. Never the
  values.

If any of these are unknown, write them under *Open questions*. UX stays required, but
`/build` cannot run it until the questions are answered.

## 7. Work it through with the user

Show the list in the terminal as a numbered list of shreds, each with its fields and its
tasks underneath. Use lists, not tables. Then ask what is wrong with it. Expect to be
corrected: the user knows which parts of the code are landmines and which reviewer will
balk.

Take merges, splits, reorders and rewordings, reprint the amended list, and keep going
until the user is happy. After every edit, re-check:

- dependency order holds, between shreds and between the tasks inside each;
- every requirement lands in exactly one shred, and its test in a task;
- every exit condition is carried by a shred or marked task-wide;
- every brittle seam and named risk is carried by a shred or explicitly out of reach;
- no task re-opens a rejected option;
- every task is green on its own;
- every shred's reviews still match its triggers. A shred that gains a login form gains
  security and UX.

A correction that changes the approach is a new decision: record it, with the old
approach as a rejected option. A correction that changes a **requirement** is the specs'
job: point the user to `/define-specs`, since `spec.md` is not this step's to edit. A
correction that changes the **problem** goes back to `/define-intent`.

## 8. Reviews, then ask before writing

When the list is settled, show the review profile: for security and for UX, which shreds
require it and the triggers, each with its `path:line`. Then let the user decide. **The user
always has the final say.** Ask one multi-select question (AskUserQuestion):

> Which conditional reviewers should run during /build? Spec + standards always runs.

- **Options:** "Security review" and "UX review (Playwright)". Offer only those that some
  shred requires.
- **Labels:** mark each required one "(Recommended)" in its label.
- **Descriptions:** say which shreds it covers, and what is lost without it.

If neither is required, skip the question and say so in one line. If the user wants a
reviewer that the triggers did not call for, they can still add it, and that goes into
*Decisions* as well.

Every reviewer that was required but not selected is an **opt-out**. Record it in two places:

- as `opted out by the user` in *Reviews*;
- as a decision `D-n`, with the review as the rejected option, e.g. "**Run the security
  review**: opted out by the user — <their reason, if given>".

Then ask exactly one question:

> Shall I write the plan?

Nothing is written before a yes.

## 9. Write it

Write `.factory/<taskId>/plan.md` at the root of the repository the session runs in.

````markdown
# Plan: <task title, the same line the intent uses>

> Intent: `.factory/<taskId>/intent.md` · Specs: `.factory/<taskId>/spec.md`

## Intent
<Three to five lines from intent.md: what is wrong, for whom, and how you see it. The
problem, not the task list.>

## Chosen solution
<The shape of the change and the seams it touches, with paths. Then one line on why the
shreds come in this order.>

## Decisions

### D-1 <what was decided>
- **Why** — <the reason, in one or two lines>
- **Rejected** — **<option>**: <why not>; **<option>**: <why not>

## Risks and brittle seams
- <risk or seam> — <what would go wrong and what makes it visible> · carried by S-<n>

## Specs and their tests
- **R-1 <short name>** — `<path/to/test>` › `<test name>` (<new | existing>, <boundary>) · `<command>` · lands in S-<n>, T-<n>.<m>

## Shreds

### S-1 <PR title>
- **Scope** — <files or region>
- **Ships alone because** — <what makes it mergeable on its own>
- **Review focus** — <the seam or risk to read hardest, or none>
- **Specs** — R-<n>
- **Exit conditions** — EC-<n>
- **Reviews** — spec+standards<, security><, ux>
- **Size** — <n> commits, ~<n> lines

1. **T-1.1** `<commit message>` — <files> · covers <R-n / test> · green when `<command>`
2. **T-1.2** …

### S-2 …

## Deliberately not shreds
<Work that is not independently finishable, and why, with the exit condition each still
carries. Or *(none)*.>

## Reviews
- **Spec + standards** — always
- **Security** — <required (S-<n>, …) | not required | opted out by the user (D-<n>)> — <each trigger with `path:line`, or why none applies>
- **UX** — <required (S-<n>, …) | not required | not applicable | opted out by the user (D-<n>)> — <why>
  - Run: `<command>` · URL: `<url>` · Sign-in: `<ENV_VAR_USER>`, `<ENV_VAR_PASSWORD>` (names only) · Pages: S-<n> → <paths>

## Exit conditions
```json
{
  "version": 1,
  "exitConditions": [
    { "id": "EC-1", "description": "<observable outcome and its check>", "shred": "S-1", "verified": false },
    { "id": "EC-5", "description": "<baseline condition>", "shred": "all", "verified": false }
  ]
}
```

## Open questions
- <What is still unknown about the how, and who or what would answer it.>

## Changelog
- **<yyyy-MM-dd> — Creation** — written by /plan-and-shred from intent.md and spec.md.
````

Rules for the writing:

- **Every section is written, even empty.** `*(none)*` is a legal answer; a dropped
  heading reads as "nobody thought about it".
- **Specs are referenced, not restated.** The scenarios live in `spec.md`; the plan names
  each requirement by id and short name and gives its test. A copy would drift.
- **Decisions hold every choice that was made.** The approach first, with the options not
  chosen, then every call made while shredding: a split offered and declined, an order
  forced by a dependency, a scope correction. A decision without its rejected
  alternatives is only half recorded.
- **Ids are stable.** `R-n` are the spec's. `D-n`, `EC-n`, `S-n` and `T-n.m` start at 1
  and are never renumbered on a later pass; new items take the next free number.
- **Exit condition fields.** `description` — one sentence, present tense, the observable
  outcome and its check. `shred` — the shred that carries it, or `all`. `verified` —
  `false` for anything you have not watched pass, which here is everything.
- **No code.** File paths, test names and commit titles, not diffs or snippets. The build
  step writes the code.
- **Reviews match the shreds.** Every shred's **Reviews** field lists `spec+standards`,
  plus each conditional reviewer that it requires or that the user added, minus every
  opt-out. *Reviews* and the shreds never disagree. Credentials appear as env var names,
  never as values.
- **Short.** If the plan runs past three pages, the task is probably several. Say so.

On a second pass, read the old file first. Carry over every id, every decision (opt-outs
included) and every `verified` flag. A new trigger on a shred whose review was opted out is
put to the user again. Never re-add a reviewer silently, and never drop one silently.
Then replace what no longer holds, and append one changelog line:
`**<yyyy-MM-dd> — Revision** — <what changed>`. The new file supersedes the old one.

Then tell the user where the file is, show the shreds one line each, and ask which exit
conditions look wrong: they know the task's real risk better than the plan does. Do not
commit it: git belongs to the user.

## Worked example: "Support other LLM clients"

Third-party MCP clients could not connect: there was no dynamic client registration, the
resource identifier depended on a trailing slash, and `offline_access` was never
advertised. The input was a task list of **10 sections and about 45 checkboxes**, two
capabilities in the specs, and 19 exit conditions.

It shredded to **three PR shreds plus one `(no PR)` shred**. What did the work:

- **Ten sections is not ten shreds.** One section was a prerequisite owned by a different
  issue, and another was a follow-up that could not be done yet. Neither can be finished
  on its own, so both went under *Deliberately not shreds* with the exit condition each
  still carries. The Help Center update had nothing in the repo to edit but could be
  finished on its own, so it became `S-4 Update the Help Center article (no PR)`.
- **Reading the code changed the list.** The task list said the resource should
  advertise "the same two scopes". The code advertised two *different* ones, so the real
  target was three, and the task as written would have deleted a working step-up flow.
  The markdown could not show that.
- **The refactor-then-use split was offered, not assumed.** Splitting the identity store
  (inert) from the endpoint (which turns it on) isolated the risk of an unauthenticated
  public endpoint. But it spread four exit conditions across both halves and left a
  reviewer reading code with no caller. The user chose to merge them, and that went into
  *Decisions* with the split as the rejected option.
- **Commits followed the seams.** Inside the merged shred the tasks ran: rename the
  resource identifier (mechanical, alone), add the client store with its tests, add the
  registration endpoint with its end-to-end test, advertise the scopes. Each one was green
  on its own.

## Troubleshooting

| Issue | Response |
|---|---|
| No task id given | List `.factory/*/` and ask; never guess from the branch. |
| `intent.md` missing | Stop and point to `/define-intent`. |
| `spec.md` missing | Stop and point to `/define-specs`. |
| The code contradicts the specs | Raise it before proposing approaches; a requirement change goes back to `/define-specs`. |
| Researcher could not find build or test commands | Say so and ask the user. Do not write a condition with an invented command. |
| No approach is clearly better | Say so, lay out what each would cost, and let the user choose; record the tie-breaker in *Decisions*. |
| The project has no tests | Each requirement's test is a literal manual check; *Green when* is the build command. |
| A task cannot be green on its own | Merge it with the task it depends on, or reorder until it can. |
| A shred is far over the size guide and will not split | Keep it, say why in *Size*, and name it in *Review focus*. |
| The honest answer is one shred | Write one shred. |
| UX is required but the run command, URL or sign-in is unknown | Keep it required, put the gap under *Open questions*; /build cannot run it until answered. |
| The user opts out of a required review | Their call. Record it in *Reviews* and as a decision; do not argue it twice. |

## Guardrails

- **Don't implement.** No code, no tests, not even a stub. The build step writes them.
- **Don't plan before the approach gate.** The approach is the user's call.
- **Don't re-open a rejected option** without the user, and record it as a decision when
  they do.
- **Don't edit the intent or the specs.** Corrections go back to the step that owns them.
- **Don't write before the step 8 answer.**
- **Don't shred into pieces that cannot ship.** "Part 1 of 3" is a phase, not a PR.
- **Don't drop a requirement or an exit condition.** Each one lands in a shred, is marked
  task-wide, or is named as deliberately out of scope.
- **Don't invent coverage, commands or business rules.** Unknown goes under *Open
  questions*.
- **Don't mark conditions verified to be helpful.** An unearned `true` is worse than a
  missing condition.
- **Don't decide the reviews for the user.** Recommend from the triggers; the user opts in or out at step 8.
- **Don't touch git.** No commits, branches, or stashes; the user owns the repo.
