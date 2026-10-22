// Estimated vs consumed time and tokens per factory step, from Claude Code's own transcripts.
//
// Usage:
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/usage.mjs" report <taskId>   prints the table, writes .factory/<taskId>/usage.json
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/usage.mjs" history           past averages, for estimates
//
// step.mjs appends a line to .factory/usage-log.jsonl each time the main session starts a step.
// Every main-session message belongs to the step active at its timestamp; every subagent to the
// step active when it was spawned. Tokens = input + cache writes + output (cache reads left out).
// Minutes = active time: gaps between transcript entries, minus each gap that ends in a human prompt.
// usage.json keeps the totals once transcripts expire, and freezes each estimate when first made.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const factory = path.join(root, ".factory");

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").flatMap(line => {
    try {
      return line.trim() ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
}

const readJson = file => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined);

function isHumanPrompt(entry) {
  if (entry.type !== "user" || entry.isMeta) return false;
  const content = entry.message?.content;
  return !(Array.isArray(content) && content.some(part => part.type === "tool_result"));
}

const tokensOf = usage => (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);

// Totals for the entries of one transcript, split by bucket(entry); a bucket of undefined is skipped.
function measure(entries, bucket, totals) {
  let previous;
  for (const entry of entries) {
    // Only messages: hook attachments and request records land between a wait and the prompt that ends it.
    if (!entry.timestamp || (entry.type !== "user" && entry.type !== "assistant")) continue;
    const key = bucket(entry);
    if (key !== undefined) {
      const total = (totals[key] ??= { ms: 0, tokens: 0 });
      if (previous && !isHumanPrompt(entry)) total.ms += Date.parse(entry.timestamp) - Date.parse(previous.timestamp);
      if (entry.type === "assistant" && entry.message?.usage) total.tokens += tokensOf(entry.message.usage);
    }
    previous = entry;
  }
  return totals;
}

const rowKey = event => (event.shred ? `${event.step} ${event.shred}` : event.step);

// An event with no task id (hyperspace or define-intent on a fresh problem) takes the next one's in its session.
function eventsFor(taskId) {
  const bySession = {};
  for (const event of readJsonl(path.join(factory, "usage-log.jsonl"))) (bySession[event.session_id] ??= []).push(event);
  const events = [];
  for (const list of Object.values(bySession)) {
    list.sort((a, b) => a.ts.localeCompare(b.ts));
    for (let i = list.length - 1; i >= 0; i--) list[i].taskId ??= list[i + 1]?.taskId;
    // step.mjs can be wired twice (project and user settings); keep one of each pair.
    events.push(...list.filter((event, i) => event.taskId === taskId && !(i && rowKey(list[i - 1]) === rowKey(event) && Date.parse(event.ts) - Date.parse(list[i - 1].ts) < 2000)));
  }
  return { events, bySession };
}

function stepAt(sessionEvents, timestamp, taskId) {
  let active;
  for (const event of sessionEvents) {
    if (event.ts > timestamp) break;
    active = event;
  }
  return active?.taskId === taskId ? rowKey(active) : undefined;
}

function measureTask(taskId) {
  const { events, bySession } = eventsFor(taskId);
  const rows = {};
  for (const sessionId of new Set(events.map(event => event.session_id))) {
    const sessionEvents = bySession[sessionId];
    const transcript = sessionEvents.find(event => event.transcript_path)?.transcript_path;
    if (!transcript) continue;
    measure(readJsonl(transcript), entry => stepAt(sessionEvents, entry.timestamp, taskId), rows);

    const agentsDir = path.join(path.dirname(transcript), sessionId, "subagents");
    if (!existsSync(agentsDir)) continue;
    const agents = readdirSync(agentsDir).filter(file => file.endsWith(".meta.json")).map(file => ({
      meta: readJson(path.join(agentsDir, file)),
      entries: readJsonl(path.join(agentsDir, file.replace(".meta.json", ".jsonl"))),
    }));
    // Where each Agent call was made, in the main transcript or a parent agent's.
    const spawnedAt = {};
    for (const entries of [readJsonl(transcript), ...agents.map(agent => agent.entries)]) {
      for (const entry of entries) {
        const content = entry.type === "assistant" ? entry.message?.content : undefined;
        if (Array.isArray(content)) for (const part of content) if (part.type === "tool_use") spawnedAt[part.id] = entry.timestamp;
      }
    }
    for (const { meta, entries } of agents) {
      const key = spawnedAt[meta.toolUseId] && stepAt(sessionEvents, spawnedAt[meta.toolUseId], taskId);
      if (!key) continue;
      const own = measure(entries, () => meta.agentType, {})[meta.agentType] ?? { ms: 0, tokens: 0 };
      rows[key] ??= { ms: 0, tokens: 0 };
      rows[key].tokens += own.tokens;
      const agent = ((rows[key].agents ??= {})[meta.agentType] ??= { ms: 0, tokens: 0 });
      agent.ms += own.ms;
      agent.tokens += own.tokens;
    }
  }
  return rows;
}

