# 07 · 구현 시작·커밋·보고 · main 전용

## 현재 상태와 권한

계획 1.1은 main에 채택됐다. CORE-01–09와 CORE-14의 문서 계획 계약까지 Linux 실행으로 VERIFIED다. 실제 사용자 품질, 제안 정책, API·업무 Web 및 운영 DB/배포는 미구현·미접근이다. 다음 카드의 착수는 선행 작업의 VERIFIED/ACCEPTED 증거를 따른다.

문서 우선순위: 사용자 최신 지시 → AGENTS.md → ADR 0012 → docs/plan/backlog.json 및 00–09 → 보존된 제품/도메인/화면 계약. 과거 M/S/I 번호·다크 후속·별도 브랜치 지시는 현재 실행 규칙이 아니다.

## 다음 카드 구현 지시를 받았을 때

```text
orot11955/ieum의 main에서만 작업하라. 새 브랜치나 PR을 만들지 마라.
git status와 원격 main을 확인하고, 깨끗한 상태에서만 ff-only로 동기화하라.
사용자의 미커밋 변경을 덮어쓰지 마라. main이 앞서갔으면 diff를 재검토하라.
force push, hard reset, 과거 패치 전체 재적용, DB downgrade, 공개 배포를 금지한다.

README, AGENTS, docs/status/project-state.md, docs/plan/README.md,
01-master-roadmap.md, 05-data-api-and-state-contracts.md,
06-testing-and-release-gates.md, 이 문서와 backlog.json을 읽어라.
BASE-01 증거를 재확인하되 이미 채택한 계획·브랜치를 다시 만들지 마라.
현재 가능한 prep 검사를 먼저 실행하고 실패를 먼저 해결하라.

BASE-02의 로컬/Linux 증거를 확인하라.
CORE-10을 선행 조건에 맞춰 우선 구현하라.
선행 카드가 VERIFIED/ACCEPTED가 아니면 의존하는 카드로 넘어가지 마라.
한 카드의 acceptance를 먼저 테스트로 표현하고 필요한 코드만 구현하라.
규모가 크면 카드 안에서 기능 커밋으로 나누되 필수 반례를 뒤로 미루지 마라.
정상 검사 결과와 실제 diff를 확인한 작은 기능 단위로 main에 커밋하라.
테스트가 실패하는 중간 상태를 main 원격에 올리지 마라.

Core는 DB/HTTP/Nest/React/모델 SDK와 독립된 순수 TS다.
초기 mode는 observe이며 동일 snapshot 재생, 누수/결측/동점/보류 반례가 필수다.
계정·운영 화면을 다 만든 뒤 Core를 시작하지 마라.
Paper/Dark 토큰/recipe/lock/공통 UI 원본을 임의 변경하지 마라.
미래 API·66개 테이블·27개 빈 화면·가짜 provider를 선행 생성하지 마라.

각 카드의 실제 명령·exit code·환경·commit·미검증 범위를 docs/evidence/<id>.md에 남겨라.
검증한 경우에만 backlog.json 상태를 바꾸고 renderer와 plan check를 다시 실행하라.
실행하지 못한 검사를 통과로 처리하지 마라. 계획 수치와 실측을 구분하라.
운영 데이터에 연결하지 말고 테스트용 새 DB를 사용하라.
```

## 기능 단위와 agent 조정

권장 순서는 실패 반례 정의 → 계약/schema → domain/application → adapter/HTTP → web → 실제 통합 검증이다. 예: BE-07.1 원본 schema, BE-07.2 생성/개정 command, BE-07.3 조회/수동 분할, BE-07.4 DB 반례. 카드의 필수 검증을 빠뜨린 채 작은 이름만 붙여 완료 처리하지 않는다.

공유 파일(contracts, migration 순서, lockfile, token, root CI)은 한 조정자가 직렬 통합한다. main 단일 브랜치 요구가 공유 working tree에 여러 writer를 동시에 허용한다는 뜻은 아니다. 병렬 agent는 독립 파일 범위에서 조사/검토하고 실제 공통 변경·커밋은 직렬화한다. 같은 파일의 동시 덮어쓰기를 금지한다.

커밋 예: `chore(workspace): add strict core/lab harness [BASE-02]`, `feat(core): validate source spans [CORE-01]`, `test(lab): verify as-of replay [CORE-06]`. 인증·코어·위키·발행을 한 커밋에 묶지 않는다. 새 agent harness를 별도 제품으로 만들 필요는 없다.

## 명령의 현재/예정 구분

현재는 README의 Node 기반 plan/design 검사와 BASE-02의 `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm lab:smoke`, 빌드된 `node apps/lab-cli/dist/main.js run/replay/inspect/compare/evaluate/pack/semantic/compare-semantic`이 실행 가능하다. `pnpm test:architecture`, `pnpm test:contracts`, `pnpm test:integration`, `pnpm test:e2e`는 해당 카드에서 만들어 검증할 **미래 계약**이다. 없는 테스트를 `--passWithNoTests`로 성공 처리하지 않는다.

라이브러리 버전은 실제 구현 시 공식 호환성·advisory·설정 시험 후 lock한다. 이 문서의 후보 이름이나 과거 package.json 버전을 설치 검증으로 취급하지 않는다.

## 완료 보고

```text
작업 ID / 사용자 가치:
기준 SHA / branch(main):
변경 파일·schema·API:
실행 명령 / exit code / 실제 환경:
반례와 검증 결과 / 증거 경로:
미검증·실패·비활성 기능:
데이터 영향 / 안전한 역변경:
완료 상태와 다음 준비된 카드:
```

