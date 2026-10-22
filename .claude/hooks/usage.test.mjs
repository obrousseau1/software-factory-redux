// Tests for usage.mjs, against a fake transcript, subagent and step log in a scratch project.
// Run: node --test .claude/hooks/usage.test.mjs

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "usage.mjs");
const scratch = mkdtempSync(path.join(os.tmpdir(), "usage-"));
let project, transcript;

const at = minute => new Date(Date.UTC(2026, 0, 1, 10, minute)).toISOString();
const jsonl = (file, lines) => writeFileSync(file, lines.map(line => JSON.stringify(line)).join("\n") + "\n");
// 1000 new tokens each: input 100 + cache writes 800 + output 100, plus cache reads that must not count.
const reply = (minute, content = "ok") => ({
  type: "assistant", timestamp: at(minute),
  message: { content, usage: { input_tokens: 100, cache_creation_input_tokens: 800, output_tokens: 100, cache_read_input_tokens: 50000 } },
});
const human = minute => ({ type: "user", timestamp: at(minute), message: { content: "yes" } });
const toolResult = minute => ({ type: "user", timestamp: at(minute), message: { content: [{ type: "tool_result" }] } });
const event = (minute, step, extra = {}) => ({ ts: at(minute), session_id: "s-1", transcript_path: transcript, step, taskId: "OB-27", ...extra });

function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: project } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const rows = () => Object.fromEntries(JSON.parse(readFileSync(path.join(project, ".factory", "OB-27", "usage.json"), "utf8")).rows.map(row => [row.key, row]));

beforeEach(() => {
  project = path.join(scratch, String(Math.random()).slice(2));
  mkdirSync(path.join(project, ".factory", "OB-27"), { recursive: true });
  transcript = path.join(project, "s-1.jsonl");
  writeFileSync(path.join(project, ".factory", "OB-27", "plan.md"), "# Plan\n\n### S-1 Add it\n- **Estimate** — ~30 min · ~5k tokens\n- **Size** — 2 commits, ~80 lines\n");
  // define-intent from minute 0, a 50-minute wait on the user, then build S-1 from minute 60.
  jsonl(transcript, [
    // A hook attachment just before the prompt must not turn the wait into active time.
    human(0), reply(1), reply(3), { type: "attachment", timestamp: at(52) }, human(53), reply(54),
    human(60), reply(61, [{ type: "tool_use", id: "tu-1" }]), toolResult(81), reply(82),
  ]);
  jsonl(path.join(project, ".factory", "usage-log.jsonl"), [
    event(0, "define-intent", { taskId: undefined }), event(60, "build", { shred: "S-1" }), event(60, "build", { shred: "S-1" }),
  ]);
  const agents = path.join(project, "s-1", "subagents");
  mkdirSync(agents, { recursive: true });
  writeFileSync(path.join(agents, "agent-a1.meta.json"), JSON.stringify({ agentType: "luke-builder", toolUseId: "tu-1" }));
  // Real subagent entries are all marked isSidechain.
  jsonl(path.join(agents, "agent-a1.jsonl"), [{ type: "user", timestamp: at(61), message: { content: "build" } }, reply(70), reply(80)].map(e => ({ ...e, isSidechain: true })));
});

after(() => rmSync(scratch, { recursive: true, force: true }));

test("tokens count input, cache writes and output, not cache reads", () => {
  run("report", "OB-27");
  assert.equal(rows()["define-intent"].tokens, 3000);
});

test("time waiting on the user is left out", () => {
  run("report", "OB-27");
  assert.equal(rows()["define-intent"].min, 4);
});

test("a step without a task id takes the next one's", () => {
  run("report", "OB-27");
  assert.ok(rows()["define-intent"].tokens > 0);
});

test("a subagent's tokens land on the step that spawned it", () => {
  run("report", "OB-27");
  const build = rows()["build S-1"];
  assert.equal(build.tokens, 4000);
  assert.deepEqual(build.agents["luke-builder"], { min: 19, tokens: 2000 });
});

test("duplicate step events from a double wiring count once", () => {
  run("report", "OB-27");
  assert.equal(rows()["build S-1"].min, 22);
});

test("a build's estimate comes from the plan", () => {
  run("report", "OB-27");
  assert.equal(rows()["build S-1"].estMin, 30);
  assert.equal(rows()["build S-1"].estTokens, 5000);
});

test("estimates are frozen once written", () => {
  run("report", "OB-27");
  writeFileSync(path.join(project, ".factory", "OB-27", "plan.md"), "### S-1 Add it\n- **Estimate** — ~90 min · ~50k tokens\n");
  run("report", "OB-27");
  assert.equal(rows()["build S-1"].estMin, 30);
});

test("other steps are estimated from past tasks", () => {
  mkdirSync(path.join(project, ".factory", "OB-26"));
  writeFileSync(path.join(project, ".factory", "OB-26", "usage.json"), JSON.stringify({ rows: [
    { key: "define-intent", step: "define-intent", min: 10, tokens: 20000 },
    { key: "build S-1", step: "build", min: 40, tokens: 60000, commits: 3 },
  ] }));
  run("report", "OB-27");
  assert.equal(rows()["define-intent"].estTokens, 20000);
  // OB-26's 3 commits plus OB-27's 2, now reported: (40 + 22) min and (60k + 4k) tokens over 5.
  assert.deepEqual(JSON.parse(run("history")).perCommit, { min: 12.4, tokens: 12800, commits: 5 });
});

test("the table shows estimate, actual and the gap", () => {
  const table = run("report", "OB-27");
  assert.match(table, /build S-1\s+30\s+22\s+5k\s+4k\s+-20%/);
  assert.match(table, /luke-builder\s+19\s+2k/);
});
