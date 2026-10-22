---
name: hyperspace
description: Run a task through the whole factory from the main session — define-intent, then the architect agent for specs + plan (its gates relayed to the user), then build and ship one shred at a time — and stop at each PR, which the user opens. Works out where the task stands from .factory/<taskId>/, git and GitHub, so running it again resumes. Use when the user asks to run, drive, continue or resume a task through the factory, or to take a problem all the way to a PR. Do NOT use to run a single step on purpose (use that step's skill), or to push or open a PR.
argument-hint: "[taskId, or the problem in the reporter's words]"
model: opus
---

# Run a task through the factory

You are the conductor. You write nothing yourself: each step's skill or agent writes its own
document under its own guard. You find where the task stands, run the next step, and move
on when it is done, without asking between steps. **The steps keep every gate they have**,
and the user still opens every PR.

```
/hyperspace <taskId | "problem">
  ├─ no intent.md                 → Skill(define-intent)
  ├─ no spec.md or no plan.md     → Agent(yoda-architect), its gates relayed to the user
  ├─ a shred left to build        → Skill(build, "<taskId> S-n")
  ├─ built PR shred, not shipped  → Skill(ship, "<taskId> S-n")
  └─ shipped, no PR yet           → stop: the user pushes and opens the PR
```

**Input:** $ARGUMENTS — a task id, or the problem in the reporter's words.

## 0. Preconditions

- **Main session only.** The architect's gates need `AskUserQuestion`, which subagents do
  not have. If you are a subagent, say `/hyperspace` runs from the main session, and stop.
- **Opus for the session.** A skill's `model:` lasts one turn, and every gate is a new turn.
  If the session is not on Opus, say once: "Run `/model opus` first: the steps' models only
  hold for their first turn." Then go on.
- **`.claude/settings.json` wires `step.mjs`.** Without it, a step's guard outlives the step
  and blocks the next one. If a guard blocks a step's own document (`[guard:define-intent]`
  refusing `spec.md`), stop and point to the README's *Install*.

## 1. Find where the task stands

**Resolve the task.** If $ARGUMENTS names a folder in `.factory/`, that is the task. If it
looks like an id but has no folder, ask whether to start it. Otherwise it is the problem:
check its size, then go to step 2 with it.

**Size check, for a new problem only.** The factory earns its cost when at least one holds:
the problem needs discovery; the change alters architecture, a public contract, a data
model or how systems interact; several dependent subsystems are involved; the work must be
handed off or audited. File count and duration do not count. If none holds, say so in one
line and ask with `AskUserQuestion`: run the factory, or plan and code it in this session
without it. On the second, stop: the factory is not running.

**The stage comes from the files, git and GitHub, never from memory.** Re-check it before
every step, because the last step may have stopped early. A shred's `<branch>` is its
**Branch** field in `plan.md`.

| What is there | Next |
|---|---|
| No `.factory/<taskId>/intent.md` | define-intent |
| No `spec.md`, or no `plan.md` | architect |
| A PR shred with a branch, a `Build, S-n` changelog line in `plan.md`, and no `## S-n` section in `ship.md` | ship S-n |
| A PR shred shipped, and `gh pr list --head <branch> --state all` finds no PR | stop at the PR gate |
| A PR shred with a branch but no `Build, S-n` line | build S-n (it offers to resume) |
| The first shred with no branch and not a finished `(no PR)` shred | build |
| Every shred built, with a PR or verified | done |

Say the stage in one line before you run its step: `OB-27: plan written, S-1 has PR #41,
next is build S-2.`

**Usage.** Once the task has a folder, run
`node "$CLAUDE_PROJECT_DIR/.claude/hooks/usage.mjs" report <taskId>` (`$HOME/...` when
installed in `~/.claude`) and show its table as it is: estimated vs consumed minutes and
tokens per step. Run it again at every stop (step 4).

## 2. Run the step

