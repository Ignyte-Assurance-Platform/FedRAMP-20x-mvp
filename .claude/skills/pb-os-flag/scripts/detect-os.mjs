#!/usr/bin/env node
// PB - OS Flag: which workstation is this, and which flag do its commits carry?
// Zero dependencies. Prints one JSON object: {"os","host","flag","marker"}.
// Usage: node detect-os.mjs [--flags windows=LP-OS,wsl=,linux=,macos=] [--project-md <path>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_FLAGS = { windows: "LP-OS", wsl: "", linux: "", macos: "" };

export function detectOs(platform = process.platform, procVersion = readProcVersion()) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  if (platform === "linux" && /microsoft/i.test(procVersion)) return "wsl";
  return "linux";
}

function readProcVersion() {
  try {
    return fs.readFileSync("/proc/version", "utf8");
  } catch {
    return "";
  }
}

/** Reads the `flags:` block of a project.md: the indented `key: value` lines right after `flags:`. */
export function flagsFromProjectMd(text) {
  const out = {};
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^flags:\s*(#.*)?$/.test(l));
  if (start < 0) return out;
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) break; // the block ends at the first unindented line
    const m = /^\s+([a-z]+):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!/^<.*>$/.test(value)) out[m[1]] = value;
  }
  return out;
}

function flagsFromArg(spec) {
  const out = {};
  for (const pair of spec.split(",")) {
    const [k, v = ""] = pair.split("=");
    if (k) out[k.trim()] = v.trim();
  }
  return out;
}

export function resolve({ flags = {}, platform, procVersion } = {}) {
  const detected = detectOs(platform, procVersion);
  const table = { ...DEFAULT_FLAGS, ...flags };
  const flag = (table[detected] ?? "").trim();
  return { os: detected, host: os.hostname(), flag, marker: flag ? `[${flag}]` : "" };
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pmArg = args.indexOf("--project-md");
  const projectMd = pmArg >= 0 ? args[pmArg + 1] : path.join(here, "..", "project.md");
  let flags = {};
  if (fs.existsSync(projectMd)) flags = flagsFromProjectMd(fs.readFileSync(projectMd, "utf8"));
  const fArg = args.indexOf("--flags");
  if (fArg >= 0) flags = { ...flags, ...flagsFromArg(args[fArg + 1] ?? "") };
  console.log(JSON.stringify(resolve({ flags })));
}
