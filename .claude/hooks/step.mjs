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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readPolicy } from "./policy.mjs";

function stepOf(input) {
  if (input.hook_event_name === "UserPromptExpansion") return input.command_name;
  if (input.tool_name === "Skill") return input.tool_input?.skill;
  if (input.tool_name === "Agent") return input.tool_input?.subagent_type;
  return undefined;
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const step = String(stepOf(input) ?? "").replace(/^\//, "");
  if (!input.agent_type && readPolicy().steps?.includes(step)) {
    const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
    mkdirSync(path.join(root, ".factory"), { recursive: true });
    writeFileSync(path.join(root, ".factory", ".step"), JSON.stringify({ step, session_id: input.session_id }));
  }
} catch (error) {
  // No marker means every guard enforces, which is today's behaviour: fail safe, say why.
  process.stderr.write(`[step] ${error.message}\n`);
}
process.exit(0);
