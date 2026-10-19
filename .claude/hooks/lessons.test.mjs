// Tests for lessons.mjs, in a scratch project directory.
// Run: node --test .claude/hooks/lessons.test.mjs

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "lessons.mjs");
const scratch = mkdtempSync(path.join(os.tmpdir(), "lessons-"));
let project;

const finding = overrides => ({
  lesson: null,
  rule: "Build SQL with Parameterized(); never concatenate input into a query.",
  category: "security/injection",
  reviewer: "chewie-security",
  severity: "HIGH",
  paths: ["src/Data/**"],
  taskId: "OB-27",
  shred: "S-1",
  at: "src/Data/TaskRepo.cs:88",
  date: "2026-10-17",
  ...overrides,
});

function record(findings) {
  writeFileSync(path.join(project, ".factory", "inbox.json"), JSON.stringify(findings));
  const result = spawnSync(process.execPath, [script, "record", ".factory/inbox.json"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
  });
  return { status: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
}

const lessons = () => JSON.parse(readFileSync(path.join(project, ".factory", "lessons.json"), "utf8")).lessons;
const markdown = () => readFileSync(path.join(project, ".factory", "lessons.md"), "utf8");

beforeEach(() => {
  project = path.join(scratch, String(Math.random()).slice(2));
  mkdirSync(path.join(project, ".factory"), { recursive: true });
});

after(() => rmSync(scratch, { recursive: true, force: true }));

test("creates a lesson and renders the markdown", () => {
  const { status, out } = record([finding()]);
  assert.equal(status, 0);
  assert.equal(out, "created L-1");
  assert.equal(lessons().length, 1);
  assert.match(markdown(), /\*\*L-1\*\* \(seen 1×, last 2026-10-17\) — Build SQL/);
});

test("merges a finding whose rule matches an existing one, ignoring case and punctuation", () => {
  record([finding()]);
  const { out } = record([finding({ shred: "S-2", at: "src/Data/UserRepo.cs:12", rule: "build sql with parameterized()  never concatenate input into a query" })]);
  assert.equal(out, "+1 L-1 (seen 2×)");
  assert.equal(lessons().length, 1);
});

test("attaches a finding to the lesson id /build matched by meaning", () => {
  record([finding()]);
  const { out } = record([finding({ lesson: "L-1", shred: "S-2", rule: "Parameterise every query." })]);
  assert.equal(out, "+1 L-1 (seen 2×)");
  assert.equal(lessons()[0].occurrences.length, 2);
});

test("re-recording the same occurrence is a no-op", () => {
  record([finding()]);
  const { out } = record([finding()]);
  assert.equal(out, "skipped 1 duplicate");
  assert.equal(lessons()[0].occurrences.length, 1);
});

test("merges duplicates inside one batch, from two reviewers", () => {
  const { out } = record([finding(), finding({ reviewer: "threepio-spec" })]);
  assert.equal(out, "created L-1 · skipped 1 duplicate");
});

test("new lessons take the next free id", () => {
  record([finding()]);
  const { out } = record([finding({ rule: "Label every form input.", category: "ux/a11y", at: "web/Login.tsx:20" })]);
  assert.equal(out, "created L-2");
});

test("an unknown lesson id fails and writes nothing", () => {
  record([finding()]);
  const before = readFileSync(path.join(project, ".factory", "lessons.json"), "utf8");
  const { status, err } = record([finding({ lesson: "L-9", shred: "S-2" })]);
  assert.equal(status, 2);
  assert.match(err, /L-9/);
  assert.equal(readFileSync(path.join(project, ".factory", "lessons.json"), "utf8"), before);
});

test("a finding without a rule is refused", () => {
  const { status } = record([finding({ rule: "" })]);
  assert.equal(status, 2);
  assert.equal(existsSync(path.join(project, ".factory", "lessons.json")), false);
});

test("renders the most frequent lesson first", () => {
  record([finding(), finding({ rule: "Label every form input.", category: "ux/a11y", at: "web/Login.tsx:20" })]);
  record([finding({ rule: "Label every form input.", category: "ux/a11y", shred: "S-2", at: "web/Signup.tsx:9" })]);
  const md = markdown();
  assert.ok(md.indexOf("**L-2**") < md.indexOf("**L-1**"), md);
});
