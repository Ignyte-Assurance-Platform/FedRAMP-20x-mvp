#!/usr/bin/env node
// PB - OS Flag: the day's commits by the current git identity, flagged ones first.
// Usage: node standup.mjs [--since "<git date>"] [--marker "[LP-OS]"] [<repo-path> ...]
// Defaults: since "yesterday", marker from detect-os.mjs, repo = current directory.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const since = opt("--since", "yesterday");
const repos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--since" && args[i - 1] !== "--marker");
if (repos.length === 0) repos.push(process.cwd());

let marker = opt("--marker", "");
if (!marker) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = execFileSync(process.execPath, [path.join(here, "detect-os.mjs")], { encoding: "utf8" });
  marker = JSON.parse(out).marker;
}

function git(repo, ...a) {
  return execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

for (const repo of repos) {
  const dir = path.resolve(repo);
  let email;
  try {
    email = git(dir, "config", "user.email");
  } catch {
    console.log(`\n${dir}: not a git repo`);
    continue;
  }
  // Branches and remotes only (no rebase/filter-branch backups), and one line per rewritten commit.
  const seen = new Set();
  const lines = git(dir, "log", "--branches", "--remotes", `--since=${since}`, `--author=${email}`, "--format=%h%x09%ad%x09%D%x09%s", "--date=format:%Y-%m-%d %H:%M")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, date, refs, subject] = l.split("\t");
      const branch = (refs ?? "").split(",").map((r) => r.trim()).find((r) => r && !r.startsWith("HEAD") && !r.startsWith("tag:")) ?? "";
      return { sha, date, branch: branch.replace(/^origin\//, ""), subject };
    })
    .filter((c) => {
      const key = `${c.date.slice(0, 10)}\u0000${c.subject}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const flagged = marker ? lines.filter((c) => c.subject.includes(marker)) : [];
  const other = lines.filter((c) => !flagged.includes(c));
  console.log(`\n${path.basename(dir)} · ${email} · since ${since}`);
  const print = (title, list) => {
    console.log(`  ${title}: ${list.length}`);
    for (const c of list) console.log(`    ${c.date}  ${c.sha}  ${c.subject}${c.branch ? `  (${c.branch})` : ""}`);
  };
  if (marker) print(`flagged ${marker}`, flagged);
  print(marker ? "other machines / unflagged" : "all", other);
}
