// Tests for step.mjs, and for how guard.mjs reads the marker it writes, in a scratch project.
// Run: node --test .claude/hooks/step.test.mjs

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(path.join(os.tmpdir(), "step-"));
let project;

function spawn(script, args, payload) {
  return spawnSync(process.execPath, [path.join(hooksDir, script), ...args], {
    input: JSON.stringify({ cwd: project, session_id: "s-1", ...payload }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
  });
}

const markerPath = () => path.join(project, ".factory", ".step");
const marker = () => JSON.parse(readFileSync(markerPath(), "utf8"));
const setMarker = (step, session_id = "s-1") => writeFileSync(markerPath(), JSON.stringify({ step, session_id }));
const guard = (profile, payload) => (spawn("guard.mjs", [profile], payload).status === 0 ? "allow" : "block");

const skill = name => ({ hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill: name } });
const agent = type => ({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: type } });
const write = file_path => ({ tool_name: "Write", tool_input: { file_path } });

beforeEach(() => {
  project = path.join(scratch, String(Math.random()).slice(2));
  mkdirSync(path.join(project, ".factory"), { recursive: true });
});

after(() => rmSync(scratch, { recursive: true, force: true }));

// step.mjs

test("a step skill sets the marker", () => {
  assert.equal(spawn("step.mjs", [], skill("build")).status, 0);
  assert.deepEqual(marker(), { step: "build", session_id: "s-1" });
});

test("the architect agent sets the marker", () => {
  spawn("step.mjs", [], agent("yoda-architect"));
  assert.equal(marker().step, "yoda-architect");
});

test("a typed slash command sets the marker", () => {
  spawn("step.mjs", [], { hook_event_name: "UserPromptExpansion", command_name: "/define-specs" });
  assert.equal(marker().step, "define-specs");
});

test("a non-step skill leaves the marker alone", () => {
  setMarker("build");
  spawn("step.mjs", [], skill("simplify"));
  assert.equal(marker().step, "build");
});

test("a non-step agent leaves the marker alone", () => {
  setMarker("build");
  spawn("step.mjs", [], agent("luke-builder"));
  assert.equal(marker().step, "build");
});

test("a call made inside a subagent leaves the marker alone", () => {
  setMarker("build");
  spawn("step.mjs", [], { ...skill("ship"), agent_type: "luke-builder" });
  assert.equal(marker().step, "build");
});

// step.mjs: the usage log

const logged = () => readFileSync(path.join(project, ".factory", "usage-log.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));

test("a step start is logged with its task and shred", () => {
  mkdirSync(path.join(project, ".factory", "OB-27"));
  spawn("step.mjs", [], { ...skill("build"), tool_input: { skill: "build", args: "OB-27 S-2" }, transcript_path: "t.jsonl" });
  const [event] = logged();
  assert.equal(event.step, "build");
  assert.equal(event.taskId, "OB-27");
  assert.equal(event.shred, "S-2");
  assert.equal(event.transcript_path, "t.jsonl");
});

test("the architect's task comes from its prompt", () => {
  mkdirSync(path.join(project, ".factory", "OB-27"));
  spawn("step.mjs", [], { ...agent("yoda-architect"), tool_input: { subagent_type: "yoda-architect", prompt: "Task OB-27: read .factory/OB-27/intent.md, S-1 too" } });
  const [event] = logged();
  assert.equal(event.taskId, "OB-27");
  assert.equal(event.shred, undefined);
});

test("/hyperspace is logged but does not move the marker", () => {
  setMarker("build");
  spawn("step.mjs", [], { hook_event_name: "UserPromptExpansion", command_name: "/hyperspace" });
  assert.equal(logged()[0].step, "hyperspace");
  assert.equal(marker().step, "build");
});

test("a non-step skill is not logged", () => {
  spawn("step.mjs", [], skill("simplify"));
  assert.equal(existsSync(path.join(project, ".factory", "usage-log.jsonl")), false);
});

test("malformed input exits 0 and writes nothing", () => {
  const result = spawnSync(process.execPath, [path.join(hooksDir, "step.mjs")], {
    input: "not json",
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
  });
  assert.equal(result.status, 0);
  assert.equal(existsSync(markerPath()), false);
});

// guard.mjs with a marker

test("block: no marker, the step's guard enforces as before", () => {
  assert.equal(guard("define-intent", write("src/x.cs")), "block");
});

test("allow: an earlier step's guard stands down once the session moved on", () => {
  setMarker("build");
  assert.equal(guard("define-intent", write(".factory/OB-27/plan.md")), "allow");
});

test("block: the current step's guard still enforces", () => {
  setMarker("build");
  assert.equal(guard("build", write("src/x.cs")), "block");
});

test("block: a marker from another session is ignored", () => {
  setMarker("build", "s-old");
  assert.equal(guard("define-intent", write("src/x.cs")), "block");
});

test("block: agent profiles ignore the marker", () => {
  setMarker("build");
  assert.equal(guard("leia-fixer", write("src/Foo.Tests/FooTests.cs")), "block");
  assert.equal(guard("luke-builder", write(".factory/OB-27/plan.md")), "block");
});

test("block: an unreadable marker enforces", () => {
  writeFileSync(markerPath(), "not json");
  assert.equal(guard("define-intent", write("src/x.cs")), "block");
});
