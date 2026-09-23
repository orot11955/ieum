# IEUM · 이음

**생각·경험·외부 자료를 원본과 출처로 보존하고, 일정·할일·위키를 관리하며, 축적한 자료를 문서로 정제해 승인한 공개본을 API로 제공하는 개인 내부 관리 제품.** 외부 블로그 독자 화면은 별도다.

## 현재 상태 · 2026-09-23 KST

**main 단일 브랜치 · BASE-01–03, CORE-01–15, BE-01–03 VERIFIED · CORE-16 BLOCKED.** Core의 원본·snapshot·관찰 판단, 파일 Lab 실행·재생, 합성 B0/B1/B2/B3 비교, 근거 묶음, 추출·구조 변경 미리보기·문서 claim 검증 계약을 구현했다. Nest/Fastify API, Better Auth adapter, 최소 업무 DB/RLS는 Linux CI에서 검증했다. 실제 사용자 품질, 업무 웹/API, 운영 DB·배포는 아직 미검증이다.

현재 있는 것은 Paper/Dark 디자인 생성·검사 도구, 공통 React UI/테마 소스 표본, core/lab 빌드와 Core 원문·근거 검증/시점 snapshot/lexical·semantic·hybrid 후보 검색·관찰 판단 기준선, 파일 run/replay/inspect/compare/evaluate/pack/semantic/compare-semantic/compare-hybrid CLI와 합성 데이터, 관리/Delivery 계약 예제와 생성 client 타입, Nest/Fastify liveness API와 worker self-check, 제품·도메인·화면/ERD 계약과 75개 작업 카드다. 공통 UI 소스나 lab smoke가 있다는 이유로 제품 React 앱이나 완성된 판단 기능이 실행된다고 설명하지 않는다.

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
| [CORE-10 증거](docs/evidence/core-10.md) | B2/B3 hybrid 비교와 validation 전용 제안 게이트 |
| [CORE-11 증거](docs/evidence/core-11.md) | 자유 기록 추출 후보·원문 revision·시간 확인 계약 |
| [CORE-12 증거](docs/evidence/core-12.md) · [CORE-13 증거](docs/evidence/core-13.md) | 승인 snapshot의 구조 진단과 변경안별 영향 미리보기 |
| [CORE-14 증거](docs/evidence/core-14.md) | 목적별 checklist·관점·출처 기반 개요와 readiness 계약 |
| [CORE-15 증거](docs/evidence/core-15.md) | 모델 초안의 출처·claim map 검증 계약 |
| [CORE-16 차단 근거](docs/evidence/core-16.md) | 실제 효용 평가의 미충족 선행과 재개 조건 |
| [BE-01 증거](docs/evidence/be-01.md) · [API/화면 재점검](docs/review/api-wireframe-server-entry-2026-09-23.md) | 서버 최소 실행 경계와 남은 계약 |
| [BE-02 증거](docs/evidence/be-02.md) · [auth spike](docs/evidence/auth-spike-report.md) | 인증 adapter의 실제 PostgreSQL·Linux CI 검증 |
| [BE-03 증거](docs/evidence/be-03.md) · [DB migration 안내](db/README.md) | 업무 schema·RLS·role의 로컬 및 Linux PostgreSQL 검증 |
| [BE-04 증거](docs/evidence/be-04.md) | 계정·초대·세션·복구의 실제 PostgreSQL·Linux CI 검증 |
| [BE-05 증거](docs/evidence/be-05.md) | 명령 멱등성·감사·outbox의 실제 PostgreSQL·HTTP 검증 |
| [BE-07 증거](docs/evidence/be-07.md) | 원문·unit 불변 revision과 분할의 실제 PostgreSQL·HTTP 검증 |
| [BE-08 증거](docs/evidence/be-08.md) | 다중 Context 소속·관계의 실제 PostgreSQL·HTTP 검증 |
| [BE-09 증거](docs/evidence/be-09.md) | Task 상태·기한·결과 원문의 실제 PostgreSQL·HTTP 검증 |
| [BE-10 증거](docs/evidence/be-10.md) | 일정의 시간대·종일·DST·취소의 실제 PostgreSQL·HTTP 검증 |
| [BE-06 증거](docs/evidence/be-06.md) | pg-boss outbox relay·worker·권한 격리의 PostgreSQL·Linux CI 검증 |

CORE-01–15와 BE-01–10이 Linux CI에서 VERIFIED다. **CORE-16은 FE-14·FE-16과 허용된 실제 기록·별도 holdout이 준비될 때 재개한다.** BE-11은 FE-01→FE-02 선행 검증을 기다린다. 다음 독립 서버 카드는 BE-12다. FE-01과 QA-02도 별도 착수 가능하다.

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
pnpm api:smoke
```

`pnpm api:smoke`는 빌드된 API를 로컬 루프백 포트에서 띄워 종료까지 검사한다. 인증·업무 DB는 `pnpm --filter @ieum/api test:auth`, `pnpm --filter @ieum/backend test:db`, `pnpm --filter @ieum/api test:identity`로 격리 PostgreSQL에서 검사한다. 현재 업무 API는 계정·개인 설정·원문/단위 관리까지 제공한다.

Lab CLI는 빌드 뒤 `node apps/lab-cli/dist/main.js run <snapshot.json>`으로 실행한다. 기본 artifact는 저장소 밖의 `~/.local/share/ieum-lab/runs/`에 보관한다. 생성된 경로로 `replay <run-directory>`, `inspect <run-directory>`, `compare <run-a> <run-b>`를 호출할 수 있다. 입력 형식과 private artifact 범위는 [CORE-06 증거](docs/evidence/core-06.md)를 따른다.

합성 B0 평가는 `node apps/lab-cli/dist/main.js evaluate datasets/sample/core-07-b0.json`으로 실행하며 기본 결과는 저장소 밖에 둔다. 합성 수치를 실제 사용자 품질로 해석하지 않는다.

모델 없는 근거 묶음은 직접 선택 이벤트가 저장된 run에 대해 `node apps/lab-cli/dist/main.js pack <run-directory> <request.json>`으로 만든다. 기본 private 경로는 `~/.local/share/ieum-lab/packs/`이며 요청 형식과 검증 범위는 [CORE-08 증거](docs/evidence/core-08.md)를 따른다.

고정 embedding artifact는 `node apps/lab-cli/dist/main.js semantic <snapshot.json> <artifact.json>`으로 한 snapshot에서 검색하고 `compare-semantic <dataset.json> <artifact.json>`으로 B0/B1을 비교한다. 합성 예제 벡터는 `node scripts/experiments/generate-synthetic-embeddings.mjs`로 재생성할 수 있으며, 모델 품질 근거가 아니라 검색 경로 검증용이다.

`node apps/lab-cli/dist/main.js compare-hybrid <dataset.json> <embedding.json> [--aux <auxiliary.json>] [--out <directory>]`는 같은 합성 dataset에서 B2/B3 순위와 fallback을 비교한다. 출력은 private 경로에 두며 합성 결과로 추천 모드를 활성화하지 않는다.

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
