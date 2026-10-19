// Tests for lessons-gate.mjs, with a scratch project and a scratch temp dir for its markers.
// Run: node --test .claude/hooks/lessons-gate.test.mjs

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gate = path.join(path.dirname(fileURLToPath(import.meta.url)), "lessons-gate.mjs");
const scratch = mkdtempSync(path.join(os.tmpdir(), "lessons-gate-"));
let project;
let tmp;

function run(payload) {
  const result = spawnSync(process.execPath, [gate], {
    input: JSON.stringify({ cwd: project, agent_id: "agent-1", ...payload }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, TMPDIR: tmp, TEMP: tmp, TMP: tmp },
  });
  return result.status === 0 ? "allow" : "block";
}

const read = (file_path, extra = {}) => ({ tool_name: "Read", tool_input: { file_path, ...extra } });
const write = file_path => ({ tool_name: "Write", tool_input: { file_path } });
const bash = command => ({ tool_name: "Bash", tool_input: { command } });

function withLessons() {
  writeFileSync(path.join(project, ".factory", "lessons.json"), '{ "version": 1, "lessons": [] }');
}

beforeEach(() => {
  const id = String(Math.random()).slice(2);
  project = path.join(scratch, id, "project");
  tmp = path.join(scratch, id, "tmp");
  mkdirSync(path.join(project, ".factory"), { recursive: true });
  mkdirSync(tmp, { recursive: true });
});

after(() => rmSync(scratch, { recursive: true, force: true }));

test("allow: no lessons file yet", () => {
  assert.equal(run(write("src/Foo.cs")), "allow");
});

test("block: a write before the lessons are read", () => {
  withLessons();
  assert.equal(run(write("src/Foo.cs")), "block");
});

test("block: a shell command before the lessons are read", () => {
  withLessons();
  assert.equal(run(bash("dotnet test")), "block");
});

test("block: reading another file first", () => {
  withLessons();
  assert.equal(run(read("src/Foo.cs")), "block");
});

test("allow: everything after a full read of lessons.md", () => {
  withLessons();
  assert.equal(run(read(".factory/lessons.md")), "allow");
  assert.equal(run(write("src/Foo.cs")), "allow");
  assert.equal(run(bash("dotnet test")), "allow");
});

test("allow: a full read of lessons.json, by absolute path, counts too", () => {
  withLessons();
  assert.equal(run(read(path.join(project, ".factory", "lessons.json"))), "allow");
  assert.equal(run(write("src/Foo.cs")), "allow");
});

test("block: a partial read does not count", () => {
  withLessons();
  run(read(".factory/lessons.md", { offset: 10 }));
  assert.equal(run(write("src/Foo.cs")), "block");
  run(read(".factory/lessons.md", { limit: 5 }));
  assert.equal(run(write("src/Foo.cs")), "block");
});

test("block: another agent's read does not count", () => {
  withLessons();
  run({ ...read(".factory/lessons.md"), agent_id: "agent-2" });
  assert.equal(run(write("src/Foo.cs")), "block");
});

test("block: no agent_id while lessons exist", () => {
  withLessons();
  assert.equal(run({ ...write("src/Foo.cs"), agent_id: undefined }), "block");
});
