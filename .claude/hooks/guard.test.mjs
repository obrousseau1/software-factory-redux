// Tests for guard.mjs against the real policy.json.
// Run: node --test .claude/hooks/guard.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const guard = path.join(hooksDir, "guard.mjs");
const root = path.resolve(hooksDir, "..", "..");
const isWindows = process.platform === "win32";

// Feeds one hook payload to the guard; returns "allow" or "block" plus its message.
function run(profile, payload) {
  const input = typeof payload === "string" ? payload : JSON.stringify({ cwd: root, ...payload });
  const result = spawnSync(process.execPath, [guard, profile], {
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { verdict: result.status === 0 ? "allow" : "block", message: result.stderr.trim() };
}

function expectVerdict(expected, profile, payload) {
  const { verdict, message } = run(profile, payload);
  assert.equal(verdict, expected, message || `expected ${expected}`);
}

const write = file_path => ({ tool_name: "Write", tool_input: { file_path } });
const edit = file_path => ({ tool_name: "Edit", tool_input: { file_path } });
const bash = command => ({ tool_name: "Bash", tool_input: { command } });
const powershell = command => ({ tool_name: "PowerShell", tool_input: { command } });

const cases = [
  // define-intent: file writes
  ["allow", "intent.md, relative path", "define-intent", write(".factory/slack-drop/intent.md")],
  ["allow", "intent.md, absolute path", "define-intent", write(path.join(root, ".factory", "OB-27", "intent.md"))],
  ["allow", "intent.md, relative with native separators", "define-intent", write(path.join(".factory", "OB-27", "intent.md"))],
  ["block", "edit outside .factory", "define-intent", edit("src/x.cs")],
  ["block", "absolute path outside .factory", "define-intent", write(path.join(root, "src", "x.cs"))],
  ["block", "another step's document", "define-intent", write(".factory/OB-27/spec.md")],
  ["block", "intent.md one folder too deep", "define-intent", write(".factory/a/b/intent.md")],
  ["block", "name that only starts with intent.md", "define-intent", write(path.join(root, ".factory", "OB-27", "intent.md.bak"))],
  ["block", "path outside the project", "define-intent", write(path.resolve(root, "..", "elsewhere", ".factory", "x", "intent.md"))],
  ["block", "path escaping through ..", "define-intent", write(".factory/x/../../evil.md")],

  // define-intent: shell
  ["allow", "git log", "define-intent", bash("git log --oneline -5")],
  ["allow", "gh issue view in PowerShell", "define-intent", powershell("gh issue view 42")],
  ["block", "redirection", "define-intent", bash("echo hi > file.txt")],
  ["block", "chaining", "define-intent", bash("git log; rm -rf x")],
  ["block", "--output on an allowed command", "define-intent", bash("git diff --output=x.patch")],
  ["block", "prefix without a word boundary", "define-intent", bash("git logx")],
  ["block", "PowerShell write cmdlet", "define-intent", powershell("Set-Content a.txt b")],

  // define-intent: tools the guard does not police
  ["allow", "Read is untouched", "define-intent", { tool_name: "Read", tool_input: { file_path: "src/x.cs" } }],

  // define-specs
  ["allow", "spec.md, relative path", "define-specs", write(".factory/OB-27/spec.md")],
  ["allow", "spec.md, absolute path", "define-specs", write(path.join(root, ".factory", "OB-27", "spec.md"))],
  ["block", "the intent is define-intent's document", "define-specs", edit(".factory/OB-27/intent.md")],
  ["block", "source file", "define-specs", edit("src/x.cs")],
  ["block", "spec.md one folder too deep", "define-specs", write(".factory/a/b/spec.md")],
  ["allow", "git diff", "define-specs", bash("git diff HEAD~1")],
  ["block", "build command", "define-specs", bash("dotnet build")],

  // plan-and-shred
  ["allow", "plan.md, relative path", "plan-and-shred", write(".factory/OB-27/plan.md")],
  ["block", "the spec is define-specs' document", "plan-and-shred", edit(".factory/OB-27/spec.md")],
  ["block", "source file", "plan-and-shred", edit("src/x.cs")],
  ["block", "test command", "plan-and-shred", bash("npm test")],
  ["allow", "past usage, for estimates", "plan-and-shred", bash('node "$CLAUDE_PROJECT_DIR/.claude/hooks/usage.mjs" history')],
  ["allow", "past usage, from a ~/.claude install", "yoda-architect", bash('node "$HOME/.claude/hooks/usage.mjs" history')],
  ["block", "the usage report writes usage.json", "yoda-architect", bash('node "$HOME/.claude/hooks/usage.mjs" report OB-27')],

  // architect: runs define-specs and plan-and-shred, writes spec.md and plan.md only
  ["allow", "plan.md, absolute path", "yoda-architect", write(path.join(root, ".factory", "OB-27", "plan.md"))],
  ["allow", "spec.md", "yoda-architect", edit(".factory/OB-27/spec.md")],
  ["block", "intent.md", "yoda-architect", edit(".factory/OB-27/intent.md")],
  ["block", "source file", "yoda-architect", write("src/x.cs")],
  ["block", "plan.md one folder too deep", "yoda-architect", write(".factory/a/b/plan.md")],
  ["allow", "git log", "yoda-architect", bash("git log --oneline -5")],
  ["block", "git commit", "yoda-architect", bash("git commit -m plan")],

  // build: the orchestrator writes the plan, the spec and the test lock; subagents answer for themselves
  ["allow", "plan.md", "build", edit(".factory/OB-27/plan.md")],
  ["allow", "spec.md", "build", edit(".factory/OB-27/spec.md")],
  ["allow", "the test lock", "build", write(".factory/build-lock.json")],
  ["allow", "the lessons inbox", "build", write(".factory/lessons-inbox.json")],
  ["block", "lessons.json directly (only the script writes it)", "build", write(".factory/lessons.json")],
  ["allow", "recording the lessons", "build", bash('node "$CLAUDE_PROJECT_DIR/.claude/hooks/lessons.mjs" record .factory/lessons-inbox.json')],
  ["block", "intent.md", "build", edit(".factory/OB-27/intent.md")],
  ["block", "source file", "build", write("src/x.cs")],
  ["allow", "test command", "build", bash("dotnet test")],
  ["allow", "branch creation", "build", bash("git checkout -b OB-27-S-2-add-checklist-endpoint --no-track origin/main")],
  ["allow", "stacked branch creation", "build", bash("git checkout -b fix-login-S-3-retry-on-timeout OB-27-S-2-add-checklist-endpoint")],
  ["allow", "listing branches", "build", bash('git branch -a --list "*OB-27-S-2-add-checklist-endpoint"')],
  ["block", "branch without a slug", "build", bash("git checkout -b OB-27-S-2")],
  ["block", "the old slash form", "build", bash("git checkout -b OB-27/S-2")],
  ["block", "bare shred id, via switch", "build", powershell("git switch -c S-3")],
  ["block", "uppercase slug, quoted", "build", bash('git fetch && git checkout -b "OB-27-S-2-Add-Endpoint"')],
  ["block", "git push", "build", bash("git push -u origin OB-27/S-1")],
  ["block", "gh pr create", "build", powershell("gh pr create --fill")],
  ["allow", "gh pr list, the PR gate", "build", bash("gh pr list --head OB-27/S-1 --state all")],
  ["allow", "builder's write, deferred", "build", { ...write("src/x.cs"), agent_type: "luke-builder" }],
  ["block", "unknown agent is not deferred", "build", { ...write("src/x.cs"), agent_type: "general-purpose" }],
  ["allow", "threepio-spec's git diff, deferred", "build", { ...bash("git diff abc1234..HEAD"), agent_type: "threepio-spec" }],
  ["allow", "chewie-security's call, deferred", "build", { ...bash("git log abc1234..HEAD"), agent_type: "chewie-security" }],
  ["allow", "artoo-ux's call, deferred", "build", { ...write("src/x.cs"), agent_type: "artoo-ux" }],
  ["block", "the old reviewer name is not deferred", "build", { ...write("src/x.cs"), agent_type: "reviewer" }],
  ["allow", "probing the app for the UX review", "build", bash('curl -s -o /dev/null -w "%{http_code}" http://localhost:5258')],

  // ship: writes ship.md only, reads git and GitHub, never opens a PR
  ["allow", "ship.md", "ship", write(".factory/OB-27/ship.md")],
  ["block", "the plan", "ship", edit(".factory/OB-27/plan.md")],
  ["block", "source file", "ship", write("src/x.cs")],
  ["block", "ship.md one folder too deep", "ship", write(".factory/a/b/ship.md")],
  ["allow", "the shred's diff", "ship", bash("git diff abc1234..OB-27/S-2")],
  ["allow", "finding the base", "ship", bash("git merge-base OB-27/S-2 origin/main")],
  ["allow", "the PR gate's lookup", "ship", powershell("gh pr list --head OB-27/S-2 --state all")],
  ["block", "gh pr create", "ship", bash("gh pr create --fill")],
  ["block", "gh pr edit", "ship", bash("gh pr edit 41 --body x")],
  ["block", "git push", "ship", bash("git push -u origin OB-27/S-2")],
  ["block", "test command", "ship", bash("npm test")],
  ["allow", "the lessons inbox", "ship", write(".factory/lessons-inbox.json")],
  ["block", "lessons.json directly (only the script writes it)", "ship", write(".factory/lessons.json")],
  ["allow", "recording the lessons", "ship", bash('node "$CLAUDE_PROJECT_DIR/.claude/hooks/lessons.mjs" record .factory/lessons-inbox.json')],
  ["allow", "recording the lessons from a ~/.claude install", "ship", bash('node "$HOME/.claude/hooks/lessons.mjs" record .factory/lessons-inbox.json')],
  ["block", "re-rendering is not ship's", "ship", bash('node "$CLAUDE_PROJECT_DIR/.claude/hooks/lessons.mjs" render')],

  // builder: writes anything outside .factory, never pushes
  ["allow", "source file", "luke-builder", write("src/Foo.cs")],
  ["allow", "test file", "luke-builder", write("src/Foo.Tests/FooTests.cs")],
  ["block", "the plan", "luke-builder", edit(".factory/OB-27/plan.md")],
  ["block", "the test lock", "luke-builder", write(".factory/build-lock.json")],
  ["block", "the lessons", "luke-builder", edit(".factory/lessons.json")],
  ["block", "the rendered lessons", "luke-builder", edit(".factory/lessons.md")],
  ["allow", "commit", "luke-builder", bash('git commit -m "Add the shreds endpoint"')],
  ["block", "git push", "luke-builder", bash("git push")],
  ["block", "git push chained after a test run", "luke-builder", bash("npm test && git push")],
  ["block", "git push after a pipe", "luke-builder", powershell("dotnet test | Out-Null; git push")],
  ["block", "git add -A", "luke-builder", bash("git add -A")],
  ["allow", "git add by path", "luke-builder", bash("git add ./src/Foo.cs")],
  ["block", "gh pr create", "luke-builder", bash("gh pr create")],

  // fixer: production code only
  ["allow", "source file", "leia-fixer", edit("src/Foo.cs")],
  ["allow", "source file outside any test folder", "leia-fixer", edit("src/contests/Entry.cs")],
  ["block", ".NET test project", "leia-fixer", edit("src/Foo.Tests/FooTests.cs")],
  ["block", ".NET unit test project", "leia-fixer", edit("src/Foo.UnitTests/Bar.cs")],
  ["block", "JS test file", "leia-fixer", write("web/a.test.ts")],
  ["block", "JS spec file", "leia-fixer", write("web/src/a.spec.tsx")],
  ["block", "__tests__ folder", "leia-fixer", write("web/__tests__/a.ts")],
  ["block", "snapshot", "leia-fixer", write("web/__snapshots__/a.ts.snap")],
  ["block", "Go test", "leia-fixer", edit("pkg/x_test.go")],
  ["block", "pytest file", "leia-fixer", edit("tests/test_x.py")],
  ["block", "root-level tests folder", "leia-fixer", edit("tests/helpers.py")],
  ["block", "fixture", "leia-fixer", edit("src/fixtures/user.json")],
  ["block", "the plan", "leia-fixer", edit(".factory/OB-27/plan.md")],
  ["block", "the test lock", "leia-fixer", write(".factory/build-lock.json")],
  ["block", "the lessons", "leia-fixer", write(".factory/lessons.json")],
  ["allow", "test run", "leia-fixer", bash("npm test")],
  ["allow", "restoring a test from base", "leia-fixer", bash("git checkout abc1234 -- web/a.test.ts")],
  ["block", "git reset", "leia-fixer", bash("git reset --soft HEAD~1")],
  ["block", "amend", "leia-fixer", bash("git commit --amend --no-edit")],
  ["block", "git push", "leia-fixer", bash("git push")],

  // reviewer: read-only profile shared by threepio-spec, chewie-security and artoo-ux
  ["block", "any write", "reviewer", write("src/Foo.cs")],
  ["allow", "git diff", "reviewer", bash("git diff abc1234..HEAD")],
  ["block", "test command", "reviewer", bash("npm test")],

  // fail closed
  ["block", "unknown profile", "nope", { tool_name: "Read", tool_input: {} }],
  ["block", "malformed input", "define-intent", "not json"],
];

for (const [expected, name, profile, payload] of cases) {
  test(`${expected}: ${name}`, () => expectVerdict(expected, profile, payload));
}

test("allow: intent.md with different casing (Windows only)", { skip: !isWindows && "case-sensitive filesystem" }, () => {
  const upper = path.join(root.toUpperCase(), ".FACTORY", "OB-27", "Intent.md");
  expectVerdict("allow", "define-intent", write(upper));
});

test("block: no profile argument", () => {
  const result = spawnSync(process.execPath, [guard], {
    input: JSON.stringify({ cwd: root, ...write(".factory/x/intent.md") }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(result.status, 2, result.stderr);
});

// Every hook command a skill or agent tells Claude to run must pass that file's own guard, in
// both install modes: the project's .claude/hooks and ~/.claude/hooks. An agent also answers for
// the skills it preloads.
const claudeDir = path.join(root, ".claude");
const read = file => readFileSync(file, "utf8");
const files = [
  ...readdirSync(path.join(claudeDir, "skills")).map(name => path.join(claudeDir, "skills", name, "SKILL.md")),
  ...readdirSync(path.join(claudeDir, "agents")).map(name => path.join(claudeDir, "agents", name)),
];
for (const file of files) {
  const text = read(file);
  const profile = text.match(/hooks\/guard\.mjs" ([\w-]+)/)?.[1];
  if (!profile) continue;
  const preloaded = [...(text.match(/^skills:\n((?:\s+- .+\n)+)/m)?.[1].matchAll(/- (\S+)/g) ?? [])].map(m => m[1]);
  const own = name => existsSync(path.join(claudeDir, "skills", name, "SKILL.md"));
  const bodies = [text, ...preloaded.filter(own).map(name => read(path.join(claudeDir, "skills", name, "SKILL.md")))];
  const commands = new Set(bodies.flatMap(body => [...body.matchAll(/`(node "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/[^`]+)`/g)].map(m => m[1].replace(/<[^>]+>/g, "x"))));
  for (const command of commands) {
    for (const form of [command, command.replace("$CLAUDE_PROJECT_DIR/.claude/hooks/", "$HOME/.claude/hooks/")]) {
      test(`allow: ${path.basename(path.dirname(file)) === "agents" ? path.basename(file) : path.basename(path.dirname(file))} runs ${form}`, () => expectVerdict("allow", profile, bash(form)));
    }
  }
}
