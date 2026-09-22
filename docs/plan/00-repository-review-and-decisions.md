# 00 · 저장소 재검토와 기술 결정

## 1. 현재 기준선 · 2026-09-23 채택

현재 기준은 사용자가 다크 기준선을 병합한 **main `f4ccbc233aa5c62f3310e00d483c2115f145876a`**다. 2026-09-23 KST 확인 시 원격 브랜치는 main 하나였다. 새 브랜치나 PR을 만들지 않고 main에 순차 기능 커밋한다.

기존 계획 1.0에서 참조한 `5cc3604`와 `64be0e2`는 역사적 검토 commit이다. 삭제된 archive/replan 브랜치를 복구하거나 그 브랜치에서 구현을 시작하지 않는다. main을 과거 SHA로 이동하지 않는다.

| 현재 파일 | 판정 |
|---|---|
| Paper/Dark 토큰·recipe·lock·공통 React UI·테마 테스트 | 보존; 제품 UI 검증은 FE-01에서 별도 수행 |
| 제품/도메인/권한/출처/화면/ERD 계약 | 보존; 실행 순서·경로·runtime 선택은 이 계획이 우선 |
| API/Core/업무 웹 코드 | 현재 기준선에는 없음; 과거 구현 리뷰를 현재 코드로 오인하지 않음 |
| 과거 제품 자동 적용·의존성 자동 고정 workflow | 제거 |
| 제품용 package dependencies/lock·깨진 web entry/config | 제거; BASE-02 및 실제 spike에서 검증해 생성 |
| 이전 M/S/I 실행 계획 | Git 이력으로 보존하고 현재 트리의 중복은 제거 |

실제 정리 목록과 검증 범위는 [프로젝트 상태](../status/project-state.md), [정리 manifest](../status/cleanup-manifest.json), [BASE-01 증거](../evidence/base-01.md)를 따른다. 운영 DB/배포 상태는 확인하지 않았고 변경하지 않았다.

## 2. 최초 컨셉을 요구사항으로 고정

**이음은 개인 정보가 행동과 경험으로 이어지고, 다시 지식과 공개 가능한 문서로 정제되는 내부 관리 제품이다.** 단순 일정 앱·검색 도구·AI 채팅창·블로그 CMS 중 하나로 축소하지 않는다. [S04]

| 요구 ID | 반드시 완성할 사용자 가치 | 최종 구현 책임 |
|---|---|---|
| R01 | 생각·경험·질문·외부 자료를 원본과 출처로 보존 | Capture/Source/Revision |
| R02 | 실제 할일·일정·위키를 직접 관리 | Planning/Document + 내부 웹 |
| R03 | 한 기록을 여러 맥락에서 재사용하고 관련 후보를 찾음 | Core Retrieval/Routing + Knowledge |
| R04 | 판단의 근거·보류·시점을 설명하고 재생 | Core Replay + Run/Snapshot |
| R05 | 기록에서 할일·일정·단위를 추출하여 확인 후 전환 | Extraction + 승인 command |
| R06 | 목적에 따라 맥락을 묶고 나누며 안전하게 되돌림 | Structure Core + 원자적 변경 + UI |
| R07 | 경험과 여러 외부 관점을 비교하여 근거 있는 문서 작성 | Evidence Pack/Outline/Claim/Editor |
| R08 | 선택적 모델 정제와 사용자 검토를 통해 글을 발전 | Generation adapter + 검증 + diff |
| R09 | 검토한 특정 버전만 발행·개정·철회 | Publishing/Delivery |
| R10 | 외부 블로그가 내부 DB를 몰라도 공개본을 소비 | 독립 API 계약과 test consumer |
| R11 | 계정·개인 공간·첨부·검색·작업·로그 전반의 격리 | Backend authorization + 제약 + negative tests |
| R12 | 데이터를 이식·삭제·복원하고 장애를 운영 | Data lifecycle/Backup/Operations |
| R13 | Paper/Dark가 모든 상태와 화면에서 일관 | UI tokens/recipe/wrappers/회귀 |
| R14 | Core나 모델이 실패해도 수동 저장·완료·편집 유지 | 명령 경로와 비동기 판단 분리 |

처음 제외하지만 V1 목표를 손상시키지 않는 항목은 네이티브 앱, 완전 오프라인 동기화, 실시간 협업 ACL, 과금, 외부 캘린더 양방향 동기화, 반복 일정, 임의 URL 크롤러, 외부 블로그 완제품, 의미 판단의 무승인 자동 실행이다. 파일/URL 자료 수집은 우선 사용자가 제공한 metadata·텍스트·허용 첨부로 완성한다. URL 자동 수집이 없다는 이유로 외부 관점 자체를 제외하지 않는다.

## 3. 과거 제품 구현과 계획의 차이 · 역사적 참고

