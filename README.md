# software-factory-redux

A set of Claude Code skills and subagents that take a task from a reported problem to a
shipped change, one gated step at a time. Each step writes a document that the next
step reads.

## Layout

```
.claude/
  agents/
    falcon-explorer.md       read-only area map (Read/Grep/Glob, haiku)
    yoda-architect.md        steps 2 + 3, writes spec.md + plan.md; /hyperspace relays its gates (opus)
    luke-builder.md          step 4: builds one shred, one commit per task (sonnet)
    threepio-spec.md         step 4: spec + standards review, always (opus)
    chewie-security.md       step 4: security review, when the plan selects it (opus)
    artoo-ux.md              step 4: UX review in a real browser via Playwright MCP (sonnet)
    leia-fixer.md            step 4: fixes review findings, production code only (sonnet)
  settings.json              wires step.mjs for the main session
  skills/
    hyperspace/SKILL.md      runs every step below from the main session
    define-intent/SKILL.md   step 1
    define-specs/SKILL.md    step 2
    plan-and-shred/SKILL.md  step 3
    build/SKILL.md           step 4, the orchestrator
    ship/SKILL.md            step 5, writes ship.md for the author's PR
    clean-code/              design audit the builder runs (vendored from TaskFlow)
  hooks/
    guard.mjs                PreToolUse guard shared by every step
    test-lock.mjs            proves the fixer changed no test (SubagentStop + /build)
    lessons.mjs              records review findings as lessons, de-duplicated
    lessons-gate.mjs         blocks the builder until it has read the lessons
    step.mjs                 records the step the main session is in, so earlier guards stand down
    policy.mjs               policy.json reader and glob matcher shared by both
    policy.json              what each step may write and run, and which paths are tests
```

### Write permissions

Each skill declares a `PreToolUse` hook in its frontmatter that runs
`guard.mjs <profile>`. The profile in `policy.json` lists:

- `write` — globs, relative to the project root, that file tools may touch (`[]` = read-only)
- `deny` — globs carved out of `write`; `"@tests"` stands for the top-level `testGlobs`
- `shell` — command prefixes Bash/PowerShell may run (`["*"]` = anything, `[]` = none);
  redirection, pipes, chaining and `--output` are always refused for a restricted profile
- `shellDeny` — with `shell: ["*"]`, prefixes refused in any segment of a command
  (`git push`, `gh pr create`, …). Best effort, not a shell parser
- `defer` — agent types whose calls this profile leaves to that agent's own guard (the
  hook input's `agent_type`), so `/build`'s guard does not block its own builder
- `branchPattern` — regex every branch the profile creates must match (`/build`:
  `<taskId>-S-<n>-<slug>`)

A skill's frontmatter hooks stay active for the rest of the session, so after `/define-intent`
its guard would still block `/build`'s writes. `step.mjs`, wired in `.claude/settings.json`,
records in `.factory/.step` which step the main session invoked last (a skill, or the
`yoda-architect` agent). The guard of any other step in `policy.json` `steps` then stands down. No
marker, or one from another session, and every guard enforces as before. Agent profiles
(builder, fixer, reviewer) ignore the marker.

