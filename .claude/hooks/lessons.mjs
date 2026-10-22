// The repo-wide lessons file: every real hole the reviewers found, so later builds avoid it.
//
// Usage, from /build after its review + fix loop:
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/lessons.mjs" record .factory/lessons-inbox.json
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/lessons.mjs" render
//
// .factory/lessons.json is the source of truth; .factory/lessons.md is rendered from it on every
// write and is what the builder reads (lessons-gate.mjs makes sure it does).
//
// The inbox is a JSON array of findings:
//   { "lesson": "L-3" | null, "rule", "category", "reviewer", "severity", "paths": [globs],
//     "taskId", "shred", "at": "path:line" }
// Duplicates are merged three ways: inside the batch (same at + same rule), against the file
// (a null lesson whose normalised rule equals an existing one), and per occurrence (the same
// taskId + shred + at is never counted twice, so a retried run is a no-op).
//
// Exit 0 on success, after deleting the inbox (no step's guard may rm it); exit 2 with the
// reason otherwise — nothing is written and the inbox stays, on a failure.

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const jsonPath = path.join(root, ".factory", "lessons.json");
const mdPath = path.join(root, ".factory", "lessons.md");

function fail(reason) {
  process.stderr.write(`[lessons] ${reason}\n`);
  process.exit(2);
}

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Cannot read ${what} ${file}: ${error.message}`);
  }
}

function writeAtomically(file, content) {
  writeFileSync(`${file}.tmp`, content);
  renameSync(`${file}.tmp`, file);
}

const normalise = rule => rule.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
const lastSeen = lesson => lesson.occurrences.reduce((latest, o) => (o.date > latest ? o.date : latest), "");
const idNumber = id => Number(id.slice(2));

function loadLessons() {
  if (!existsSync(jsonPath)) return { version: 1, lessons: [] };
  const data = readJson(jsonPath, "lessons");
  if (!Array.isArray(data.lessons)) fail(`${jsonPath} has no "lessons" array.`);
  return data;
}

function render(data) {
  const sorted = [...data.lessons].sort(
    (a, b) =>
      b.occurrences.length - a.occurrences.length ||
      lastSeen(b).localeCompare(lastSeen(a)) ||
      idNumber(a.id) - idNumber(b.id),
  );
  const lines = sorted.map(
    l =>
      `- **${l.id}** (seen ${l.occurrences.length}×, last ${lastSeen(l)}) — ${l.rule} · ` +
      `${l.paths.map(p => `\`${p}\``).join(", ") || "any path"} · ${l.category} · ${l.reviewer}`,
  );
  return [
    "# Lessons",
    "",
    "> Generated from `lessons.json` by `.claude/hooks/lessons.mjs` — do not edit by hand.",
    "> Each lesson is a hole an earlier build fell into. Read them all before building.",
    "",
    ...(lines.length ? lines : ["*(none yet)*"]),
    "",
  ].join("\n");
}

function validate(finding, index) {
  const where = `inbox[${index}]`;
  if (typeof finding !== "object" || finding === null) fail(`${where} is not an object.`);
  for (const field of ["rule", "category", "reviewer", "severity", "taskId", "shred", "at"]) {
    if (typeof finding[field] !== "string" || !finding[field].trim()) fail(`${where} has no "${field}".`);
  }
  if (!Array.isArray(finding.paths)) fail(`${where} has no "paths" array.`);
  if (finding.lesson != null && !/^L-\d+$/.test(finding.lesson)) fail(`${where} has a malformed lesson id "${finding.lesson}".`);
}

function record(inboxArg) {
  if (!inboxArg) fail("Usage: lessons.mjs record <inbox.json>");
  const inbox = readJson(path.resolve(root, inboxArg), "inbox");
  if (!Array.isArray(inbox)) fail("The inbox must be a JSON array of findings.");
  inbox.forEach(validate);

  const data = loadLessons();
  const byId = new Map(data.lessons.map(l => [l.id, l]));
  const byRule = new Map(data.lessons.map(l => [normalise(l.rule), l]));
  const unknown = inbox.filter(f => f.lesson != null && !byId.has(f.lesson)).map(f => f.lesson);
  if (unknown.length) fail(`Unknown lesson id(s): ${[...new Set(unknown)].join(", ")}. Nothing was recorded.`);

  const today = new Date().toISOString().slice(0, 10);
  let nextId = Math.max(0, ...data.lessons.map(l => idNumber(l.id))) + 1;
  const created = [];
  const bumped = new Map();
  let skipped = 0;
  const seenInBatch = new Set();

  for (const finding of inbox) {
    const batchKey = `${finding.at}|${normalise(finding.rule)}`;
    if (seenInBatch.has(batchKey)) {
      skipped++;
      continue;
    }
    seenInBatch.add(batchKey);

    let lesson = finding.lesson != null ? byId.get(finding.lesson) : byRule.get(normalise(finding.rule));
    const isNew = !lesson;
    if (isNew) {
      lesson = {
        id: `L-${nextId++}`,
        rule: finding.rule.trim(),
        category: finding.category,
        reviewer: finding.reviewer,
        severity: finding.severity,
        paths: [],
        occurrences: [],
      };
      data.lessons.push(lesson);
      byId.set(lesson.id, lesson);
      byRule.set(normalise(lesson.rule), lesson);
      created.push(lesson.id);
    }
    lesson.paths = [...new Set([...lesson.paths, ...finding.paths])];

    const already = lesson.occurrences.some(
      o => o.taskId === finding.taskId && o.shred === finding.shred && o.at === finding.at,
    );
    if (already) {
      skipped++;
      continue;
    }
    lesson.occurrences.push({ taskId: finding.taskId, shred: finding.shred, date: finding.date ?? today, at: finding.at });
    if (!isNew) bumped.set(lesson.id, lesson.occurrences.length);
  }

  writeAtomically(jsonPath, `${JSON.stringify(data, null, 2)}\n`);
  writeAtomically(mdPath, render(data));
  rmSync(path.resolve(root, inboxArg));

  const summary = [
    ...created.map(id => `created ${id}`),
    ...[...bumped].map(([id, count]) => `+1 ${id} (seen ${count}×)`),
    ...(skipped ? [`skipped ${skipped} duplicate${skipped > 1 ? "s" : ""}`] : []),
  ];
  process.stdout.write(`${summary.join(" · ") || "nothing to record"}\n`);
}

const [command, arg] = process.argv.slice(2);
if (command === "record") record(arg);
else if (command === "render") writeAtomically(mdPath, render(loadLessons()));
else fail("Usage: lessons.mjs record <inbox.json> | render");
