// PreToolUse gate on the builder: no tool runs until it has read the lessons in full.
//
// Usage, from luke-builder.md's frontmatter (matcher Read|Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell):
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/lessons-gate.mjs"
//
// While .factory/lessons.json exists, a Read of .factory/lessons.md or lessons.json with no
// offset and no limit marks this agent (by agent_id) as having read them; every other call
// before that is blocked. No lessons file yet → allow. No agent_id while lessons exist → block:
// a gate that fails open is not a gate. Markers older than a day are swept.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const MARKER_TTL_MS = 24 * 60 * 60 * 1000;
const markerDir = path.join(os.tmpdir(), "factory-lessons-gate");
const caseInsensitive = process.platform === "win32";

function block(reason) {
  process.stderr.write(`[lessons-gate] ${reason}\n`);
  process.exit(2);
}

function sweep() {
  if (!existsSync(markerDir)) return;
  const now = Date.now();
  for (const name of readdirSync(markerDir)) {
    const file = path.join(markerDir, name);
    try {
      if (now - statSync(file).mtimeMs > MARKER_TTL_MS) rmSync(file, { force: true });
    } catch {
      // Another run swept it first.
    }
  }
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch (error) {
  block(`Malformed hook input: ${error.message}`);
}

const cwd = input.cwd ?? process.cwd();
const root = process.env.CLAUDE_PROJECT_DIR ?? cwd;
if (!existsSync(path.join(root, ".factory", "lessons.json"))) process.exit(0);

sweep();
const agentId = input.agent_id;
if (!agentId) block("No agent_id in the hook input; cannot tell whether this agent read the lessons.");
const marker = path.join(markerDir, String(agentId).replace(/[^\w.-]/g, "_"));

if (input.tool_name === "Read") {
  const relative = path.relative(root, path.resolve(cwd, input.tool_input?.file_path ?? "")).split(path.sep).join("/");
  const target = caseInsensitive ? relative.toLowerCase() : relative;
  const isLessons = target === ".factory/lessons.md" || target === ".factory/lessons.json";
  const whole = input.tool_input?.offset == null && input.tool_input?.limit == null;
  if (isLessons && whole) {
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(marker, new Date().toISOString());
    process.exit(0);
  }
}

if (existsSync(marker)) process.exit(0);
block(
  "Read .factory/lessons.md in full (no offset, no limit) before anything else. " +
    "It lists the holes earlier builds fell into.",
);
