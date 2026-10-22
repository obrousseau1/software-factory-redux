// Records which factory step the main session is in, so the guards of earlier steps stand down.
//
// Usage, from .claude/settings.json:
//   PreToolUse (matcher Skill|Agent) and UserPromptExpansion:
//     node "$CLAUDE_PROJECT_DIR/.claude/hooks/step.mjs"
//
// Skill-frontmatter hooks stay active for the rest of the session, so after /define-intent then
// /build, define-intent's guard would still block build's writes. When the main session invokes a
// step (a skill, or the architect agent, named in policy.json "steps"), this writes
// .factory/.step = { step, session_id }; guard.mjs then enforces only the current step's profile.
// Calls made inside a subagent never move the step. Always exits 0: it records, it never blocks.
// It also appends each step start (and /hyperspace's) to .factory/usage-log.jsonl for usage.mjs.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readPolicy } from "./policy.mjs";

function stepOf(input) {
  if (input.hook_event_name === "UserPromptExpansion") return input.command_name;
  if (input.tool_name === "Skill") return input.tool_input?.skill;
  if (input.tool_name === "Agent") return input.tool_input?.subagent_type;
  return undefined;
}

// The step's arguments: "<taskId> S-n" for a skill, free text for the architect's prompt.
function argsOf(input) {
  if (input.hook_event_name === "UserPromptExpansion") return input.command_args ?? input.arguments ?? input.prompt;
  return input.tool_input?.args ?? input.tool_input?.prompt;
}

// The first word of the arguments that names a task folder, then any folder name they mention.
function taskOf(args, factory) {
  const tasks = existsSync(factory) ? readdirSync(factory, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : [];
  const words = String(args ?? "").split(/[\s`'"/\\,.:()]+/);
  return words.find(word => tasks.includes(word));
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const step = String(stepOf(input) ?? "").replace(/^\//, "");
  const isStep = readPolicy().steps?.includes(step);
  if (!input.agent_type && (isStep || step === "hyperspace")) {
    const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
    const factory = path.join(root, ".factory");
    mkdirSync(factory, { recursive: true });
    if (isStep) writeFileSync(path.join(factory, ".step"), JSON.stringify({ step, session_id: input.session_id }));
    const args = argsOf(input);
    const event = {
      ts: new Date().toISOString(),
      session_id: input.session_id,
      transcript_path: input.transcript_path,
      step,
      taskId: taskOf(args, factory),
      shred: step === "build" || step === "ship" ? String(args ?? "").match(/\bS-\d+\b/)?.[0] : undefined,
    };
    appendFileSync(path.join(factory, "usage-log.jsonl"), JSON.stringify(event) + "\n");
  }
} catch (error) {
  // No marker means every guard enforces, which is today's behaviour: fail safe, say why.
  process.stderr.write(`[step] ${error.message}\n`);
}
process.exit(0);
