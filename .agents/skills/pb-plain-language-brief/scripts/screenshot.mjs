#!/usr/bin/env node
// PB - Plain-Language Brief: screenshot of one screen of a local HTML mockup with headless Chrome.
// Usage: node screenshot.mjs --html <mockup.html> --out <file.png> [--hash <screen>] [--width 1100] [--height 1500]
//        [--strip <regex>]   (default strips the mockups' guided-tour autostart so it does not cover the screen)
// Chrome binary: $CHROME, else google-chrome, chromium, chromium-browser.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const a = process.argv.slice(2); const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const html = opt('--html'), out = opt('--out');
if (!html || !out) { console.error('usage: screenshot.mjs --html <file> --out <png> [--hash x] [--width n] [--height n] [--strip regex]'); process.exit(2); }
const strip = new RegExp(opt('--strip', 'if\\(!seen\\(\\)\\)setTimeout\\(start,\\d+\\);'), 'g');
const chrome = [process.env.CHROME, 'google-chrome', 'chromium', 'chromium-browser'].filter(Boolean)
  .find(c => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0);
if (!chrome) { console.error('Chrome/Chromium not found; set CHROME=/path/to/chrome'); process.exit(1); }
const src = path.resolve(html); const tmp = path.join(path.dirname(src), `.pb-shot-${process.pid}-${path.basename(src)}`);
fs.writeFileSync(tmp, fs.readFileSync(src, 'utf8').replace(strip, ''));
try {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${opt('--width', '1100')},${opt('--height', '1500')}`, '--virtual-time-budget=3000',
    `--screenshot=${path.resolve(out)}`, `file://${tmp}${opt('--hash') ? '#' + opt('--hash') : ''}`], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(out)) { console.error(r.stderr); process.exit(1); }
  console.log(`screenshot: ${out}`);
} finally { fs.rmSync(tmp, { force: true }); }