| 확인한 코드/문서 | 정적 확인 내용 | 재계획의 대응 |
|---|---|---|
| `packages/core/src/index.ts` | lexical TF-IDF 계열의 최소 route는 존재. snapshot/config/time·가용성/정책/Replay 전체 계약을 구현한 형태는 아님 | CORE-01–10으로 작은 독립 엔진과 평가 절차 구축 |
| 같은 core의 member 선택 | origin별 Map으로 대표를 고른 뒤 점수화하므로 같은 origin의 어떤 근거를 대표로 삼는지 검증 필요 | origin 내부 비교 후 대표 선택, 순서 반례 추가 |
| `apps/api/src/judgement.ts` | 현재 revision을 읽고 context 1,000/member 10,000 제한으로 계산. 처리 경로에서 과거 snapshot 재구성·truncation 계약을 확인하기 어려움 | BE-12의 batch snapshot/manifest/budget 명시 |
| 같은 judgement 적용 경로 | capture에서 첫 unit을 찾아 연결하는 흐름 | 정확한 unit ID/revision을 proposal에 고정 |
| `apps/web/src/features/personal.tsx` | 여러 업무 화면, 폼, payload와 generic Row 접근이 큰 파일에 함께 존재 | feature/조회/편집/페이지 조립 경계를 실제 타입으로 분리 |
| README·착수 문서 | main 구현과 달리 구현 없음, 다크 후속 같은 문구 잔존 | 상태/계획/검증 증거를 분리한 새 안내 |

근거: S05–S08, S13. 아래 평가는 이전 main 5cc3604의 코드에 대한 역사적 검토이며 현재 main에 그 구현이 남아 있다는 의미가 아니다. SQL 일부에 workspace 조건이 안 보인다는 이유만으로 RLS 우회 취약점을 확정하지 않으며, 실행하지 않은 테스트가 실패했다고 주장하지 않는다. 기존 정상 동작과 테스트는 참고하되 검증 전 그대로 이식하지 않는다.

## 4. 채택할 구조와 이유

### D01 · 모듈형 모놀리스, 실행 프로세스만 분리

한 repository와 하나의 업무 DB를 유지한다. API·worker·web·lab은 실행 목적이 다르지만 domain/application 코드를 불필요하게 복제하지 않는다. Redis/Kafka/Elasticsearch/별도 vector DB/Kubernetes/microservice는 초기 필수가 아니다. 이 선택은 운영 복잡도를 줄이기 위한 설계 판단이다.

### D02 · Core는 순수 TypeScript

`packages/core`에는 I/O, DB transaction, HTTP, React, Nest decorator, model SDK가 없다. 타입/검증/feature 계산/후보 결합/점수/정책/구조 진단/정제 검증만 둔다. 검색에 필요한 실제 데이터 준비와 모델 호출은 adapter가 수행한다. 순수 함수의 입력은 이미 허용된 불변 snapshot이며 시간·seed·config는 명시적 값이다. [S09]

### D03 · Backend는 NestJS + FastifyAdapter

직접 등록한 거대한 Fastify app 대신 Nest module/provider/guard/filter를 composition root로 쓴다. 도입 이유는 업무 모듈의 조립과 의존 방향을 명확하게 하기 위해서이지 성능 수치를 보장하기 위해서가 아니다. Nest는 FastifyAdapter를 제공한다. Express용 middleware를 그대로 섞지 않으며 BE-01에서 ESM/decorator/build/plugin 호환성을 시험한다. [O01]

Fastify만으로도 올바른 계층 분리는 가능하다. 다만 이번 재구현에서는 사용자가 요구한 명확한 구조와 반복 적용을 위해 Nest를 기본안으로 정한다. 도메인 클래스와 use case는 가능한 순수 클래스로 두고 provider factory가 필요한 의존성을 주입한다. 복잡한 CRUD base class나 범용 Repository framework를 새로 만들지 않는다.

### D04 · PostgreSQL + Drizzle

Revision/FK/unique/transaction/검색을 하나의 데이터 저장소에서 관리한다. RLS는 애플리케이션 검사에 더하는 방어선이다. runtime role은 non-owner이고 BYPASSRLS를 갖지 않는다. 테이블 owner/superuser 등 RLS 우회 조건과 constraint 검사 특성을 이해하고 두 계정 반례로 시험한다. Drizzle schema와 SQL migration 검토를 같이 남긴다. [O04, O05]

PGlite는 빠른 일부 개발 테스트에 쓸 수 있지만 운영 PG의 role·RLS·동시성 검증을 대체하지 않는다. vector는 CORE-09/BE-12 이후에 필요할 때 추가하고 exact reference를 먼저 둔다. pg_trgm/기본 FTS는 lexical adapter이며 TF-IDF나 BM25와 동일하다고 명명하지 않는다. [O06, O07]

### D05 · 인증은 Better Auth 후보, 통합 gate 후 확정

문서 확인 결과 Nest 연동은 community-maintained이며 Fastify 지원이 beta로 안내된다. 따라서 `@thallesp/nestjs-better-auth`를 기본 필수 의존성으로 넣지 않는다. Better Auth의 native Fastify handler/API를 `AuthPort` 뒤에서 통합하고, body parsing·여러 Set-Cookie·MFA·즉시 세션 철회·초대 우회 방지를 실제로 검증한다. [O02, O03]

