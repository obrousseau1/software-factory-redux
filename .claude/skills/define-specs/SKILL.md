---
name: define-specs
description: Turn a task's intent into specs, then write .factory/<taskId>/spec.md — the user story and the Given/When/Then requirements that say what the system must do, with what is out of scope and what is still open. Behaviour only, no solution. Use after define-intent, or when the user asks to spec a task or write its requirements. Do NOT use to frame the problem (use define-intent), or to choose the approach, plan the tests or split the work (use plan-and-shred).
argument-hint: "[taskId]"
model: opus
hooks:
  PreToolUse:
    - matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell"
      hooks:
        - type: command
          command: node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs" define-specs
---

# Define the specs

The intent says what is wrong. This step says **what the system must do once it is
right**, as requirements someone else could test. It does not say how: choosing the
approach, the tests and the commits is `/plan-and-shred`'s job. A spec that carries a
solution decides the change before the options have been compared.

**Input:** $ARGUMENTS — the task id whose `intent.md` these specs build on.

## 0. Load the intent

Do not spec from a title. Resolve the task id:

- If the user gave one, use it.
- Otherwise list the folders under `.factory/` and ask which task. Never infer the id
  from the current branch or the working tree.

Read `.factory/<taskId>/intent.md`. If it does not exist, stop: say so and point the
user to `/define-intent`. Specs without an agreed problem decide the change before
anyone has agreed what is wrong.

If `.factory/<taskId>/spec.md` already exists, this is a second pass: read it now. The
requirement ids carry over (see step 4).

## 1. Map the behaviour today

Requirements describe what the user experiences, so first find out what they experience
now. Dispatch the `falcon-explorer` subagent with the intent's summary and its
*Where it lives* paths. Ask it for the **boundaries the user touches** (the screen, the
endpoint, the command, the message), what each one does today, and the existing tests
that pin that behaviour. When the problem spans two distinct areas, dispatch two
researchers in parallel, one per area — no more.

Show the user a short digest. Keep the `path:line` citations for the conversation; they
help the user check a scenario against the code. They do not go into the spec.

## 2. Write the requirements

Start from one story line:

> As a \<role\>, I want \<behaviour\>, so that \<outcome\>.

Then the requirements, `R-1` upward. Each is a short name plus one or more scenarios in
**Given / When / Then** form, each scenario checkable by a test or a person following it
literally.

### Behaviour, not code

A scenario describes **what the user experiences**, observed from as close to them as the
system allows — never what the code looks like inside.

- **Given** is a state the user could be in: data that exists, a role they hold, a
  setting they chose. Not "the cache is populated" unless the user can see the cache.
- **When** is something the user (or the system acting for them — a schedule, an
  inbound webhook) does: clicks, calls the endpoint, runs the command, sends the message.
- **Then** is what they can see or receive: the screen shows, the response returns, the
  file contains, the message arrives, the number reads. Name the actual value when it
  matters.

Pick the **outermost boundary** the user touches and observe there: the UI for an app,
the HTTP response for an API, stdout and the exit code for a CLI, the delivered message
for an integration, the row a report reads for a data job. Drop inward only when the
outer boundary cannot be reached in a check, and say why in the scenario.

A scenario that would still pass if the feature were broken for the user is wrong. These
are **not** requirements: "method `X` is called", "class `Y` exists", "field `Z` is set",
"the handler uses the new service", "a unit test covers `foo()`". Rewrite each one as
the outcome it was meant to produce, or cut it.

| Code-shaped (rewrite) | Behaviour-shaped (keep) |
|---|---|
| Then `PeriodBuilder.IncludesToday` returns true | Then the dashboard's rolling 7-day total includes today's orders |
| Then `NotificationService.Send` is invoked | Then the Slack channel receives "Order 123 shipped" within one minute |
| Then the `retries` column is incremented | Then after the third failed call the user sees "Try again later" and no fourth call is made |

Cover:

- the happy path;
- the obvious failure paths;
- the edge cases worth thinking about — boundaries, empty and huge inputs, retries,
  concurrency, permissions, time zones, whatever this change can actually hit.

### No solution

A requirement has to hold whichever approach is chosen next. If a scenario only makes
sense for one design, it is a design decision dressed as a requirement: note the idea
for `/plan-and-shred` and rewrite the scenario as the outcome that design was meant to
produce.

