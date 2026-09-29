# IEUM · 이음

**생각·경험·외부 자료를 원문과 출처째 보존하고, 맥락으로 묶어 할일·일정·위키로 관리하는 개인 관리 웹앱.**

## 현재 상태

인증·개인 공간·기록·맥락·할일·일정·위키의 API와 PostgreSQL 저장은 검증돼 있다. Paper/Dark 공통 UI와 편집기 spike도 있다. **업무 웹 화면은 아직 없다.** [계획 2.0](docs/plan/README.md)의 다음 목표는 로그인부터 위키까지 본인이 매일 쓸 수 있는 화면이다. 자체 판단 엔진(Core)은 실효성 검토 후 제거했다([ADR 0014](docs/adr/0014-remove-core-personal-management-first.md)). 영역별 상태와 미검증 범위는 [프로젝트 상태](docs/status/project-state.md)에만 둔다.

## 문서

| 문서 | 읽는 목적 |
|---|---|
| [프로젝트 상태](docs/status/project-state.md) | 구현됨·동결·중단·미검증 |
| [계획 2.0](docs/plan/README.md) | 마일스톤 M1–M7과 체크리스트 |
| [AGENTS](AGENTS.md) | main 직접 작업·불변식·검증 규칙 |
| [제품 목적](docs/product/vision-and-scope.md) · [웹 기능](docs/product/web-functional-spec.md) | 무엇을 왜 만드는가 |
| [도메인](docs/architecture/domain-model.md) · [권한](docs/architecture/identity-and-access.md) · [웹 설계](docs/architecture/web-application-design.md) | 데이터·권한·화면 구조 계약 |
| [화면·ERD](docs/design/README.md) · [디자인 자산](design-system/README.md) | Paper/Dark와 화면 계약 |
| [DB migration](db/README.md) | role·RLS·migration 적용 순서 |
| `docs/evidence/` | 백엔드·UI spike의 검증 기록 |

## 실행 가능한 검사

Node 24.18.0을 사용한다. 계획·디자인 준비 검사는 패키지 설치 없이 돈다.

```sh
npm run prep:check
```

workspace 검사는 의존성 설치 후 실행한다.

```sh
pnpm install --frozen-lockfile
pnpm contracts:check
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm build
pnpm api:smoke
```

`pnpm api:smoke`는 빌드된 관리 API를 로컬 루프백 포트에서 띄웠다가 종료한다. 업무 DB 검사는 Docker(Testcontainers)가 있을 때 `pnpm --filter @ieum/backend test:db`와 `pnpm --filter @ieum/api test:identity`로 실행한다. 인증 adapter 검사 `pnpm --filter @ieum/api test:auth`는 `AUTH_DATABASE_URL`이 필요하다. 공통 UI 브라우저 검사는 `pnpm test:web`이다. 이 명령들은 운영 배포나 운영 DB migration을 수행하지 않는다.

## 아키텍처

백엔드는 NestJS + FastifyAdapter 모듈형 모놀리스, DB는 PostgreSQL + Drizzle, 인증은 Better Auth, 작업 큐는 pg-boss, 웹은 React/Vite, 편집기는 Tiptap이다. 원문 revision, 다중 맥락, 명시적 명령, 개인 공간 격리를 지킨다. 실제 비공개 원문·secret·export를 이 공개 저장소에 넣지 않는다.
