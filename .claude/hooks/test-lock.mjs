// Proves the fixer left every test alone.
//
// Usage — as the fixer's Stop hook (SubagentStop), and by /build after each fixer spawn:
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/test-lock.mjs" verify
//
// /build writes .factory/build-lock.json ({ "base": "<sha>", "taskId": "...", "shred": "S-n" })
// before it spawns the fixer. verify lists every path changed since base — committed,
// staged, unstaged, deleted or untracked — and blocks if any matches policy.json's testGlobs.
// Comparing against base catches what the PreToolUse guard cannot: a test edited
// through the shell, or committed.
//
// Exit 0 when no test changed; exit 2 with the paths otherwise. A missing or malformed
// lock blocks too: the fixer only ever runs under one.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { matchingGlob, policyPath, readPolicy } from "./policy.mjs";

function block(reason) {
  process.stderr.write(`[test-lock] ${reason}\n`);
  process.exit(2);
}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch (error) {
    block(`git ${args.join(" ")} failed: ${error.message}`);
  }
}

if (process.argv[2] !== "verify") block('Usage: test-lock.mjs verify');

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const lockPath = path.join(root, ".factory", "build-lock.json");

let lock;
try {
  lock = JSON.parse(readFileSync(lockPath, "utf8"));
} catch (error) {
  block(`Cannot read ${lockPath}: ${error.message}. /build writes it before spawning the fixer.`);
}
if (!/^[0-9a-f]{7,40}$/i.test(lock.base ?? "")) block(`${lockPath} has no valid "base" commit.`);

let testGlobs;
try {
  testGlobs = readPolicy().testGlobs ?? [];
} catch (error) {
  block(`Cannot read ${policyPath}: ${error.message}`);
}
if (testGlobs.length === 0) block(`${policyPath} has no testGlobs; nothing to protect is not a pass.`);

const changed = new Set([
  ...git(root, ["diff", "--name-only", "--no-renames", "--relative", lock.base]),
  ...git(root, ["ls-files", "--others", "--exclude-standard"]),
]);
const touched = [...changed].filter(file => matchingGlob(testGlobs, file));

if (touched.length) {
  block(
    `Tests changed since ${lock.base}, and the fixer may not change tests:\n` +
      touched.map(file => `  - ${file}`).join("\n") +
      `\nRestore each one (git checkout ${lock.base} -- <path>, or delete it if it is new), ` +
      "commit the restore, and report the finding as test-change instead.",
  );
}
process.exit(0);
