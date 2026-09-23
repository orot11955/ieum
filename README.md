# IEUM · 이음

**생각·경험·외부 자료를 원본과 출처로 보존하고, 일정·할일·위키를 관리하며, 축적한 자료를 문서로 정제해 승인한 공개본을 API로 제공하는 개인 내부 관리 제품.** 외부 블로그 독자 화면은 별도다.

## 현재 상태 · 2026-09-23 KST

**main 단일 브랜치 · BASE-01–03과 CORE-01–09·14 검증 완료 · 다음 권장 카드 CORE-10.** 사용자가 병합한 다크 기준선 `f4ccbc2`에서 준비했다. Core의 관찰용 후보·보류 정책, 파일 Lab 실행·재생, 합성 B0/B1 평가, 모델 없는 근거 묶음과 문서 계획 계약을 구현했다. 실제 사용자 품질, 제안 정책, 제품 API·업무 웹·DB·배포는 아직 구현하지 않았다.

현재 있는 것은 Paper/Dark 디자인 생성·검사 도구, 공통 React UI/테마 소스 표본, core/lab 빌드와 Core 원문·근거 검증/시점 snapshot/lexical·semantic 후보 검색·관찰 판단 기준선, 파일 run/replay/inspect/compare/evaluate/pack/semantic/compare-semantic CLI와 합성 데이터, 관리/Delivery 계약 예제와 생성 client 타입, 제품·도메인·화면/ERD 계약과 75개 작업 카드다. 공통 UI 소스나 lab smoke가 있다는 이유로 제품 React 앱이나 완성된 판단 기능이 실행된다고 설명하지 않는다.

## 구현의 시작점

| 문서 | 읽는 목적 |
|---|---|
| [프로젝트 상태](docs/status/project-state.md) | 구현됨/미구현/미검증과 정리 결과 |
| [계획 입구](docs/plan/README.md) · [작업 목록](docs/plan/task-index.md) | P0–P9와 75개 카드 |
| [Core](docs/plan/02-core-plan.md) · [Backend](docs/plan/03-backend-plan.md) · [Web](docs/plan/04-web-plan.md) | 영역별 상세 기능·반례·완료 기준 |
| [실행 지시](docs/plan/07-codex-execution-playbook.md) · [AGENTS](AGENTS.md) | 구현 시작 지시와 main 직접 작업 규칙 |
| [BASE-01 증거](docs/evidence/base-01.md) | 실제 실행 검사와 미검증 범위 |
| [BASE-02 증거](docs/evidence/base-02.md) | workspace·CI의 로컬/Linux 검증 범위 |
| [BASE-03 증거](docs/evidence/base-03.md) · [계약 예제](docs/plan/contracts.md) | 계약 생성·경계 검사와 로컬/Linux 검증 범위 |
| [CORE-01 증거](docs/evidence/core-01.md) · [CORE-02 증거](docs/evidence/core-02.md) | 원본 근거 모델·시점 snapshot 검증 범위 |
| [CORE-03 증거](docs/evidence/core-03.md) | 검색용 lexical 기준선과 합성 반례 검증 범위 |
| [CORE-04 증거](docs/evidence/core-04.md) | 후보 검색·원본별 대표·예산과 합성 반례 검증 범위 |
| [CORE-05 증거](docs/evidence/core-05.md) | 가용성·점수·관찰용 후보/보류·설명과 합성 반례 검증 범위 |
| [CORE-06 증거](docs/evidence/core-06.md) | 파일 실행·결정 재생·수동 피드백·artifact 무결성의 합성 반례 검증 범위 |
| [CORE-07 증거](docs/evidence/core-07.md) | 합성 40개 맥락·60개 질의의 B0 평가와 누수·분모 반례 |
| [CORE-08 증거](docs/evidence/core-08.md) | 직접 선택한 원문에서 모델 없이 private 근거 묶음 생성 |
| [CORE-09 증거](docs/evidence/core-09.md) | 고정 벡터 exact 검색과 합성 B0/B1 비교·한계 |
| [CORE-14 증거](docs/evidence/core-14.md) | 목적별 checklist·관점·출처 기반 개요와 readiness 계약 |

