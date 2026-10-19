// Shared by guard.mjs and test-lock.mjs: reads policy.json and matches its globs.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const policyPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "policy.json");

const caseInsensitive = process.platform === "win32";

// Throws when policy.json is missing or malformed; callers turn that into a block.
export function readPolicy() {
  return JSON.parse(readFileSync(policyPath, "utf8"));
}

// "@tests" in a glob list stands for the policy's top-level testGlobs.
export function expandGlobs(globs, policy) {
  return (globs ?? []).flatMap(glob => (glob === "@tests" ? policy.testGlobs ?? [] : [glob]));
}

// **/ spans zero or more folders, ** spans anything, * stays within one, ? is one character.
export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        source += "(?:.*/)?";
        i++;
      } else {
        source += ".*";
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, caseInsensitive ? "i" : "");
}

// The first glob a project-relative, forward-slash path matches, or undefined.
export function matchingGlob(globs, relative) {
  return globs.find(glob => globToRegExp(glob).test(relative));
}