// Shreds from plan.md: "### S-n <title>" sections with their Estimate and Size fields.
function shredsOf(taskId) {
  const planPath = path.join(factory, taskId, "plan.md");
  if (!existsSync(planPath)) return [];
  return readFileSync(planPath, "utf8").split(/^### (?=S-\d+)/m).slice(1).map(section => {
    const estimate = section.match(/\*\*Estimate\*\*\s*—\s*~?(\d+)\s*min\s*·\s*~?(\d+)k tokens/);
    const commits = section.match(/\*\*Size\*\*\s*—\s*(\d+)\s*commits?/);
    return {
      id: section.match(/^S-\d+/)[0],
      pr: !/\(no PR\)/.test(section.split("\n")[0]),
      estMin: estimate ? Number(estimate[1]) : undefined,
      estTokens: estimate ? Number(estimate[2]) * 1000 : undefined,
      commits: commits ? Number(commits[1]) : undefined,
    };
  });
}

function history(excludeTaskId) {
  const sums = {};
  let buildMin = 0, buildTokens = 0, buildCommits = 0;
  if (existsSync(factory)) {
    for (const dir of readdirSync(factory)) {
      if (dir === excludeTaskId) continue;
      for (const row of readJson(path.join(factory, dir, "usage.json"))?.rows ?? []) {
        if (!row.tokens) continue;
        const sum = (sums[row.step] ??= { min: 0, tokens: 0, n: 0 });
        sum.min += row.min;
        sum.tokens += row.tokens;
        sum.n++;
        if (row.step === "build" && row.commits) {
          buildMin += row.min;
          buildTokens += row.tokens;
          buildCommits += row.commits;
        }
      }
    }
  }
  const steps = Object.fromEntries(Object.entries(sums).map(([step, s]) => [step, { min: Math.round(s.min / s.n), tokens: Math.round(s.tokens / s.n), runs: s.n }]));
  const perCommit = buildCommits ? { min: +(buildMin / buildCommits).toFixed(1), tokens: Math.round(buildTokens / buildCommits), commits: buildCommits } : undefined;
  return { steps, perCommit };
}

function report(taskId) {
  const usagePath = path.join(factory, taskId, "usage.json");
  const previous = Object.fromEntries((readJson(usagePath)?.rows ?? []).map(row => [row.key, row]));
  const measured = measureTask(taskId);
  const shreds = shredsOf(taskId);
  const past = history(taskId);

  const keys = ["hyperspace", "define-intent", "yoda-architect", ...shreds.filter(s => s.pr).flatMap(s => [`build ${s.id}`, `ship ${s.id}`])];
  for (const key of Object.keys(measured)) if (!keys.includes(key)) keys.push(key);

  const rows = keys.filter(key => key !== "hyperspace" || measured[key]).map(key => {
    const [step, shredId] = key.split(" ");
    const shred = shreds.find(s => s.id === shredId);
    const old = previous[key] ?? {};
    const guess = step === "build" ? { min: shred?.estMin, tokens: shred?.estTokens } : past.steps[step];
    const now = measured[key] ?? { ms: 0, tokens: 0 };
    return {
      key, step, shred: shredId, commits: shred?.commits,
      estMin: old.estMin ?? guess?.min, estTokens: old.estTokens ?? guess?.tokens,
      min: Math.round(now.ms / 60000), tokens: now.tokens,
      agents: Object.fromEntries(Object.entries(now.agents ?? {}).map(([type, a]) => [type, { min: Math.round(a.ms / 60000), tokens: a.tokens }])),
    };
  });
  writeFileSync(usagePath, JSON.stringify({ taskId, updated: new Date().toISOString(), rows }, null, 2) + "\n");
  return rows;
}

const k = n => (n === undefined ? "" : `${Math.round(n / 1000)}k`);
const delta = (est, actual) => (est && actual ? `${actual >= est ? "+" : ""}${Math.round(((actual - est) / est) * 100)}%` : "");

function print(taskId, rows) {
  const lines = [[taskId, "Est. min", "Min", "Est. tokens", "Tokens", "Δ tokens"]];
  const total = { estMin: 0, min: 0, estTokens: 0, tokens: 0 };
  for (const row of rows) {
    lines.push([row.key, row.estMin ?? "", row.tokens ? row.min : "", k(row.estTokens), row.tokens ? k(row.tokens) : "", delta(row.estTokens, row.tokens)]);
    for (const [type, a] of Object.entries(row.agents)) lines.push([`  ${type}`, "", a.min, "", k(a.tokens), ""]);
    for (const field of Object.keys(total)) total[field] += row[field] ?? 0;
  }
  lines.push(["Total", total.estMin || "", total.min, k(total.estTokens || undefined), k(total.tokens), delta(total.estTokens, total.tokens)]);
  const widths = lines[0].map((_, i) => Math.max(...lines.map(line => String(line[i]).length)));
  console.log(lines.map(line => line.map((cell, i) => String(cell).padEnd(widths[i])).join("  ").trimEnd()).join("\n"));
}

const [command, taskId] = process.argv.slice(2);
if (command === "report" && taskId && existsSync(path.join(factory, taskId))) {
  print(taskId, report(taskId));
} else if (command === "history") {
  console.log(JSON.stringify(history(), null, 2));
} else {
  process.stderr.write("Usage: usage.mjs report <taskId> | history\n");
  process.exit(1);
}