CORE-01–09와 CORE-14가 Linux CI에서 VERIFIED다. **CORE-10**을 선행 조건에 맞춰 진행한다. CORE-12·BE-01·FE-01도 착수 가능하다. 이후 기능별 테스트·검토·커밋을 main에서 수행한다.

## 현재 실행 가능한 검사

Node 24.18.0을 사용한다. 계획·디자인 준비 검사는 외부 패키지 설치가 필요 없다.

```sh
npm run prep:check
```

Workspace와 BASE-03 계약 검사는 의존성 설치 후 실행한다.

```sh
pnpm install --frozen-lockfile
pnpm contracts:check
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm build
pnpm lab:smoke
```

Lab CLI는 빌드 뒤 `node apps/lab-cli/dist/main.js run <snapshot.json>`으로 실행한다. 기본 artifact는 저장소 밖의 `~/.local/share/ieum-lab/runs/`에 보관한다. 생성된 경로로 `replay <run-directory>`, `inspect <run-directory>`, `compare <run-a> <run-b>`를 호출할 수 있다. 입력 형식과 private artifact 범위는 [CORE-06 증거](docs/evidence/core-06.md)를 따른다.

합성 B0 평가는 `node apps/lab-cli/dist/main.js evaluate datasets/sample/core-07-b0.json`으로 실행하며 기본 결과는 저장소 밖에 둔다. 합성 수치를 실제 사용자 품질로 해석하지 않는다.

모델 없는 근거 묶음은 직접 선택 이벤트가 저장된 run에 대해 `node apps/lab-cli/dist/main.js pack <run-directory> <request.json>`으로 만든다. 기본 private 경로는 `~/.local/share/ieum-lab/packs/`이며 요청 형식과 검증 범위는 [CORE-08 증거](docs/evidence/core-08.md)를 따른다.

고정 embedding artifact는 `node apps/lab-cli/dist/main.js semantic <snapshot.json> <artifact.json>`으로 한 snapshot에서 검색하고 `compare-semantic <dataset.json> <artifact.json>`으로 B0/B1을 비교한다. 합성 예제 벡터는 `node scripts/experiments/generate-synthetic-embeddings.mjs`로 재생성할 수 있으며, 모델 품질 근거가 아니라 검색 경로 검증용이다.

준비 검사 개별 명령:

```sh
node scripts/plan/render.mjs --check
node scripts/plan/check.mjs
node scripts/design/build.mjs
node scripts/design/themes.mjs
node --test scripts/design/test.mjs
node scripts/design/check.mjs
node scripts/design/themes.mjs --check
```

준비 검사 성공은 계획/디자인 기준선의 검사다. workspace 계약·typecheck·unit·build·smoke 성공은 core/lab 및 계약 예제의 검사이며 판단 품질·DB integration·브라우저 E2E·운영 복원 성공이 아니다.

## 아키텍처 기준

Core는 순수 TypeScript, 백엔드는 NestJS + FastifyAdapter 기반 모듈형 모놀리스, DB는 PostgreSQL + Drizzle, 웹은 React/Vite다. Better Auth·pg-boss·Tiptap 등은 실제 통합 gate와 버전 검증 후 적용한다. 프레임워크 이름을 적은 것을 구현 완료로 취급하지 않는다.

일반 저장·편집·완료와 비동기 판단은 분리한다. 원문 revision, 다중 맥락, 사용자 승인, 근거와 해석 구분, 검토한 공개 snapshot, 개인 공간 격리는 유지한다. 실제 비공개 원문·secret·embedding·export를 이 공개 저장소에 넣지 않는다.

[디자인 자산](design-system/README.md) · [제품 목적](docs/product/vision-and-scope.md) · [화면/ERD](docs/design/README.md) · [새 결정 ADR 0012](docs/adr/0012-main-zero-base-execution.md)
