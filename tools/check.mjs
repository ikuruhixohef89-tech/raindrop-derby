// Static checks against GAME_BRIEF.md. Node built-ins only. Exit code 1 on any violation.
// Runtime = index.html + src/** (content rules). vendor/three.min.js is third-party code: only counted for weight and preloads.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_BYTES = 1400 * 1024; // brief asks for under 2-3 MB total; this is our own tighter limit
const SKIP_DIRS = new Set(['.git', 'node_modules', 'out']);
const UPPERCASE_OK = new Set(['README.md', 'LICENSE']);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico|mp3|wav|ogg|m4a|flac|mp4|webm|mov|ttf|otf|woff2?|eot)$/i;
const TEXT_EXT = /\.(html|js|mjs|css|json|svg)$/i;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
const all = walk(ROOT);
const own = all.filter(f => {
  const r = rel(f);
  return r === 'index.html' || r.startsWith('src/');
});
const runtime = own.concat(all.filter(f => rel(f) === 'vendor/three.min.js'));

const RULES = [
  { name: 'external URL', re: /https?:\/\/(?!www\.w3\.org\/2000\/svg)/gi },
  { name: 'root-absolute path', re: /(?:src|href)\s*=\s*["']\/(?!\/)|from\s+["']\/|import\(\s*["']\/|url\(\s*["']?\/(?!\/)/g },
  { name: 'network API', re: /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|sendBeacon|EventSource/g },
  { name: 'cookie', re: /document\.cookie/g },
  { name: 'console.log', re: /console\.log\s*\(/g },
  { name: 'bare "three" import (needs an import map)', re: /from\s+['"]three['"]/g },
  { name: 'Cyrillic text', re: /[Ѐ-ӿ]/g },
  { name: 'channel characters', re: /\b(?:Vince|Byte)\b/g },
  { name: 'pointer cursor (pointing finger)', re: /cursor\s*:\s*pointer/g },
];

const problems = [];

for (const f of own) {
  const r = rel(f);
  if (BINARY_EXT.test(r)) {
    problems.push(`${r}: binary asset in runtime`);
    continue;
  }
  if (!TEXT_EXT.test(r)) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  for (const rule of RULES) {
    lines.forEach((line, i) => {
      rule.re.lastIndex = 0;
      if (rule.re.test(line)) problems.push(`${r}:${i + 1}: ${rule.name}: ${line.trim().slice(0, 100)}`);
    });
  }
}

// File names: lowercase only (GitHub Pages is case-sensitive).
for (const f of all) {
  const r = rel(f);
  if (UPPERCASE_OK.has(r) || r.startsWith('vendor/LICENSE')) continue;
  if (r !== r.toLowerCase()) problems.push(`${r}: uppercase letters in path`);
  if (/\s/.test(path.basename(r))) problems.push(`${r}: whitespace in file name`);
}

// Every module the game loads must be preloaded in index.html.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const preloaded = new Set([...html.matchAll(/rel="modulepreload"\s+href="\.\/([^"]+)"/g)].map(m => m[1]));
const reachable = new Set();
const stack = ['src/main.js'];
const importRe = /(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
while (stack.length) {
  const r = stack.pop();
  if (reachable.has(r)) continue;
  reachable.add(r);
  const abs = path.join(ROOT, r);
  if (!fs.existsSync(abs) || r === 'vendor/three.min.js') continue;
  const text = fs.readFileSync(abs, 'utf8');
  for (const m of text.matchAll(importRe)) stack.push(rel(path.resolve(path.dirname(abs), m[1] || m[2])));
}
for (const r of reachable) if (!preloaded.has(r)) problems.push(`${r}: loaded by the game but missing <link rel="modulepreload">`);
for (const p of preloaded) {
  if (!fs.existsSync(path.join(ROOT, p))) problems.push(`index.html: modulepreload points to missing file ${p}`);
  else if (!reachable.has(p)) problems.push(`index.html: modulepreload of ${p}, which the game never imports`);
}
const unused = own.filter(f => f.endsWith('.js') && !reachable.has(rel(f))).map(rel);
if (unused.length) problems.push(`in src/ but never imported: ${unused.join(', ')}`);

// Relative imports must point at existing files, exact case.
for (const f of own.filter(x => x.endsWith('.js'))) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(f), m[1]);
    const dir = path.dirname(target);
    if (!(fs.existsSync(dir) && fs.readdirSync(dir).includes(path.basename(target)))) {
      problems.push(`${rel(f)}: import not found or wrong case: ${m[1]}`);
    }
  }
}

let total = 0;
const sizes = runtime.map(f => {
  const b = fs.statSync(f).size;
  total += b;
  return [rel(f), b];
});
sizes.sort((a, b) => b[1] - a[1]);
console.log('Runtime files (bytes):');
for (const [r, b] of sizes) console.log(`  ${String(b).padStart(7)}  ${r}`);
console.log(`  ${String(total).padStart(7)}  TOTAL (${(total / 1024).toFixed(1)} KB of ${BUDGET_BYTES / 1024} KB budget)`);
if (total > BUDGET_BYTES) problems.push(`runtime weight ${total} B exceeds ${BUDGET_BYTES} B`);

if (problems.length) {
  console.log(`\nFAIL: ${problems.length} problem(s)`);
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else {
  console.log(`\nOK: ${runtime.length} runtime files, ${RULES.length} content rules, names, preloads, imports, weight.`);
}