BE-02 통과 시 선택 버전/schema를 잠근다. 실패 시 안전 요건을 완화하지 않고 native auth route 경계를 분리하거나 HTTP adapter 선택을 수정한다. Nest 자체를 유지할지와 특정 auth bridge를 채택할지는 서로 다른 결정이다. 수제 password/session 프로토콜을 대안으로 만들지 않는다.

### D06 · Queue는 pg-boss, 업무 원자성은 별도 설계

PostgreSQL 기반 job queue와 기존 DB transaction 연계 기능을 제공하는 pg-boss를 채택 후보로 한다. [O08] DB 변경과 enqueue를 같은 transaction에서 처리하는 adapter를 검증한다. 불가능하거나 불명확하면 업무 outbox를 같은 transaction에 기록하고 relay가 enqueue한다. 성공 직후 죽는 worker나 외부 모델/메일의 응답 유실을 고려하여 handler는 idempotent하게 만든다. queue의 exactly-once 전달 표현을 외부 부작용의 정확히 한 번 실행으로 해석하지 않는다.

### D07 · Web은 React/Vite 유지, 상태별 책임 분리

React Router는 화면 이동, TanStack Query는 server state, React Hook Form+Zod는 일반 form, Tiptap은 위키/문서 편집에 사용한다. TanStack Query가 서버 데이터의 조회/캐싱/동기화 책임을 지원한다는 점을 활용하되, 미저장 draft를 query data에 합치지 않는다. [O09] 내부 관리 UI의 이번 범위에는 Next.js 전환이나 SSR을 도입할 필요가 없다고 판단한다. 외부 독자 앱은 별도 선택이다.

Tiptap JSON을 편집 정본으로 하고 block ID에 claim을 연결한다. Tiptap은 JSON/HTML 출력을 지원하고 UniqueID 확장을 제공하지만, 사용자의 편집 뒤 인용의 의미가 유지되는지는 별도 검증해야 한다. [O10, O11] editor schema와 일반 capture raw text는 구분한다. 유료 cloud/CRDT/협업 확장을 필수로 채택하지 않는다.

### D08 · 테스트와 의존성 경계도 제품의 일부

Vitest, 실제 PostgreSQL Testcontainers, Playwright, 생성 OpenAPI/client 일치 검사, import-boundary 검사를 사용한다. 개발 편의성의 검증과 제품 보안·품질 검증을 구분한다. 선택한 모든 버전은 P0의 호환성 및 현재 advisory 검토 후 lockfile에 고정한다. 현재 저장소 버전 문자열을 그대로 안전한 최신 버전이라고 가정하지 않는다.

## 5. 목표 폴더 구조

아래는 최종 책임 배치다. 해당 기능을 구현할 때만 디렉터리를 만든다.

```text
apps/
  api/src/
    main.ts, app.module.ts          # 관리 HTTP composition root
    delivery-main.ts               # 공개 projection 전용 구성/credential
    http/<feature>/                # controller, transport mapper
  worker/src/                      # queue consumer entrypoint
  lab-cli/src/                     # JSONL/replay/experiment adapters
  web/src/
    app/                           # router, auth bootstrap, providers, shell
    pages/                         # 화면 조립
    features/<user-action>/        # 폼, 편집, 승인, 상태 수명
    entities/<entity>/             # query keys, query hooks, view model
    shared/                        # HTTP/date/error 등 기술 공통
packages/
  core/src/                        # 순수 계산과 판단 계약
  backend/src/
    modules/<bounded-feature>/
      domain/                      # 불변식·상태 전이
      application/                 # 명령·조회·조정
      ports/                       # DB/clock/provider 인터페이스
      infrastructure/              # Drizzle/provider/storage 구현
      <feature>.module.ts          # Nest 조립; 바깥의 composition 경계
    platform/                      # DB/auth/jobs/logging/config
  contracts/management/             # 관리 HTTP schema
  contracts/delivery/               # 외부 API schema; 별도 공개 빌드 가능
  editor-schema/                   # 저장 가능한 node/attrs/버전 계약
  ui/                              # Paper/Dark wrappers
```

작은 설정 조회까지 네 폴더를 의무 생성하지 않는다. 중요한 경계는 `controller → application → domain/core`, `infrastructure → port`, `web → HTTP contract`이다. API/worker는 backend package를 공유하고 서로의 앱 entrypoint를 import하지 않는다. web은 backend/ORM/core 실행 코드를 가져오지 않는다. 읽기 집계 SQL은 scope가 있는 read adapter에서 허용하지만 다른 모듈 소유 데이터를 임의로 변경하지 않는다.

**예: 기록 저장**은 HTTP 입력 확인→SaveCapture use case→repository transaction→revision/audit/receipt/outbox→저장 완료로 끝난다. worker의 판단 실패는 저장 응답을 취소하지 않는다. **예: 제안 승인**은 AcceptProposal use case→현재 권한/revision 검사→pure operation 검증→소속 변경+이력+무효화 transaction으로 끝난다.
