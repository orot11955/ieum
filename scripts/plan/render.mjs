import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = path.join(root, 'docs/plan');
const sections = {
  BASE: '07-codex-execution-playbook.md', CORE: '02-core-plan.md',
  BE: '03-backend-plan.md', FE: '04-web-plan.md', QA: '06-testing-and-release-gates.md',
};
function card(t) {
  const lines = [
    `### ${t.id} · ${t.title}`, '',
    `**구간:** ${t.phase} · **상태:** ${t.status} · **선행:** ${t.dependencies.join(', ') || '없음'}`, '',
  ];
  if (t.screens.length) lines.push(`**화면:** ${t.screens.join(', ')}`, '');
  for (const [label, field] of [
    ['구현 범위', 'scope'], ['입출력·데이터·코드 계약', 'contract'],
    ['필수 반례·검증', 'tests'], ['완료 기준', 'acceptance'], ['이번 카드 제외', 'out_of_scope'],
  ]) lines.push(`**${label}:** ${t[field]}`, '');
  lines.push('**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, ' +
    '실패·미검증 범위와 `docs/evidence/' + t.id.toLowerCase() + '.md`. 테스트 작성과 실제 실행을 구분한다.', '');
  return lines.join('\n');
}
export function expectedDocuments() {
  const b = JSON.parse(fs.readFileSync(path.join(plan, 'backlog.json'), 'utf8'));
  const outputs = new Map();
  for (const [prefix, name] of Object.entries(sections)) {
    const file = path.join(plan, name), text = fs.readFileSync(file, 'utf8');
    const start = `<!-- GENERATED:TASKS:${prefix}:START -->`, end = `<!-- GENERATED:TASKS:${prefix}:END -->`;
    if (text.split(start).length !== 2 || text.split(end).length !== 2) throw new Error(`Invalid markers: ${name}`);
    const i = text.indexOf(start), j = text.indexOf(end);
    if (j < i) throw new Error(`Reversed markers: ${name}`);
    const content = b.tasks.filter(t => t.id.startsWith(prefix + '-')).map(card).join('\n');
    outputs.set(file, text.slice(0, i + start.length) + '\n\n' + content + '\n' + text.slice(j));
  }
  const lines = ['# 작업 인덱스 · 자동 생성', '',
    '정본은 [backlog.json](backlog.json)이다. `node scripts/plan/render.mjs`로 갱신한다.', '',
    '| ID | 구간 | 상태 | 기능 | 선행 |', '|---|---|---|---|---|',
    ...b.tasks.map(t => `| ${t.id} | ${t.phase} | ${t.status} | ${t.title.replaceAll('|', '\\|')} | ${t.dependencies.join(', ') || '없음'} |`), ''];
  outputs.set(path.join(plan, 'task-index.md'), lines.join('\n'));
  return outputs;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const check = process.argv.includes('--check');
    let changed = 0;
    for (const [file, expected] of expectedDocuments()) {
      const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (actual === expected) continue;
      changed++;
      if (check) console.error(`Generated document differs: ${path.relative(root, file)}`);
      else fs.writeFileSync(file, expected);
    }
    if (check && changed) process.exitCode = 1;
    else console.log(check ? 'Plan rendering: PASS' : `Plan rendering: updated ${changed} files`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
