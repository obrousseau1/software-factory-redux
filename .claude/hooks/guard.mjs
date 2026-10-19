// PreToolUse guard shared by every factory step.
//
// Usage, from a skill's or agent's frontmatter hook:
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs" <profile>
//
// The profile names an entry in policy.json beside this file:
//   write     — globs, relative to the project root, a file tool may touch. [] = read-only.
//   deny      — globs carved out of write. "@tests" stands for the top-level testGlobs.
//   shell     — command prefixes Bash/PowerShell may run. ["*"] = anything. [] = no shell.
//   shellDeny — with shell ["*"], prefixes refused in any segment of the command.
//   defer     — agent types whose calls this profile leaves to that agent's own guard.
//
// Exit 0 allows the call; exit 2 blocks it and hands stderr back to Claude.
// Anything unexpected — unknown profile, unreadable policy, malformed input — blocks:
// a guard that fails open is not a guard.

import { readFileSync } from "node:fs";
import path from "node:path";
import { expandGlobs, matchingGlob, policyPath, readPolicy } from "./policy.mjs";

const FILE_TOOLS = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

// Characters that would let an allowed prefix carry a write: redirection, chaining,
// piping, subexpressions, and a second line.
const SHELL_METACHARACTERS = /[>|;&`\r\n]|\$\(/;
// Read commands that can still write a file through an option.
const WRITING_OPTIONS = /(^|\s)--output(=|\s|$)/;
// Where one command ends and the next begins, for shellDeny. Best effort, not a parser.
const SEGMENT_SEPARATORS = /&&|\|\||[;|&\r\n`]|\$\(/;

function block(reason) {
  process.stderr.write(`[guard:${process.argv[2] ?? "?"}] ${reason}\n`);
  process.exit(2);
}

function loadProfile(name) {
  if (!name) block("No profile given to guard.mjs.");
  let policy;
  try {
    policy = readPolicy();
  } catch (error) {
    block(`Cannot read ${policyPath}: ${error.message}`);
  }
  const profile = policy.profiles?.[name];
  if (!profile) block(`Unknown profile "${name}" in ${policyPath}.`);
  return {
    isStep: (policy.steps ?? []).includes(name),
    write: expandGlobs(profile.write, policy),
    deny: expandGlobs(profile.deny, policy),
    shell: profile.shell ?? [],
    shellDeny: profile.shellDeny ?? [],
    defer: profile.defer ?? [],
  };
}

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch (error) {
    block(`Malformed hook input: ${error.message}`);
  }
}

function startsWithCommand(command, prefix) {
  return command === prefix || command.startsWith(`${prefix} `);
}

function checkFile(profile, filePath, root, cwd) {
  if (!filePath) block("File tool called without a path.");
  const relative = path.relative(root, path.resolve(cwd, filePath)).split(path.sep).join("/");
  if (relative.startsWith("../") || relative === ".." || path.isAbsolute(relative)) {
    block(`${filePath} is outside the project; this step may only write ${describe(profile.write)}.`);
  }
  if (!matchingGlob(profile.write, relative)) {
    block(`This step may only write ${describe(profile.write)}, not ${relative}.`);
  }
  const denied = matchingGlob(profile.deny, relative);
  if (denied) block(`This step may not write ${relative} (it matches ${denied}).`);
}

function checkShell(profile, command) {
  const trimmed = (command ?? "").trim();
  if (profile.shell.includes("*")) {
    for (const segment of trimmed.split(SEGMENT_SEPARATORS)) {
      const part = segment.trim().replace(/^[({\s]+/, "");
      const denied = profile.shellDeny.find(prefix => startsWithCommand(part, prefix));
      if (denied) block(`"${denied}" is not allowed in this step.`);
    }
    return;
  }
  if (profile.shell.length === 0) block("This step may not run shell commands.");
  if (SHELL_METACHARACTERS.test(trimmed)) {
    block("Redirection, pipes, chaining and subexpressions are not allowed in this step; run one plain read-only command.");
  }
  if (WRITING_OPTIONS.test(trimmed)) block("--output writes a file; not allowed in this step.");
  if (!profile.shell.some(prefix => startsWithCommand(trimmed, prefix))) {
    block(`Only these commands are allowed in this step: ${profile.shell.join(", ")}.`);
  }
}

function describe(globs) {
  return globs.length ? globs.join(", ") : "nothing (read-only)";
}

const profile = loadProfile(process.argv[2]);
const input = readInput();
const cwd = input.cwd ?? process.cwd();
const root = process.env.CLAUDE_PROJECT_DIR ?? cwd;

// A subagent with its own guard answers for its own calls.
if (input.agent_type && profile.defer.includes(input.agent_type)) process.exit(0);

// A step's skill hook outlives the step (see step.mjs): once this session has moved on to
// another step, this guard stands down. No marker, or another session's, enforces as before.
if (profile.isStep) {
  let marker;
  try {
    marker = JSON.parse(readFileSync(path.join(root, ".factory", ".step"), "utf8"));
  } catch {
    marker = undefined;
  }
  if (marker?.session_id && marker.session_id === input.session_id && marker.step !== process.argv[2]) process.exit(0);
}

if (input.tool_name in FILE_TOOLS) {
  checkFile(profile, input.tool_input?.[FILE_TOOLS[input.tool_name]], root, cwd);
} else if (SHELL_TOOLS.has(input.tool_name)) {
  checkShell(profile, input.tool_input?.command);
}
process.exit(0);
