import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Lightweight documentation guard (ADR 0014): local links resolve, retired files stay gone,
// and no document tells an agent to work on a branch other than main.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const errors = [];
function requireCheck(condition, message) { if (!condition) errors.push(message); }
function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) return [];
    return e.isDirectory() ? markdownFiles(p) : e.name.endsWith('.md') ? [p] : [];
  });
}
try {
  requireCheck(exists('docs/plan/README.md'), 'Missing plan: docs/plan/README.md');
  requireCheck(exists('docs/status/project-state.md'), 'Missing status: docs/status/project-state.md');
  const cleanup = JSON.parse(read('docs/status/cleanup-manifest.json'));
  const recreated = new Set(['apps/web/index.html', 'apps/web/vite.config.ts']);
  for (const item of cleanup.deleted) {
    if (recreated.has(item.path)) continue;
    requireCheck(!exists(item.path), `Retired file remains: ${item.path}`);
  }
  for (const f of ['README.md', 'AGENTS.md', 'docs/plan/README.md']) {
    requireCheck(!/git\s+(checkout\s+-b|switch\s+-c)|HEAD:feat\/|새 작업 브랜치는/.test(read(f)), `Obsolete branch instructions: ${f}`);
  }
  const files = [path.join(root, 'README.md'), path.join(root, 'AGENTS.md'), ...markdownFiles(path.join(root, 'docs')), path.join(root, 'db/README.md'), path.join(root, 'design-system/README.md')];
  let checkedLinks = 0;
  for (const file of files) {
    // Ignore examples in fenced code. Check file targets, not GitHub's heading-slug algorithm.
    const text = fs.readFileSync(file, 'utf8').replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '');
    for (const m of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const target = m[1].trim().split(/\s+["']/)[0].replace(/^<|>$/g, '');
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const clean = decodeURIComponent(target.split('#')[0].split('?')[0]);
      if (!clean) continue;
      const p = clean.startsWith('/') ? path.join(root, clean.slice(1)) : path.resolve(path.dirname(file), clean);
      requireCheck(p === root || p.startsWith(root + path.sep), `Link escapes repository: ${path.relative(root, file)}: ${target}`);
      requireCheck(fs.existsSync(p), `Broken link: ${path.relative(root, file)} -> ${target}`);
      checkedLinks++;
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ status: 'PASS', checkedLocalLinks: checkedLinks, scope: 'docs links and guards only; not product tests' }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