PLANNED → IN_PROGRESS → IMPLEMENTED → VERIFIED → ACCEPTED로 구분한다. BLOCKED는 blocker/재개 조건을 기록한다. VERIFIED 이상에는 증거가 있어야 하며, 사용자 인수가 없으면 ACCEPTED로 올리지 않는다. 공개 저장소에 개인 원문·embedding·prompt·token·private export를 올리지 않는다.

## 재사용·복원 경계

보존한 UI와 테마 test는 FE-01의 검증 대상이지 완성 제품이 아니다. 기존 lexical/API/auth/발행 구현은 Git 이력에서 필요한 함수/테스트를 개별 검토할 수 있지만 통째로 재적용하지 않는다. source rollback은 DB migration이 아니다. 기존 DB가 확인되면 backup·schema inventory·별도 변환 rehearsal 없이 변경하지 않는다.

## BASE 작업 카드

<!-- GENERATED:TASKS:BASE:START -->

### BASE-01 · 기준선·문서 우선순위·재사용 판정 확정

**구간:** P0 · **상태:** VERIFIED · **선행:** 없음

**구현 범위:** 사용자가 통합한 main f4ccbc2의 파일 트리를 제로베이스 계획과 대조한다. 75개 작업 카드를 main에 채택하고 README·AGENTS·기존 S/M/I 계획의 우선순위를 정리한다. 제품 패치 재적용 워크플로·죽은 제품 설정·중복 과거 실행 계획을 제거한다. 다크 디자인·공통 UI·제품/도메인/화면/ERD의 유효한 계약은 보존한다.

**입출력·데이터·코드 계약:** 산출물: docs/status/project-state.md, docs/status/cleanup-manifest.json, docs/adr/0012-main-zero-base-execution.md, docs/plan/ 및 docs/evidence/base-01.md. main에서만 작업하고 새 브랜치·PR·force push·DB downgrade·배포를 하지 않는다.

**필수 반례·검증:** 원격 main SHA와 단일 브랜치 확인; 계획 75개 카드·선행관계·순환·27개 화면·문서 링크 검사; 보존 자산 blob hash 검사; 실제 디자인 생성·토큰·테마 검사. 로컬 개발 환경과 운영 DB는 미접근으로 명시하고, 구현 시작 시 개발자가 git status와 격리된 개발 환경을 확인한다.

**완료 기준:** main의 단일 실행 정본·정리 이유·보존 자산·실제 검사 증거가 존재한다. 이전 제품 패치 자동 재적용 경로는 없으며 다음 구현 카드는 BASE-02다. 준비 완료를 제품 빌드·DB·E2E 완료로 표기하지 않는다.

**이번 카드 제외:** 제품 구현·신규 패키지 설치·운영 DB 확인/변경·배포·브랜치 생성/삭제. 운영 환경의 존재는 UNKNOWN이며 DB 작업 전 별도 확인해야 한다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/base-01.md`. 테스트 작성과 실제 실행을 구분한다.

### BASE-02 · 최소 workspace·실행·검사 기반

**구간:** P0 · **상태:** VERIFIED · **선행:** BASE-01

**구현 범위:** pnpm workspace, TS strict, 패키지 exports, core/lab 최소 빌드, Vitest, formatter/linter를 준비한다. web/API harness는 실제 spike가 생길 때 추가한다. Node 24 계열의 선택 버전과 패키지 호환성을 확인하고 lockfile을 고정한다.

**입출력·데이터·코드 계약:** 산출물: pnpm-workspace.yaml, tsconfig 공통 설정, 패키지별 scripts, CI 기본 파이프라인. production start는 개발용 tsx 실행과 구분하여 빌드 산출물을 실행한다.

**필수 반례·검증:** 깨끗한 설치→typecheck→test→build; 잘못된 import/타입을 의도적으로 넣으면 CI 실패; core 테스트는 DB·모델 없이 실행.

**완료 기준:** 새 기기에서 문서에 적힌 명령만으로 최소 패키지 검사가 재현된다. 아직 없는 모듈 테스트를 성공 처리하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/base-02.md`. 테스트 작성과 실제 실행을 구분한다.

### BASE-03 · 도메인·HTTP·편집기 계약과 의존 방향

**구간:** P0 · **상태:** VERIFIED · **선행:** BASE-02

**구현 범위:** core snapshot과 관리 HTTP DTO, 공개 Delivery DTO를 분리한다. Zod 런타임 schema를 HTTP 정본으로 삼고 OpenAPI 및 client 생성 경로를 작은 왕복 예제로 검증한다. editor JSON schemaVersion과 원문 UTF-16 span을 별개 계약으로 정한다.

**입출력·데이터·코드 계약:** 산출물: packages/contracts/{management,delivery}, docs/plan/contracts.md, architecture import rules. 관리 요청 DTO→application command→Core input/저장 입력 간 명시적 mapper를 둔다. 실제 ORM row mapper는 저장 schema가 생기는 BE-07에서 연결한다.

**필수 반례·검증:** 요청/응답 schema·OpenAPI·생성 client의 동일 예제 왕복; 공개 DTO에 private 필드 추가 시 실패; core→backend, web→backend/DB import 실패.

**완료 기준:** 계약 하나 변경 시 영향을 받는 검사와 소비자가 식별된다. generic Row/unknown 캐스팅으로 컴파일을 우회하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/base-03.md`. 테스트 작성과 실제 실행을 구분한다.

<!-- GENERATED:TASKS:BASE:END -->
