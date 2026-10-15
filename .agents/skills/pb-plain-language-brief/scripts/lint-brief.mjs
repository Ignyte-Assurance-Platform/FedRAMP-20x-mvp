#!/usr/bin/env node
// PB - Plain-Language Brief: fails a brief that a non-technical reader could not follow on its own.
// Usage: node lint-brief.mjs <brief.md> [...] [--glossary <glossary.md>] [--banned word1,word2]
// Checks: required sections; banned technical words and shorthand symbols (unless the word is defined in
// "Words used in this document"); glossary terms used but not defined; screenshot files exist; long points.
import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); const opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const glossaryArg = opt('--glossary'); const extraBanned = (opt('--banned') ?? '').split(',').filter(Boolean);
const BANNED = ['database', 'db', 'token', 'bucket', 'server', 'backend', 'frontend', 'api', 'endpoint', 'deploy', 'deployment',
  'repository', 'repo', 'cache', 'schema', 'json', 'query', 'payload', 'webhook', 'oauth', 'sso', 'url', 'ui', 'ux', 'ci', 'sdk',
  'postgres', 'react', 'typescript', 'docker', 'container', 'migration', 'script', 'hash', 'regex', 'parser', 'pipeline', 'llm',
  'vertex', 'github', 'sha', 'crud', 'backlog', 'spec', 'adr', 'gate', 'ajv', 'valibot', 'drizzle', ...extraBanned];
const REQUIRED = ['why you are getting this', 'words used in this document', 'what this is', 'what we will build',
  'not in this first version', 'questions for you', 'how to answer', 'coverage'];
const SKIP_LINT = ['coverage', 'related', 'table of contents'];
let failed = false;
const fm = t => Object.fromEntries((t.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '').split('\n')
  .map(l => l.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const sections = body => { const out = {}; let cur = '_'; for (const l of body.split('\n')) { const h = l.match(/^## (?:\d+\.\s*)?(.+)$/); if (h) { cur = h[1].trim().toLowerCase(); out[cur] = ''; } else out[cur] = (out[cur] ?? '') + l + '\n'; } return out; };
const tableCol0 = txt => txt.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1).map(l => l.split('|')[1]?.trim()).filter(Boolean);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const file of args) {
  const text = fs.readFileSync(file, 'utf8'); const meta = fm(text); const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const secs = sections(body); const errs = [], warns = [];
  for (const r of REQUIRED) if (!(r in secs)) errs.push(`missing section "${r}"`);
  if (!('what it looks like' in secs)) warns.push('no "What it looks like" section: add screenshots for every screen discussed');
  for (const k of ['audience', 'export_name']) if (!meta[k]) errs.push(`front-matter "${k}" missing`);
  const words = secs['words used in this document'] ?? '';
  const rows = words.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1);
  for (const r of rows) if (r.split('|').slice(1, -1).some(c => !c.trim())) errs.push(`"Words used" row has an empty cell: ${r.slice(0, 60)}`);
  const defined = tableCol0(words).map(w => w.toLowerCase().replace(/["“”']/g, ''));
  const isDefined = w => defined.some(d => d.includes(w.toLowerCase()));
  const lintText = Object.entries(secs).filter(([k]) => !SKIP_LINT.includes(k) && k !== 'words used in this document').map(([, v]) => v).join('\n');
  const prose = lintText.replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ');
  for (const w of BANNED) { const re = new RegExp(`\\b${esc(w)}\\b`, 'i'); if (re.test(prose) && !isDefined(w)) errs.push(`technical word "${w}" used but not defined in "Words used"`); }
  const unquoted = prose.replace(/"[^"\n]*"|“[^”\n]*”/g, ' '); // exact on-screen labels in quotes may contain symbols
  for (const [sym, name] of [['→', 'arrow'], ['←', 'arrow'], ['↔', 'arrow'], ['⇒', 'arrow'], ['->', 'arrow'], ['=>', 'arrow'], ['`', 'code mark'], ['{', 'brace'], ['}', 'brace'], [' & ', 'ampersand'], [' + ', 'plus sign']])
    if (unquoted.includes(sym)) errs.push(`shorthand symbol "${sym.trim()}" (${name}): write the words`);
  if (/\[\[[^\]]+\]\]/.test(prose)) errs.push('wiki link in the reader-facing text: name the thing in words (links belong in Related)');
  if (/\b[a-z]+\/[a-z]+\b/i.test(unquoted.replace(/\b\d+\s*\/\s*\d+\b/g, ''))) warns.push('word/word slash found: write "or"/"and"');
  const gloss = glossaryArg ?? path.join(path.dirname(file), `${meta.project}-plain-glossary.md`);
  if (fs.existsSync(gloss)) for (const term of tableCol0(fs.readFileSync(gloss, 'utf8'))) {
    const t = term.replace(/["“”']/g, ''); if (t.length < 3) continue;
    if (new RegExp(`\\b${esc(t)}\\b`, 'i').test(prose) && !isDefined(t)) errs.push(`glossary term "${t}" used but not defined in "Words used"`);
  } else warns.push(`glossary not found: ${gloss}`);
  for (const m of body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) if (!/^https?:/.test(m[1]) && !fs.existsSync(path.join(path.dirname(file), m[1]))) errs.push(`screenshot missing: ${m[1]}`);
  for (const item of (secs['what we will build'] ?? '').split('\n').filter(l => /^\d+\.\s/.test(l)))
    if ((item.replace(/^\d+\.\s/, '').replace(/"[^"]*"/g, 'X').replace(/\b(e\.g|i\.e|etc)\./g, '').match(/[.!?](\s|$)/g) ?? []).length > 2) warns.push(`point longer than two sentences: ${item.slice(0, 70)}…`);
  console.log(`${errs.length ? 'FAIL' : 'ok  '} ${file}`);
  for (const e of errs) console.log(`  error  ${e}`); for (const w of warns) console.log(`  warn   ${w}`);
  if (errs.length) failed = true;
}
process.exit(failed ? 1 : 0);