Each step ends by running `step.mjs done`, which sets the marker to `done`: every step guard
stands down, so PR fixes and other work after a step are not blocked. If a step was
interrupted and its guard still blocks, end it yourself with
`! node "$HOME/.claude/hooks/step.mjs" done` (or the project's `.claude/hooks/`). Claude must
not do this on its own: ending a step to get past its guard is a bypass.

To add a step: add its profile to `policy.json`, add its name to `steps`, and copy the `hooks:`
block from `define-intent/SKILL.md` with the new profile name. An unknown profile blocks
everything.
Check the hooks with `node --test .claude/hooks/*.test.mjs`.
Agents that only need to read get a `tools: Read, Grep, Glob` allowlist instead. An agent
that writes declares the same `hooks:` block in its own frontmatter, with its own profile,
so the guard holds whatever skills it preloads.

Each task's documents live in the repository being worked on, under one folder per task:

```
.factory/<taskId>/
  intent.md      step 1 — define-intent
  spec.md        step 2 — define-specs
  plan.md        step 3 — plan-and-shred, or the architect agent for steps 2 + 3
  ship.md        step 5 — ship, one section per PR shred
```

`<taskId>` is a ticket key (`OB-27`) or a confirmed kebab-case slug.

## Steps

| # | Step | Skill | Writes |
|---|---|---|---|
| all | Run the task | `/hyperspace <taskId or "problem">` | nothing itself: runs the steps below |
| 1 | Define intent | `/define-intent` | `.factory/<taskId>/intent.md` |
| 2 | Define specs | `/define-specs` | `.factory/<taskId>/spec.md` |
| 3 | Plan and shred | `/plan-and-shred` | `.factory/<taskId>/plan.md` |
| 2 + 3 | Architect | spawned by `/hyperspace`, or `claude --agent yoda-architect <taskId>` | `spec.md` and `plan.md` only |
| 4 | Build | `/build <taskId> [S-n]` | one shred's branch and commits; corrects `plan.md` (and `spec.md`) |
| 5 | Ship | `/ship <taskId> [S-n]` | that shred's section of `.factory/<taskId>/ship.md` |

Review happens inside build, once per shred. Ship runs after it, once per shred, and never
opens the PR.

## Install

### Every step

1. **Claude Code**, with the project folder **trusted**: the agents' inline MCP server
   only loads in a trusted folder.
2. **Node.js 18+**. The guard and the test lock run on it, as hooks.
3. **Git.** The target repository must be a git repo.
4. **Copy `.claude/`** into the target repository, or into `~/.claude` to make it available
   everywhere. If the target already has a `.claude/settings.json`, merge the `hooks` block
   into it rather than overwriting it.
5. **Ignore the step marker** in the target repository:
   ```
   echo ".factory/.step" >> .gitignore
   ```
6. **Check the hooks:**
   ```
   node --test .claude/hooks/*.test.mjs
   ```

### For `/build`

1. **GitHub CLI**, signed in. The PR gate reads the previous shred's PR with it.
   ```
   winget install GitHub.cli        # or: brew install gh
   gh auth login
   ```
2. **The `ponytail` plugin.** The builder and the fixer run under `ponytail:ponytail`.
   `/build` stops if it is missing. In Claude Code:
   ```
   /plugin marketplace add <owner>/<repo>
   /plugin install ponytail@<marketplace>
   ```
   Take `<owner>/<repo>` and `<marketplace>` from a machine where they are already
   installed: run `/plugin` there, or look in `~/.claude/plugins/known_marketplaces.json`.
3. **`clean-code`** needs nothing: it ships in `.claude/skills/`.
4. **Tune `testGlobs`** in `.claude/hooks/policy.json` for the target repository's test
   layout. The defaults cover the common .NET, JS, Python and Go layouts. The fixer may
   never write a path that matches them.

### For UX reviews (only if a plan selects them)

1. **`npx`**, which comes with Node.js. The Playwright MCP server, `@playwright/mcp@0.0.83`,
   is pinned in `.claude/agents/artoo-ux.md` and fetched on first use. There is nothing
   to install globally.
2. **A browser.** Google Chrome is Playwright's default. Without it:
   ```
   npx playwright install chrome
   ```
   Or use Edge: add `"--browser", "msedge"` to the `args` in `artoo-ux.md`.
3. **Prime it once** (optional), so the first review does not wait on the download:
   ```
   npx -y @playwright/mcp@0.0.83 --help
   ```
4. **Ignore the screenshots** in the target repository:
   ```
   echo ".factory/ux-artifacts/" >> .gitignore
   ```
5. **Per target app:**
   - it starts locally with one command and serves a URL, which the plan records;
   - if it has a login, the env vars named in the plan hold a **throwaway test account**.
     `/build` passes the values to the reviewer, so they appear in the transcript.

The security reviewer needs nothing to install.

### Lessons (nothing to install)

`/build` creates `.factory/lessons.json` and `.factory/lessons.md` after the first review that
finds something. **Commit both** to the default branch, on their own and outside the shred
PRs, so that every later build, yours or a teammate's, learns from them. Never edit
`lessons.json` by hand. If you have to, run `node .claude/hooks/lessons.mjs render`
afterwards.

### Usage tracking (nothing to install)

`step.mjs` logs each step start to `.factory/usage-log.jsonl`. `usage.mjs` reads Claude Code's
own transcripts against that log and prints estimated vs consumed time and tokens per step,
subagents included:

```
node .claude/hooks/usage.mjs report <taskId>   # table + .factory/<taskId>/usage.json
node .claude/hooks/usage.mjs history           # past averages, for the plan's estimates
```

- **Tokens:** input + cache writes + output. Cache reads are left out: they are cheap and
  would dwarf the rest.
- **Minutes:** active time. A gap that ends in your prompt is time spent waiting on you, so
  it is not counted.
- **Estimates:** each shred's *Estimate* in `plan.md` (its commits times past per-commit
  rates), and each other step's past average. Fixed the first time they are written.

