import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { expectedDocuments } from './render.mjs';

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
  const b = JSON.parse(read('docs/plan/backlog.json'));
  const tasks = b.tasks, byId = new Map(tasks.map(t => [t.id, t]));
  requireCheck(b.branch === 'main', 'Plan must target main');
  requireCheck(tasks.length === 75 && byId.size === 75, 'Expected 75 unique tasks');
  const required = ['title', 'scope', 'contract', 'tests', 'acceptance', 'out_of_scope'];
  const statuses = new Set(['PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFIED', 'ACCEPTED', 'BLOCKED']);
  const counts = { BASE: 3, CORE: 16, BE: 26, FE: 21, QA: 9 };
  for (const [prefix, count] of Object.entries(counts)) {
    for (let n = 1; n <= count; n++) requireCheck(byId.has(`${prefix}-${String(n).padStart(2, '0')}`), `Missing ${prefix}-${n}`);
  }
  for (const t of tasks) {
    requireCheck(/^(BASE|CORE|BE|FE|QA)-\d{2}$/.test(t.id), `Invalid task ID: ${t.id}`);
    requireCheck(/^P[0-9]$/.test(t.phase), `Invalid phase: ${t.id}`);
    for (const k of required) requireCheck(typeof t[k] === 'string' && t[k].trim(), `${t.id}: empty ${k}`);
    requireCheck(statuses.has(t.status), `${t.id}: invalid status`);
    assert(Array.isArray(t.dependencies) && Array.isArray(t.screens), `${t.id}: invalid dependencies/screens`);
    requireCheck(new Set(t.dependencies).size === t.dependencies.length, `${t.id}: repeated dependency`);
    for (const d of t.dependencies) requireCheck(d !== t.id && byId.has(d), `${t.id}: invalid dependency ${d}`);
    for (const s of t.screens) requireCheck(/^W(0[1-9]|1[0-9]|2[0-7])$/.test(s), `${t.id}: invalid screen ${s}`);
    if (['VERIFIED', 'ACCEPTED'].includes(t.status)) {
      requireCheck(exists(`docs/evidence/${t.id.toLowerCase()}.md`), `${t.id}: missing execution evidence`);
      for (const d of t.dependencies) requireCheck(['VERIFIED','ACCEPTED'].includes(byId.get(d)?.status), `${t.id}: unfinished dependency ${d}`);
    }
  }
  const visiting = new Set(), done = new Set();
  function visit(id) {
    if (done.has(id) || !byId.has(id)) return;
    if (visiting.has(id)) { errors.push(`Dependency cycle: ${id}`); return; }
    visiting.add(id);
    for (const d of byId.get(id).dependencies) visit(d);
    visiting.delete(id); done.add(id);
  }
  for (const t of tasks) visit(t.id);
  const ancestors = new Set();
  function collect(id) { if (ancestors.has(id) || !byId.has(id)) return; ancestors.add(id); byId.get(id).dependencies.forEach(collect); }
  collect('QA-09');
  requireCheck(ancestors.size === 75, 'Tasks disconnected from final acceptance');
  const screens = new Set(tasks.flatMap(t => t.screens));
  requireCheck(screens.size === 27, `Expected 27 covered screens, got ${screens.size}`);
  const trace = read('docs/plan/08-sources-and-traceability.md');
  for (let n = 1; n <= 14; n++) requireCheck(trace.includes(`| R${String(n).padStart(2, '0')} |`), `Missing requirement R${n}`);
  for (const [file, expected] of expectedDocuments()) requireCheck(fs.existsSync(file) && fs.readFileSync(file, 'utf8') === expected, `Generated document drift: ${path.relative(root,file)}`);
  const cleanup = JSON.parse(read('docs/status/cleanup-manifest.json'));
  const fe01Started = byId.get('FE-01')?.status !== 'PLANNED';
  const fe01Recreated = new Set(['apps/web/index.html', 'apps/web/vite.config.ts']);
  for (const item of cleanup.deleted) {
    // BASE-01 records the retired blobs; FE-01 creates a new executable web harness at these paths.
    if (fe01Started && fe01Recreated.has(item.path)) continue;
    requireCheck(!exists(item.path), `Retired file remains: ${item.path}`);
  }
  for (const f of ['README.md', 'AGENTS.md', 'docs/plan/07-codex-execution-playbook.md']) {
    const text = read(f);
    requireCheck(!/git\s+(checkout\s+-b|switch\s+-c)|HEAD:feat\/|새 작업 브랜치는/.test(text), `Obsolete branch instructions: ${f}`);
  }
  const files = [path.join(root,'README.md'),path.join(root,'AGENTS.md'),...markdownFiles(path.join(root,'docs')),path.join(root,'design-system/README.md')];
  let checkedLinks = 0;
  for (const file of files) {
    // Ignore examples in fenced code. Check file targets, not GitHub's heading-slug algorithm.
    const text = fs.readFileSync(file,'utf8').replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '');
    for (const m of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const target = m[1].trim().split(/\s+["']/)[0].replace(/^<|>$/g,'');
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const clean = decodeURIComponent(target.split('#')[0].split('?')[0]);
      if (!clean) continue;
      const p = clean.startsWith('/') ? path.join(root,clean.slice(1)) : path.resolve(path.dirname(file),clean);
      requireCheck(p === root || p.startsWith(root + path.sep), `Link escapes repository: ${file}: ${target}`);
      requireCheck(fs.existsSync(p), `Broken link: ${path.relative(root,file)} -> ${target}`);
      checkedLinks++;
    }
  }
  const ready = tasks.filter(t => t.status === 'PLANNED' && t.dependencies.every(d => ['VERIFIED','ACCEPTED'].includes(byId.get(d)?.status))).map(t => t.id);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({status:'PASS',tasks:tasks.length,screenCoverage:screens.size,requirements:14,checkedLocalLinks:checkedLinks,readyTasks:ready,scope:'plan/docs only; not product tests'},null,2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
