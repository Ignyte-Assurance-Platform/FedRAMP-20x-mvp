#!/usr/bin/env node
// PB - Plain-Language Brief: exports briefs to Word review copies.
// Usage: node export-docx.mjs --out <folder> [--author "<name>"] <brief.md> [...]
// Output: <export_name>__REVIEW_<audience>.docx. Removes front-matter, table of contents, Coverage and Related;
// strips heading numbers; wiki links become note titles; Mermaid becomes images (mmdc); adds a decision box.
// pandoc: $PANDOC or `pandoc` on PATH.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2); const opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const outDir = opt('--out'); const author = opt('--author');
if (!outDir || !args.length) { console.error('usage: export-docx.mjs --out <folder> [--author name] <brief.md> [...]'); process.exit(2); }
const pandoc = process.env.PANDOC || 'pandoc';
if (spawnSync(pandoc, ['--version']).status !== 0) { console.error('pandoc not found: install it (tooling/README.md) or set PANDOC'); process.exit(1); }
const fmOf = t => Object.fromEntries((t.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '').split('\n')
  .map(l => l.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
let root = path.resolve(args[0]); while (root !== '/' && !fs.existsSync(path.join(root, 'pb.config.yaml'))) root = path.dirname(root);
const titles = {}; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (e.name.startsWith('.') || e.name === 'node_modules') continue; const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) { const f = fmOf(fs.readFileSync(p, 'utf8')); if (f.id) titles[f.id] = f.title ?? f.id; } } };
walk(root);
const q = v => `'${String(v).replace(/'/g, "''")}'`;
const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-brief-'));
fs.mkdirSync(outDir, { recursive: true });
for (const file of args) {
  const text = fs.readFileSync(file, 'utf8'); const fm = fmOf(text);
  let body = text.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^# .*\n/m, '');
  body = body.replace(/^## (?:\d+\.\s*)?(Table of Contents|Coverage|Related)\n[\s\S]*?(?=^## |(?![\s\S]))/gm, '');
  body = body.replace(/^## \d+\.\s*/gm, '## ');
  let n = 0;
  body = body.replace(/```mermaid\n([\s\S]*?)```\n/g, (_, src) => { const base = path.join(tmp, `${fm.id}-${++n}`);
    fs.writeFileSync(`${base}.mmd`, src); const r = spawnSync('mmdc', ['-i', `${base}.mmd`, '-o', `${base}.png`, '-s', '2', '-b', 'white']);
    return r.status === 0 ? `![](${base}.png){width=6in}\n` : '```\n' + src + '```\n'; });
  body = body.replace(/\[\[([a-z0-9-]+)\]\]/g, (_, id) => titles[id] ?? id);
  body = body.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, p) => /^https?:|^\//.test(p) ? m : `![${alt}](${path.resolve(path.dirname(file), p)}){width=6in}`);
  const who = fm.audience ?? 'reviewer';
  const subtitle = `For ${who} · prepared by ${author ?? fm.owner ?? ''} · ${date}${fm.reading_time ? ` · about ${fm.reading_time}` : ''}`;
  const md = `---\ntitle: ${q(fm.title)}\nsubtitle: ${q(subtitle)}\n---\n\n${body}\n\n## Your decision\n\n☐ OK as is   ☐ OK with my changes (see my comments)   ☐ Let's talk first\n\n**Name:** ______________________   **Date:** ____________\n`;
  const src = path.join(tmp, `${fm.id}.md`); fs.writeFileSync(src, md);
  const out = path.join(outDir, `${fm.export_name ?? fm.id}__REVIEW_${who}.docx`);
  const r = spawnSync(pandoc, ['-f', 'markdown-implicit_figures', '-t', 'docx', '-o', out, src], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  console.log(out);
}
