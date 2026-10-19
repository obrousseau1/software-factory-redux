---
name: define-intent
description: Explore a problem until its shape is clear, then write .factory/<taskId>/intent.md — what is wrong, for whom, since when, how to reproduce, where it lives in the code, and what is out of scope. Use at the start of a task, or when the user asks to define or frame a problem before any solution work. Do NOT use when the task is already in specs, implementation, review, or ship; use the skill for that step instead.
argument-hint: "[problem statement, or a path/URL to the ticket]"
model: opus
hooks:
  PreToolUse:
    - matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell"
      hooks:
        - type: command
          command: node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs" define-intent
---

# Define the intent

Three movements. **Map, explore, then capture** — the document is the residue of the
thinking, not a form to fill in.

**Input:** $ARGUMENTS — the problem in the user's words, or a path or URL to the ticket
or issue that reports it.

## 0. Read the report before you explore

A title is not a problem statement. When the input points at a ticket, an issue, or a
file, read it **before** exploring and find where the reporter wrote the actual symptom —
it is routinely narrower and more specific than the title. A title like "Fix Twilio
function" admits half a dozen framings; "nothing received in Slack but there is a log in
Twilio" admits one.

Explore against the reporter's words, not the title. If the input is only a title, ask
for the symptom before going further.

If the exploration's conclusion **contradicts** the report — the report describes an
active failure and you conclude the thing works — that is not a finding, it is a signal
that you measured the wrong thing. Resolve it before the gate in step 3, and say which
one you trust and why.

## 1. Map the area

Dispatch the `falcon-explorer` subagent with the symptom and, if known, the
suspected area. When the problem plausibly spans two distinct areas (say, a producer
and a consumer), dispatch two researchers in parallel, one per area — no more.

Show the user a short digest of what came back: where it lives, how it works today, and
what the code cannot tell. Keep the researcher's `path:line` citations; the document
needs them.

The map is a starting point, not a verdict. If the conversation moves to an area the
researcher did not cover, read it yourself or dispatch another.

## 2. Explore

This is a stance, not a script. Be:

- **Curious, not prescriptive.** Ask the questions that come out of what the user said.
  Challenge assumptions, theirs and yours. Reframe when the framing is the problem.
- **Open, not an interrogation.** Surface several threads and let the user pick what
  resonates; do not funnel them down one line of questions.
- **Visual.** Draw an ASCII diagram when a flow, a state change, or a boundary would take
  a paragraph to describe.
- **Grounded.** Check claims against the code and the researcher's map instead of
  theorising.
- **Patient.** Let the shape of the problem emerge. Do not rush to the document.

What this step is **not**: comparing solutions, recommending an approach, or sketching a
design. If the user drifts there, note the idea as a constraint or an open question and
bring the conversation back to the problem — choosing the change is the next step's job.

Hold on to two things while you explore, because the document needs them and they are
easy to lose:

- **How you would know it happened** — the reproduction, the failing case, the
  screenshot, the number that is wrong.
- **What is not the problem** — the tempting adjacent thing you agreed to leave alone.

## 3. Capture, when the user says so

Do not write the document the moment a shape appears. Ask:

> Is the problem clear enough to write it down?

Only on a yes do you continue. A no means keep exploring — list the threads still open
and offer them. This is the one gate; everything below happens in one pass after it.

## 4. Resolve the task id

Every later step finds this task's documents under `.factory/<taskId>/`, so the id must be
settled before anything is written.

- If the user gave an id (a ticket key such as `OB-27`, an issue number), use it.
- Otherwise propose a short kebab-case slug from the problem — `slack-twilio-drop` — and
  ask the user to confirm or replace it.

Never infer the id from the current branch or the working tree. Say which id you are using.

## 5. Write it

Write `.factory/<taskId>/intent.md` at the root of the repository the session runs in,
creating the folder if needed.

If the file already exists, this is a second pass: read it first, carry over everything
that is still true, and replace the rest. The new file supersedes the old one.

```markdown
# <Problem, in one line the user would recognise>

## What is happening
<The observable symptom, in the user's terms. Not the cause.>

## Who it affects, and when
<Who hits it, how often, since when. "Every export since the 3.2 upgrade" beats
"users are affected".>

## How to see it
<Reproduction steps, the failing input, or the query that shows the wrong number.
If it cannot be reproduced yet, say that plainly — it is the first unknown.>

## Is it isolated
<One place, or a symptom of something broader?>

## Where it lives
<The code involved, from the map and the exploration — `path:line` and what each
piece does. Locations, not changes.>

## Constraints
<What any solution has to live with: compatibility, data that cannot move, a
deadline, a system nobody may touch.>

## Not this
<What was explicitly ruled out of scope during the exploration.>

## Open questions
<What is still unknown, and who or what would answer it. Empty is allowed; made
up is not.>
```

Rules for the writing:

- **Problem only.** No solution, no design, no task list. That is the next step's
  job, and a problem statement carrying a solution decides the change before
  anyone has agreed the change.
- **Nothing invented.** A section the exploration did not reach says so in one
  line. An empty "Open questions" is honest; a fabricated one is noise.
- **Short.** A page. If it needs more, the task is probably several — say so.

Then tell the user where the file is. Do not commit it — git is the user's.

This document is read by the later factory steps (specs, planning, wrap-up). It is where
the task's "summary of the issue" comes from.

## Examples

### A vague title becomes a specific problem

**Input:** `/define-intent "Fix TTL for Meta Ads Cosmos documents"`

**Behavior:** Ask for the symptom; the user says production rolling periods end
yesterday, and periods within the latency window should remain mutable. Dispatch the
researcher on period construction and the TTL setting; show the digest. Explore the
includes-today predicate and latency without proposing a fix. After the user passes the
gate, they supply `OB-27`; write `.factory/OB-27/intent.md`, with the researcher's
citations under *Where it lives*.

### No id given

**Input:** `/define-intent "notes typed on a step never show up in the action log"`

**Behavior:** Map, explore, gate as above. At step 4 propose `step-notes-missing-from-log`,
wait for confirmation, and write `.factory/step-notes-missing-from-log/intent.md`.

### Task already in a later step

**Input:** "Implement the Meta Ads TTL fix."

**Behavior:** Do not run this skill. The task is implementation work and belongs to
the implementation step, using the existing `intent.md` as input.

## Troubleshooting

| Issue | Response |
|---|---|
| Input is only a title | Ask for the symptom in the reporter's words before mapping. |
| Researcher found nothing relevant | Say so, ask the user where they have seen the problem surface, and map again from that clue. Do not write *Where it lives* from guesses. |
| The report contradicts the code | Treat it as a measurement problem: find what you checked that the reporter did not, or the reverse, before the gate. |
| No id given and the user declines a slug | Ask once more; the document cannot be placed without an id. |
| `intent.md` already exists for that id | Second pass: read it, carry over what still holds, supersede it. |

## Guardrails

- **Don't implement, and don't design.** Reading code is exploring; writing code
  is not. Comparing solutions is the next step.
- **Don't write the document unasked.** Step 3 is a real gate.
- **Don't pad the sections.** Unknown is a finding.
- **Don't touch git.** No commits, branches, or stashes — the user owns the repo.