**Never invent a business rule.** If the intent and the conversation do not settle one,
it goes to *Open questions*, not into a scenario. Plain language: no framework jargon
and no code.

If the discussion changes the **problem** — a different symptom, a different user, a
scope the intent excludes — stop and send the user back to `/define-intent`. The specs
must build on the intent, not quietly replace it.

## 3. Agree them — the gate

Show the story and the requirements, then ask:

> Are these the specs to build against?

Nothing is written before a yes. Take additions, cuts and rewordings, reprint, and keep
going until the user agrees.

## 4. Write it

Write `.factory/<taskId>/spec.md` at the root of the repository the session runs in.

```markdown
# <Task title, the same line the intent uses>

> Intent: `.factory/<taskId>/intent.md`

## Story
As a <role>, I want <behaviour>, so that <outcome>.

## Requirements

### R-1 <short name>
- **Given** <state the user is in> **When** <what they do> **Then** <what they see or receive>
- **Given** … **When** … **Then** …

## Out of scope
- <The intent's "Not this", carried over, plus any behaviour ruled out in this step.>

## Open questions
- <What is still unknown, and who or what would answer it.>

## Changelog
- **<yyyy-MM-dd> — Creation** — written by /define-specs from intent.md.
```

Rules for the writing:

- **Specs only.** No approach, no file paths, no risks, no tests, no exit conditions, no
  task list. `/plan-and-shred` writes all of those into `plan.md`.
- **Every section is written, even empty.** `*(none)*` is a legal answer; a dropped
  heading reads as "nobody thought about it".
- **Requirement ids are stable.** `R-1` upward; never renumber. A new requirement takes
  the next free number, and a cut one is removed with a changelog line, not reused.
  `plan.md` refers to requirements by these ids.
- **Short.** A page or two. If it needs more, the task is probably several — say so.

On a second pass, read the old file first, carry over every requirement id, replace what
no longer holds, and append one changelog line —
`**<yyyy-MM-dd> — Revision** — <what changed>`. The new file supersedes the old one. If a
`plan.md` already exists for the task, say which requirements changed: the plan has to
be revised with `/plan-and-shred`.

Then tell the user where the file is and point to `/plan-and-shred <taskId>` as the next
step. Do not commit it — git is the user's.

## Examples

### A normal run

**Input:** `/define-specs OB-27`

**Behavior:** Read `.factory/OB-27/intent.md`. Dispatch the researcher on what the
dashboard and the stored periods show today. Write the story and R-1..R-3: today's orders
appear in the rolling total, a period inside the latency window still accepts late
orders, and a period outside it no longer changes. Do not discuss whether to change the
predicate or the TTL; that is the plan's call. The user agrees; write `spec.md`.

### No intent yet

**Input:** `/define-specs step-notes-missing-from-log`, with no `intent.md` for that id.

**Behavior:** Stop. Say that no intent exists for the id and point to `/define-intent`.
Do not write specs from the slug.

### The user wants to pick the fix

**Input:** midway through, "let's just extend the TTL to 48 hours."

**Behavior:** Note it for `/plan-and-shred` as a candidate approach. Ask what the user
would see if it worked, and write that outcome as the scenario, without the TTL.

## Troubleshooting

| Issue | Response |
|---|---|
| No task id given | List `.factory/*/` and ask; never guess from the branch. |
| `intent.md` missing | Stop and point to `/define-intent`. |
| The user wants a different problem | Send them back to `/define-intent`; do not rewrite the intent here. |
| A scenario only works for one design | Rewrite it as the outcome; carry the design idea to `/plan-and-shred`. |
| A business rule is missing | Put it under *Open questions*; do not settle it in a scenario. |
| The outer boundary cannot be reached in a check | Observe one level in, and say why in the scenario. |

## Guardrails

- **Don't implement, and don't design.** Choosing the approach is `/plan-and-shred`'s job.
- **Don't write before the gate.** The specs are the user's call.
- **Don't spec the code.** Requirements describe what the user experiences, at the
  outermost boundary they touch — not which function runs.
- **Don't invent business rules.** Unknown is a finding.
- **Don't pad.** If the honest set is three requirements, write three.
- **Don't touch git.** No commits, branches, or stashes — the user owns the repo.
