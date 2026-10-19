// Tests for test-lock.mjs against the real policy.json, in a throwaway git repo.
// Run: node --test .claude/hooks/test-lock.test.mjs

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const lockScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "test-lock.mjs");
const scratch = mkdtempSync(path.join(os.tmpdir(), "test-lock-"));
let repo;
let base;

function git(...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function put(file, content = "x") {
  const full = path.join(repo, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function lock(content) {
  put(".factory/build-lock.json", typeof content === "string" ? content : JSON.stringify(content));
}

function verify() {
  const result = spawnSync(process.execPath, [lockScript, "verify"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
  });
  return { verdict: result.status === 0 ? "allow" : "block", message: result.stderr.trim() };
}

// A repo with one production file and one test, committed; the lock pinned to that commit.
beforeEach(t => {
  repo = path.join(scratch, String(Math.random()).slice(2));
  mkdirSync(repo);
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  // A scratch repo with no key: the user's global signing config must not apply here.
  git("config", "commit.gpgsign", "false");
  put("src/Foo.cs", "class Foo {}");
  put("src/Foo.Tests/FooTests.cs", "class FooTests {}");
  put(".gitignore", ".factory/build-lock.json\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  base = git("rev-parse", "HEAD");
  lock({ base, taskId: "OB-27", shred: "S-1" });
});

after(() => rmSync(scratch, { recursive: true, force: true }));

test("allow: nothing changed", () => {
  assert.equal(verify().verdict, "allow");
});

test("allow: production change, committed and uncommitted", () => {
  put("src/Foo.cs", "class Foo { int x; }");
  git("commit", "-q", "-am", "fix");
  put("src/Bar.cs", "class Bar {}");
  assert.equal(verify().verdict, "allow");
});

test("block: test edited in the working tree", () => {
  put("src/Foo.Tests/FooTests.cs", "class FooTests { /* weakened */ }");
  const { verdict, message } = verify();
  assert.equal(verdict, "block");
  assert.match(message, /src\/Foo\.Tests\/FooTests\.cs/);
});

test("block: test edit committed", () => {
  put("src/Foo.Tests/FooTests.cs", "class FooTests { /* weakened */ }");
  git("commit", "-q", "-am", "sneak");
  assert.equal(verify().verdict, "block");
});

test("block: test deleted", () => {
  git("rm", "-q", "src/Foo.Tests/FooTests.cs");
  assert.equal(verify().verdict, "block");
});

test("block: new untracked test", () => {
  put("web/a.test.ts", "test()");
  assert.equal(verify().verdict, "block");
});

test("allow: a test restored from base", () => {
  put("src/Foo.Tests/FooTests.cs", "class FooTests { /* weakened */ }");
  git("checkout", base, "--", "src/Foo.Tests/FooTests.cs");
  assert.equal(verify().verdict, "allow");
});

test("block: no lock", () => {
  rmSync(path.join(repo, ".factory"), { recursive: true });
  assert.equal(verify().verdict, "block");
});

test("block: malformed lock", () => {
  lock("not json");
  assert.equal(verify().verdict, "block");
});

test("block: lock without a commit", () => {
  lock({ base: "HEAD" });
  assert.equal(verify().verdict, "block");
});