- **define-intent:** invoke the `define-intent` skill with the problem. It explores with the
  user and writes `intent.md` only after its gate. Take the task id it settles.
- **architect:** spawn the `yoda-architect` agent in the foreground with the task id. Relay its
  gates (step 3).
- **build:** invoke the `build` skill with `<taskId> S-n`, the shred step 1 found, so its
  usage is counted against that shred. Its own gates (which shred, user decisions in the loop) reach the
  user directly.
- **ship:** invoke the `ship` skill with `<taskId> S-n`.

When a step ends normally, go back to step 1 and run the next one. **Do not ask "shall I
continue?" between steps.**

**Going back.** The stage table only moves forward, so a step that finds an earlier
document wrong needs routing back:

- **The problem changed** (the architect's `BACK` block, or a step saying the intent no
  longer holds): run `define-intent` again with what changed; it reads the old
  `intent.md` as a second pass. Then resume the same architect with `SendMessage`:
  "intent.md updated: <summary>".
- **The specs or the plan are wrong** (build stops because the plan needs revising, or a
  closed PR changed what the next shred can build on): spawn the architect with the task id
  and what the step said. It carries over what still holds.

If the same issue sends you back twice, stop and ask: "We've looped on <issue> twice.
Reconsider the approach?"

## 3. Relay the architect's gates

The architect stops at each of its three gates and returns a `GATE` block: the question,
whether it is multi-select, the options and the context the user needs.

1. Show the user its *Context* as it is: the digest, the draft requirements, the approaches,
   or the shreds.
2. Ask the *Question* with `AskUserQuestion`, using its options verbatim, its recommended
   option first, and multi-select if it says so.
3. If the user answers with a correction or wants to talk it through, discuss it here
   until they settle. Do not resume the architect between turns of that discussion.
4. Resume the same agent with `SendMessage` (load it with ToolSearch if it is deferred).
   Send the user's answer in their words, plus anything they settled in the discussion.
   Never start a new architect: it would lose the map and the drafts.
5. Repeat until it returns `DONE`, then show its shred list. A `BACK` block is not a
   gate: handle it as in *Going back*.

**Never answer a gate yourself,** even when the answer looks obvious. Never edit `spec.md`
or `plan.md`: if the user wants a change after `DONE`, resume the architect with it.

## 4. Stop

Stop, show the usage table (step 1), and name the next command, when:

- **A PR gate is reached.** Ship has printed the PR description. Say: "Push
  `<branch>` and open the PR with that description, then run `/hyperspace <taskId>` for
  the next shred."
- **A step stops early:** a missing precondition, a conflict the build put to the user that
  is still open, or a guard refusal. Pass on what it said; do not work around it. A step
  that names an earlier document as wrong is not a stop: go back (step 2).
- **The user says stop.**
- **The task is done.** List the shreds with their PRs, and remind the user that
  `.factory/lessons.json` and `lessons.md` are committed on their own, to the default
  branch.

## Guardrails

- **Don't write.** No document, no code, no git write. The steps do that, under their guards.
  The one exception is `usage.json`, which the usage report writes itself.
- **Don't skip a gate or answer one.** Auto-advance is between steps, never inside one.
- **One shred per build, one PR per shred.** Never build the next shred before the previous
  one has a PR; `/build` checks this too.
- **Never push or open a PR.**
- **Don't infer the stage from the conversation.** A step that "looked done" and wrote
  nothing is not done.

## Troubleshooting

| Problem | Do this |
|---|---|
| A guard blocks a step's own document | `step.mjs` is not wired: check `.claude/settings.json`, then rerun the step. |
| The architect asks the user directly or writes before a gate | It was started with old instructions. Stop it and spawn it again with the task id; its documents carry over. |
| `SendMessage` says the agent is gone | Spawn the architect again with the task id and a note of the gates already answered. It re-reads what it wrote. |
| `gh` is not authenticated | The PR gate cannot be read. Ask the user whether the PR exists, as `/build` does. |