`/hyperspace` shows the table at the start and at every stop. **Commit** the `usage.json`
files: Claude Code deletes old transcripts, and the plan step calibrates its estimates from
them. `usage-log.jsonl` holds local transcript paths; add it to `.gitignore`.

## Using it

With [Install](#install) done, run the whole task from the main session, on Opus (a
skill's `model:` only holds for its first turn):

```
/hyperspace "<the problem in the reporter's words>"
/hyperspace <taskId>                      # resume: the stage is read from .factory/, git and gh
```

`/hyperspace` works out where the task stands and runs the next step. It moves between steps
without asking, but every step keeps its own gates. It runs `/define-intent`, then spawns
the `yoda-architect` for steps 2 + 3. Each time the architect reaches a gate, it returns the
question; `/hyperspace` asks you and resumes the same agent with your answer. Then it runs
`/build` and `/ship` for one shred and stops at the PR, which you open. Run
`/hyperspace <taskId>` again for the next shred.

Each step can still be run on its own:

```
/define-intent "<the problem in the reporter's words>"
```

The skill maps the area with `falcon-explorer` and explores the problem with you. It
writes `intent.md` only after you confirm the problem is clear. It never commits.

```
/define-specs <taskId>
```

The skill reads that task's `intent.md`, maps what the user experiences today, and writes
the specs with you. Once you agree them, it writes `spec.md`: a story and Given/When/Then
requirements, plus out of scope and open questions. It holds the what only, never the how.

```
/plan-and-shred <taskId>
```

The skill reads `intent.md` and `spec.md`, maps what a change would touch, and proposes
two or three approaches. Once you pick one, it gives every requirement the test that
proves it and derives the exit conditions. It then cuts the work into tasks that are each
one atomic commit, and groups them into shreds that are each one reviewable PR. Once you
agree the list, it writes `plan.md`: the intent, the chosen solution, the decisions with
the rejected options, the risks, the specs' tests, the shreds with their tasks, and the
exit conditions.

It also decides **which reviews each shred needs** during `/build`, from concrete triggers
with `path:line`:

- **Security** — when the shred touches auth, user input that reaches a sink, secrets,
  PII, a new endpoint or upload, permission boundaries, CI/infra, or dependencies.
- **UX** — when the shred changes a web UI.

Before writing, it shows you that profile and asks which conditional reviewers to run. You
have the final say. An opt-out is recorded in the plan's *Reviews* and as a decision. The
spec + standards review always runs.

```
claude --agent yoda-architect <taskId>
```

Runs steps 2 and 3 in one Opus session and writes only `spec.md` and `plan.md`. Subagents
cannot ask the user anything, so as a subagent of `/hyperspace` it stops at each of its three
gates with a `GATE` block and is resumed with your answer. As the main session (`--agent`)
it asks you directly.

```
/build <taskId> [S-n]
```

Builds **one shred** and stops at its branch. Run it from the main session, because it
spawns subagents. The run:

1. **PR gate.** It picks the next shred and checks that the previous one already has a PR.
   It never opens a PR itself: that gate is yours.
2. **Branch.** It creates the shred's `Branch` from `plan.md`, `<taskId>-S-<n>-<slug>`
   (the guard blocks any other name). The base is the default branch if the previous PR
   is merged, or `<S-(n-1) branch>` (stacked) while that PR is still open.
3. **Builder.** It spawns `luke-builder` once. The builder makes one commit per task,
   red-green-refactor under ponytail, then runs `/clean-code audit` and the project's own
   checks.
4. **Review + fix, at most 3 rounds.** In each round, `/build` runs the checks itself, and
   the reviewers selected in the plan run in parallel:
   - `threepio-spec` always runs;
   - `chewie-security` runs where the plan selected it;
   - `artoo-ux` runs where the plan selected it, against the app, which `/build` starts.

   A single `leia-fixer` then fixes all the `fix` findings, in **production code only**. From
   round 2 on, only the threepio-spec and the reviewers that still had blocking findings
   run again.
5. **Wrap-up.** It verifies the exit conditions and corrects `plan.md` with a changelog line.
   It then tells you to push and open the PR.

The fixer's tests are locked twice. Its guard refuses file writes that match `testGlobs`.
Before each fixer spawn, `/build` writes `.factory/build-lock.json` with the current commit.
`test-lock.mjs verify` then runs as the fixer's Stop hook and again from `/build`. It
compares every path against that commit and blocks if a test changed, even through the
shell or in a commit. A finding that needs a test changed or added comes back as
`test-change`, and you decide it. A missing regression test for a security fix is one
example. If you agree, a narrow builder spawn writes the test.

The **security reviewer** is modelled on Anthropic's `security-review` command and
awesome-copilot's `security-review` skill. It reviews the shred's diff only and does the
following:

- maps the repo's existing security patterns;
- traces data flow from entry points to sinks across files;
- scans changed files for secrets and checks the dependencies the diff adds;
- filters out false positives against hard exclusions, such as DoS, rate limiting and
  test-only files.

It reports only findings at confidence 8/10 or higher. CRITICAL, HIGH and MEDIUM findings
block the loop.

The **UX reviewer** drives the running app headless with the Playwright MCP server, which is
declared in the agent's own frontmatter, so only that agent gets a browser. For each page,
it covers:

- every user-facing scenario in the shred's specs;
- the loading, empty and error states;
- accessibility basics, from the accessibility snapshot;
- responsive layout at 375 px and 1280 px;
- console errors.

Screenshots go to `.factory/ux-artifacts/`. Add that folder to `.gitignore`.

**Lessons.** Every real finding becomes a lesson in a file shared by the whole repo, so the
next build does not fall into the same hole.

- **Recording.** After the loop, `/build` records the findings: every resolved `fix`, every
  accepted `test-change`, and every blocking finding still open. Each one is turned into a
  preventive rule with narrow `paths`. `lessons.mjs record` then writes
  `.factory/lessons.json` and renders `.factory/lessons.md`.
- **Duplicates.** `/build` attaches a finding to an existing lesson when it is the same hole
  worded differently. The script also merges identical rules and duplicates inside a batch,
  and never counts the same occurrence twice, so recording the same findings again changes
  nothing.
- **The builder must read it.** `lessons-gate.mjs` blocks every builder tool, including
  `Read`, Bash and file writes, until the builder has read `lessons.md` in full. The builder's
  summary must say which lessons it applied, and where.
- **Repeats.** The reviewers read the lessons too. A finding that repeats a known lesson is
  tagged `repeats: L-n`, becomes blocking, and is called out in the report, so you can see a
  lesson that does not stick.

`testGlobs` in `policy.json` cover the common .NET, JS, Python and Go layouts. Tune them for
the repository you copy this into.

`/build` needs the plugins, `gh` and, for UX reviews, Playwright: see [Install](#install).

```
/ship <taskId> [S-n]
```

Run it once `/build` has stopped at the shred's branch. It reads the plan, the specs, the
shred's commits and its diff, and writes that shred's section of `ship.md`, ready to paste
as the PR description:

- **Summary** — two to four sentences: the problem, what is different now, and what is
  left out.
- **Main decisions** — at most five, each with the option rejected and why.
- **Review these** — at most seven places, ranked by risk, each with `path:line`, the
  question to answer, and why it is risky. They come from the shred's review focus and
  risks, its open conditions, deferred test changes, the plan corrections the build made,
  its lessons, and the diff itself.

It runs no checks and reports only what the plan records. It never pushes or opens the PR:
the author does. Running it again replaces that shred's section only.

It then **wraps up**, after TaskFlow's wrap-up: one pass to collect, one question, then
writes only what you keep.

- **Lessons the build did not record.** `/build` records the review findings. Ship looks
  at what the other steps found:
  - the plan or spec corrections in the changelog;
  - exit conditions left open;
  - deferred test changes;
  - work moved to another shred.

  Ship keeps only what is specific to this repo and not already in `lessons.json`, then
  asks which ones to record. The kept ones go through `lessons.mjs record`, with
  `reviewer: "wrap-up"`.
- **Learnings for future work.** At most three transferable lessons about the way of
  working, each tied to the moment in the task that taught it. Ship only suggests them and
  writes them nowhere. Anything naming the repo's code is a lesson instead. On the task's
  last shred, the wrap-up covers the whole task.
