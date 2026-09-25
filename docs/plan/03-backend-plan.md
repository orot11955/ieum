# 03 · Backend 상세 실행 계획

## 책임

Backend는 인증된 사용자의 명시적 명령을 실행하고, 자료와 이력·권한·작업을 안전하게 보관한다. 의미 판단을 core에 맡길 때는 필요한 데이터를 먼저 scope 안에서 준비한다. 핵심은 단순 CRUD API의 개수가 아니라 **transaction·revision·source·공개 경계**다.

## 표준 기능 구현 순서

계약 테스트 작성→상태 전이·domain 테스트→migration/제약→repository→application command→HTTP controller→생성 client→web 통합→negative/E2E 순으로 닫는다. 각 모듈의 read model은 조회에 맞게 최적화할 수 있지만 다른 모듈의 상태를 SQL로 직접 변경하지 않는다.

```text
Controller: transport·입력·응답
Application: 현재 권한·명령·transaction·ports 조정
Domain/Core: 규칙과 계산
Infrastructure: Drizzle·storage·auth·model·queue 구현
```

클래스를 네 개로 나눈 것만으로 분리됐다고 보지 않는다. unit test에서 DB/framework 없이 상태 규칙을 실행할 수 있어야 하고, HTTP를 빼도 use case가 동작해야 한다. 조회 하나뿐인 간단한 기능에는 비어 있는 domain/repository 계층을 기계적으로 추가하지 않는다.

## 카드

<!-- GENERATED:TASKS:BE:START -->

### BE-01 · NestJS + Fastify 통합과 composition root

**구간:** P0 · **상태:** VERIFIED · **선행:** BASE-02

**구현 범위:** Nest의 module/provider/guard/filter와 FastifyAdapter를 최소 endpoint로 시험한다. packages/backend에 공유 use case를 두고 API/worker bootstrap에서 조립하는 경계를 만든다. tsconfig/decorator/ESM/build 호환성을 확인한다.

**입출력·데이터·코드 계약:** 위치: apps/api의 main/app module와 packages/backend의 실제 첫 module. controller는 DTO→command mapper만, domain/core는 Nest decorator를 import하지 않는다.

**필수 반례·검증:** 빌드 산출물 시작, graceful shutdown, request ID, validation error, provider override 테스트, Fastify plugin과 HTTP 응답 header 확인.

**완료 기준:** 같은 application use case를 HTTP 없이 테스트할 수 있다. Nest를 넣었다는 사실만으로 계층 분리 완료로 간주하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-01.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-02 · 인증 adapter의 실제 호환성 검증

**구간:** P0 · **상태:** VERIFIED · **선행:** BE-01, BASE-03

**구현 범위:** Better Auth+Drizzle+Fastify의 native handler 연동을 먼저 시험한다. Nest community wrapper는 기본 채택하지 않는다. 여러 Set-Cookie, body parsing, session 조회, 초대 제한, MFA 전후, cache-off 철회를 검증한다.

**입출력·데이터·코드 계약:** 산출물: auth-spike-report.md, 확정 auth schema mapping/버전/advisory 검토 기록. AuthPort를 통하여 업무 코드가 vendor session/credential 모델에 의존하지 않게 한다.

**필수 반례·검증:** 중복 body parse, login/logout/재설정, signup 우회 경로, MFA 미완료 세션, 다른 기기 철회, CSRF/Origin, 잘못된 proxy host, 복구 코드 재사용.

**완료 기준:** 필수 인증 시나리오를 실제 DB에서 통과한 adapter만 제품 경로로 승격한다. 실패하면 검증된 Fastify native auth 경계로 격리하거나 runtime adapter ADR을 수정하며 수제 인증은 만들지 않는다.

**이번 카드 제외:** 검증되지 않은 커뮤니티 wrapper를 필수 기반으로 고정; 자체 비밀번호 해시·세션 프로토콜 구현.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-02.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-03 · PostgreSQL migration·소유 범위·RLS

**구간:** P2 · **상태:** VERIFIED · **선행:** BE-02

**구현 범위:** 실제 PostgreSQL과 Drizzle migration을 도입한다. auth/vendor schema와 업무 schema를 구분한다. workspace 복합 FK/unique, runtime non-owner role, RLS 정책과 connection pool 경계를 구현한다.

**입출력·데이터·코드 계약:** 위치: backend/platform/database, db/migrations. migration/admin, application, delivery 역할을 분리한다. transaction 안에서 scope를 설정하고 빠진 scope는 fail closed한다.

**필수 반례·검증:** Testcontainers 실제 PG에서 두 workspace 교차 SELECT/INSERT/UPDATE/link 금지; 테이블 owner/BYPASSRLS 금지 확인; pool 재사용 scope 누수; 빈 DB와 이전 schema upgrade.

**완료 기준:** 애플리케이션 권한 검사와 DB 제약이 각각 동작하며 PGlite 결과만으로 RLS/락 검증을 대체하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-03.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-04 · 계정·개인 공간·초대·세션·복구

**구간:** P2 · **상태:** VERIFIED · **선행:** BE-03

**구현 범위:** 일회성 bootstrap, User/Workspace/Owner/Operator, 초대 수락, 로그인·로그아웃·세션 철회·복구·MFA·시간대 설정을 구현한다. 공개 signup은 끄고 초대받은 사람에게 별도 개인 공간을 만든다.

**입출력·데이터·코드 계약:** 모듈: identity/workspace. /me, /me/sessions, /me/preferences, 필요한 인증 endpoint. 공개 회원 가입·협업 grant는 제공하지 않는다. 기본 설정에서 외부 모델 전송을 끈다.

**필수 반례·검증:** bootstrap 동시 실행, 초대 만료/재사용, 마지막 owner/operator 보호, 정지 직후 접근 차단, 메일 없는 복구 정책, 비밀값 로그/응답 금지.

**완료 기준:** 두 사용자가 로그인하더라도 서로의 자료를 보지 못한다. Operator 역할만으로 타인 원문을 읽을 수 없다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-04.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-05 · 업무 명령·멱등성·충돌·감사

**구간:** P2 · **상태:** VERIFIED · **선행:** BE-04, BASE-03

**구현 범위:** 명시적 command handler, transaction coordinator, optimistic revision, idempotency receipt, audit를 구현한다. 성공 receipt 조회 전에도 현재 권한을 확인한다. outbox 계약을 두되 queue 구현은 첫 비동기 기능에서 한다.

**입출력·데이터·코드 계약:** 키는 workspace+actor+command kind+idempotency key, payloadHash 포함. 같은 key/다른 payload는 409. 변경·감사·receipt·필요 outbox가 같은 transaction에 들어간다.

**필수 반례·검증:** 동일 요청 동시 재전송, key 충돌, commit 뒤 응답 유실, transaction 중 권한 철회 경쟁, 감사 insert 실패, deadlock retry, 오래된 revision.

**완료 기준:** 부분 적용 없이 한 번의 업무 효과와 재시도 가능한 응답이 보장된다. 외부 네트워크 요청을 DB transaction 안에 넣지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-05.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-06 · pg-boss worker·transactional outbox

**구간:** P4 · **상태:** VERIFIED · **선행:** BE-05

**구현 범위:** PostgreSQL 기반 queue를 사용하여 판단·profile·export 등 필요한 비동기 작업을 처리한다. 같은 transaction enqueue adapter를 검증하고 실패하면 outbox relay 방식을 쓴다. 외부 부작용에는 중복 실행 가능성을 전제로 한다.

**입출력·데이터·코드 계약:** 위치: backend/platform/jobs + apps/worker. payload에는 workspace/actor/resource revision/job type/idempotency 정보; 원문은 가능한 넣지 않고 권한 내 재조회. QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED와 retry budget.

**필수 반례·검증:** commit 직후 프로세스 종료, enqueue 후 receipt 유실, worker 재시작/중복, lease 만료, 독성 job, 삭제된 source, actor 정지, 취소 뒤 늦은 완료.

**완료 기준:** 저장 성공 후 분석이 누락되지 않으며 재시도해도 제안/문서가 중복 생성되지 않는다. queue의 전달 보장을 외부 모델/메일의 exactly-once 효과로 확대하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-06.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-07 · Capture·원본 revision·ThoughtUnit

**구간:** P3 · **상태:** VERIFIED · **선행:** BE-05, CORE-01

**구현 범위:** 기록 생성/조회/수정/보관과 불변 raw revision을 구현한다. 기본 unit 생성과 사용자의 span 기반 수동 분할을 제공한다. 출처 metadata와 sourceKey 중복 수집을 처리한다.

**입출력·데이터·코드 계약:** 모듈: captures/sources. POST/GET captures, POST revisions, POST units/split. capture_revision과 unit_revision의 workspace+revision FK; 현재 pointer만 갱신하고 과거 revision은 유지.

**필수 반례·검증:** 원문 수정 후 과거 unit/출처 참조 유지, 동시 편집 409, 같은 텍스트의 다른 입력 보존, sourceKey 중복 요청, 비공개 원문 로그 없음.

**완료 기준:** 기록 원문과 파생 단위가 실제로 분리 저장되고 수정·분할 이력을 다시 열 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-07.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-08 · Context·다중 소속·관계·대표 맥락

**구간:** P3 · **상태:** VERIFIED · **선행:** BE-07

**구현 범위:** name/purpose/scope/kind/state를 가진 context와 unit membership을 구현한다. secondary 여러 개, active primary 최대 1개, approved relation type/direction을 관리한다. rename/archive/supersede를 구분한다.

**입출력·데이터·코드 계약:** 모듈: knowledge. context/membership/relation command와 scoped read model. primary 이동은 하나의 transaction; 다른 모듈 테이블을 직접 수정하는 범용 service는 금지.

**필수 반례·검증:** 동시 primary 변경, 같은 pair 중복, cross-workspace 연결, parent cycle, 반박을 비관련으로 처리하는 오류, 보관 맥락 재검색.

**완료 기준:** 한 기록을 여러 목적에서 재사용할 수 있으며 primary를 비워 둘 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-08.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-09 · 할일·상태 전이·결과 기록

**구간:** P3 · **상태:** VERIFIED · **선행:** BE-07, BE-08

**구현 범위:** 할일 생성/편집/기한/보류/완료/재개/취소와 activity result→새 capture 연결을 구현한다. 사용자의 명시적 action과 추출 origin을 구분한다.

**입출력·데이터·코드 계약:** 모듈: planning/tasks. TODO/IN_PROGRESS/ON_HOLD/DONE/CANCELED; due NONE/DATE/INSTANT. 완료 명령은 필요한 필드만 받고 본문·기한 전체를 낡은 폼 값으로 재전송하지 않는다.

**필수 반례·검증:** 완료 연속 클릭, 동시 수정, 재개 이력, 날짜형/시각형 기한 보존, 결과 중복 저장, 원문 변경 후 DONE 유지.

**완료 기준:** 기록→행동→결과→새 기록이 연결되며 Core OFF에서도 전 기능이 작동한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-09.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-10 · 일정·시간대·종일·변경·취소

**구간:** P3 · **상태:** VERIFIED · **선행:** BE-05, BE-07

**구현 범위:** 시간 지정 일정과 종일 날짜 범위를 다른 타입으로 구현한다. 조회 기간·시간대·변경·취소·겹침 표시용 응답을 제공한다. 상대 날짜 해석은 명시적 확정 전 저장하지 않는다.

**입출력·데이터·코드 계약:** 모듈: planning/calendar. timed는 UTC instant+IANA timezone, all-day는 date와 exclusive end. 날짜 입력이 바뀌면 DST의 존재하지 않는/중복 local time을 판별한다.

**필수 반례·검증:** end<=start, 종일 하루, 서울/다른 시간대 표시, DST gap/fold, 월 경계, 취소/복구, 기간 조회 경계, timezone 없는 모델 후보.

**완료 기준:** 저장된 일정 시각이 브라우저 환경에 따라 조용히 바뀌지 않고 사용자가 바꾼 시각·시간대가 보존된다.

**이번 카드 제외:** 반복 일정·Google Calendar 동기화·자연어 입력 무확인 자동 등록.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-10.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-11 · 위키·문서 공통 draft/revision 엔진

**구간:** P3 · **상태:** VERIFIED · **선행:** BE-05, FE-02

**구현 범위:** Wiki/Article/Note의 공통 document identity와 mutable draft, immutable revision을 구현한다. autosave는 baseVersion을 검사하고 seal/restore는 새 revision으로 처리한다. 위키 내부 링크와 역링크를 관리한다.

**입출력·데이터·코드 계약:** 모듈: documents. Tiptap JSON+schemaVersion이 편집 정본; plain text/search/HTML/Markdown은 파생 표현. 안정적 blockId와 변경된 claim의 invalidation 계약을 둔다.

**필수 반례·검증:** 두 탭 저장 충돌, 응답 순서 역전, 빈 문서, 지원하지 않는 node/schema, 불변 revision 수정 거부, 내부 링크 삭제, 복원 시 현재 draft 보존.

**완료 기준:** 위키 단계부터 유실 없는 저장과 충돌 처리가 작동하며 문서 작업실이 별도 저장 엔진을 만들지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-11.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-12 · snapshot builder·profile·판단 job 연결

**구간:** P4 · **상태:** VERIFIED · **선행:** BE-06, BE-07, BE-08, CORE-06

**구현 범위:** 권한과 recordedAt으로 DB 데이터를 배치 조회해 core snapshot을 만든다. membership/source/model 변경 시 profile watermark와 embedding cache를 무효화한다. 판단 요청은 202 job 응답으로 저장과 분리한다.

**입출력·데이터·코드 계약:** 모듈: judgement/application + infrastructure. snapshot/input/config hash, eligible counts, candidate truncation, stage latency 기록. 긴 feature 계산과 provider 호출은 transaction 밖; 저장 전 revision 재검사.

**필수 반례·검증:** 최신 자료가 과거 snapshot에 유입, 삭제 뒤 cache 재등장, LIMIT으로 후보가 잘리는 경우 표시, profile 지연, 연속 수정, 권한 없는 embedding 조회.

**완료 기준:** lab과 제품이 동일 core를 호출하고 제품 run도 저장 feature로 replay할 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-12.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-13 · 제안·노출·피드백·승인 적용

**구간:** P4 · **상태:** VERIFIED · **선행:** BE-12, BE-05, CORE-05

**구현 범위:** 후보 조회와 영속 Proposal을 구분한다. 제안 노출, 수락/거절/닫기, stale, expire를 구현한다. exact unit revision과 context version을 대상으로 승인한 membership 변경만 적용한다.

**입출력·데이터·코드 계약:** 모듈: judgement/proposals. POST proposals/{id}/accept|reject|dismiss. pending→accepted/rejected/dismissed/expired/superseded. stale는 409와 최신 preview 필요 상태; 작업 receipt와 함께 반환.

**필수 반례·검증:** 캡처의 첫 unit 임의 선택 금지, 중복 승인, 수정된 대상, 노출되지 않은 피드백, primary 변경≠관련성 거절, 승인 중 대상 삭제.

**완료 기준:** 제안의 승인이 사용자에게 보인 정확한 변경과 일치하고 오래된 제안은 부분 적용되지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-13.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-14 · 추출 후보 승인→업무 항목 생성

**구간:** P4 · **상태:** VERIFIED · **선행:** BE-13, BE-09, BE-10, CORE-11

**구현 범위:** 허용된 추출 provider/파서를 application adapter로 호출한다. 후보별 source revision과 unresolved field를 보존하고 사용자가 편집한 승인 payload를 기존 Task/Event/Unit 명령으로 변환한다.

**입출력·데이터·코드 계약:** 모듈: extraction. dedupe는 source revision+stable proposal fingerprint+target kind 기준. 새 원문 revision의 의미적으로 비슷한 후보는 기존 항목과 비교·경고하며 원문 변경이 완료 상태를 덮지 않는다.

**필수 반례·검증:** 동일 후보 반복 승인, 다른 텍스트인데 비슷한 task, 시간대 미확정, 기존 task 이미 완료, 모델 timeout/invalid JSON, 허용되지 않은 데이터 외부 전송.

**완료 기준:** 자유 기록이 관리 항목으로 이어지되 확정 전에는 생성하지 않고 중복과 생명주기를 제어한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-14.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-15 · 구조 변경의 원자적 적용과 역변경

**구간:** P5 · **상태:** VERIFIED · **선행:** BE-13, BE-08, CORE-13

**구현 범위:** 분리·병합·parent/link 변경 preview와 승인 transaction을 구현한다. 영향을 받는 entity를 안정된 순서로 잠그고 전체 baseRevisions를 검사한다. 기존 context는 superseded로 남긴다. 원본에 소속이 남는 분리는 ACTIVE를 유지하고, 완전 분리·병합은 원본을 SUPERSEDED로 보존한다. 복수 후속 Context는 별도 이력으로 남긴다.

**입출력·데이터·코드 계약:** 모듈: knowledge/structure. MutationLog before/after mapping, profile invalidation 및 job 등록을 원자적으로 기록한다. Undo는 영향 범위의 inverse command이며 전체 DB restore가 아니다. Undo는 바뀐 소속·관계만 역적용하며 이후 생긴 기록을 보존한다. 후속 변경이 있으면 새 inverse preview를 요구한다.

**필수 반례·검증:** 중간 실패 rollback, stale mapping, 두 구조 변경 경쟁, bridge 유지, 변경 후 새 기록 추가 뒤 Undo, 과거 문서 source 조회, primary unique. 잔여/완전 분리의 상태와 복수 후속 이력, 과거 identity revision 조회.

**완료 기준:** 변경 전후와 되돌릴 수 없는 충돌이 드러나며 이후 생긴 기록을 삭제하지 않는 역변경이 작동한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-15.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-16 · 자료 묶음·출처 고정·문서 작업실

**구간:** P6 · **상태:** VERIFIED · **선행:** BE-11, BE-07, BE-08, CORE-14

**구현 범위:** 기록/위키/결과/외부 자료를 선택해 evidence pack을 저장하고 문서와 연결한다. 목적·독자·관점·outline·source claim mapping과 source stale/unresolved 알림을 구현한다.

**입출력·데이터·코드 계약:** 모듈: documents/workbench. source pack revision 및 문서별 immutable reference manifest. 외부 자료는 URL·저자·발행일·사용자 제공 발췌로 시작; 임의 URL 자동 fetch는 기본 off.

**필수 반례·검증:** 출처 수정/삭제, 다른 workspace source, 같은 원문 재인용, 문서 draft 수정 후 mapping 재검토, 과거 pack 불변.

**완료 기준:** 자신의 경험과 외부 관점을 근거로 재사용하고 출처를 잃지 않은 문서 초안을 수동으로 완성할 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-16.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-17 · 선택적 모델 정제 adapter·비용·실패 격리

**구간:** P6 · **상태:** VERIFIED · **선행:** BE-16, BE-06, CORE-15

**구현 범위:** 하나의 허용 provider부터 outline/문장 정제/초안 생성에 연결한다. 입력 source allowlist, 외부 전송 opt-in, timeout/token·비용 budget, 취소, model/prompt revision을 둔다. 사용자 문서를 즉시 교체하지 않는다.

**입출력·데이터·코드 계약:** 모듈: generation adapter 및 job. 모델에는 텍스트와 허용 source ID만 전달; DB·파일·임의 tool 권한 없음. 결과는 generation artifact와 diff로 저장한 뒤 별도 apply command.

**필수 반례·검증:** provider 불가, source 내 지시, hallucinated source, 무한 retry, 예산 초과, 실행 중 draft 수정, 비밀/prompt 본문 로그 유출.

**완료 기준:** 모델이 꺼져도 pack·문서 편집·발행 준비가 유지되며 생성 결과 채택은 명시적 변경으로 남는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-17.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-18 · 비공개 첨부·안전 검증·공개 파생물

**구간:** P6 · **상태:** VERIFIED · **선행:** BE-05, BE-11, BE-06

**구현 범위:** 파일 업로드/검증/다운로드/사용처를 구현한다. 초기 허용 형식을 텍스트·검증 가능한 이미지로 제한하고 크기·MIME·확장자·경로·메타데이터를 검사한다. private 원본과 public derivative를 분리한다.

**입출력·데이터·코드 계약:** 모듈: assets, AssetStoragePort. PENDING→VERIFIED/REJECTED; 검증 전 문서 사용/공개 불가. content hash와 reference manifest를 기록하고 저장소 파일명은 서버가 생성.

**필수 반례·검증:** path traversal, fake MIME, SVG/HTML script, 큰 이미지/압축 폭탄, 다른 사용자 다운로드, EXIF 등 공개 metadata, 사용 중 asset 삭제.

**완료 기준:** 원본 URL이 그대로 외부에 공개되지 않으며 승인할 공개 파생물이 미리보기와 동일하다.

**이번 카드 제외:** 임의 실행 파일·무제한 ZIP/PDF 수집·자동 웹 크롤러.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-18.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-19 · 봉인·검토·발행·개정·철회

**구간:** P7 · **상태:** VERIFIED · **선행:** BE-16, BE-18, BE-05

**구현 범위:** 문서 seal→공개 manifest→검토 READY→Publish를 구현한다. READY는 정확한 body/source/public-asset/policy hash에 묶고 발행 순간 권한과 유효성을 재검사한다. 공개본은 별도 immutable projection으로 만든다.

**입출력·데이터·코드 계약:** 모듈: publishing. publication identity와 immutable public revisions, current pointer, slug/alias namespace, review record. draft 변경은 공개본을 수정하지 않으며 새 발행 명령으로만 current를 이동한다.

**필수 반례·검증:** 검토 뒤 본문/출처/asset 변경, 중복 발행, slug 동시 충돌, 발행과 철회 경쟁, private 필드·내부 ID·source pack 유입, stale READY, Core/worker 불가 중 명시적 발행.

**완료 기준:** 미리 검토한 것만 발행되고 철회한 revision/alias/asset의 제공 중단 규칙이 원자적으로 적용된다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-19.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-20 · Delivery 전용 API·읽기 권한·클라이언트

**구간:** P7 · **상태:** PLANNED · **선행:** BE-19, BASE-03

**구현 범위:** 관리 API와 분리된 public projection 전용 module/bootstrap·DB role을 구성한다. 목록/상세/개정/철회 계약, client credential 발급·회전·폐기, pagination·ETag·cache 정책을 구현한다.

**입출력·데이터·코드 계약:** apps/api/delivery-main 및 contracts/delivery. private table SELECT 권한 없음. 기본은 외부 블로그 서버의 제한된 credential; 브라우저에 secret 노출 금지. 공개 익명 모드는 별도 정책으로만 활성화.

**필수 반례·검증:** Delivery credential로 관리 API 접근, 미발행/철회/이전 alias 조회, 공개 asset 제공 중단, 잘못된 cache 304, key 철회, 독립 소비자의 schema 테스트.

**완료 기준:** 이음 DB·ORM·세션·내부 UI를 모르는 외부 소비자가 승인된 글만 표시할 수 있다. 이미 다운로드/정적 빌드된 외부 사본을 강제로 회수한다고 약속하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-20.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-21 · 개인 Import/Export·dry-run·중복 처리

**구간:** P8 · **상태:** PLANNED · **선행:** BE-07, BE-11, BE-18, BE-06

**구현 범위:** 버전 있는 JSON/Markdown export와 manifest/asset hash를 구현한다. import는 validate→dry-run→사용자 확인→적용 순서로 진행하며 충돌/중복/참조 누락을 보고한다. 명시적 같은 사용자의 로컬 데이터만 취급한다.

**입출력·데이터·코드 계약:** 모듈: data-transfer. import run/row 상태와 제한된 staging; export 파일 만료·권한 재검사. 개인 Export는 서버 auth DB 전체 Backup과 다르다.

**필수 반례·검증:** 경로 탈출·과대 파일·지원하지 않는 schema, 일부 오류, 동일 bundle 두 번 import, source FK 실패, 작업 중 account 정지, export 다운로드 만료.

**완료 기준:** 사용자가 데이터를 다른 환경으로 이식하고 결과/실패를 검증할 수 있다. 성공 행과 실패 행을 모두 성공으로 표시하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-21.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-22 · 휴지통·복원·삭제 영향·영구 삭제

**구간:** P8 · **상태:** PLANNED · **선행:** BE-07, BE-08, BE-11, BE-18, BE-19

**구현 범위:** 각 기능의 soft delete를 통합 조회하고 복원/참조 영향/재인증 후 purge를 구현한다. 원문 제거 시 profile/vector/cache/export 잔존과 문서 unresolved source를 정리한다. 공개본 철회 여부는 별도 명시 정책으로 처리한다.

**입출력·데이터·코드 계약:** 모듈: data-lifecycle. 삭제 계획 manifest와 tombstone을 사용한다. 원본 보존 불변식은 사용자의 삭제 권리를 막는 규칙이 아니다.

**필수 반례·검증:** 삭제한 source의 worker 재생성, 복원 slug 충돌, 연결 대상 삭제, 공개본 별도 보존 여부, purge 중 실패, backup retention 후 복구로 삭제본 재등장.

**완료 기준:** 삭제의 영향과 남는 범위를 사전에 보여주고 복원/영구삭제가 실제 참조와 일치한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-22.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-23 · 운영·계정 관리·작업·설정·알림

**구간:** P8 · **상태:** PLANNED · **선행:** BE-04, BE-06, BE-20

**구현 범위:** Operator의 초대/정지/운영 상태, owner의 job retry/cancel·선호 설정·노출 빈도를 구현한다. 로그는 request/run/command ID와 상태·원인 코드 중심이며 본문과 credential은 마스킹한다.

**입출력·데이터·코드 계약:** 모듈: operations/notifications. W22–W27은 구현된 capability만 보여준다. 진행률을 모르는 job에 가짜 퍼센트를 붙이지 않는다. 고급 협업 권한 편집은 없다.

**필수 반례·검증:** 운영자 타인 본문 열람 금지, 마지막 operator 정지, 실패 job 재시도 권한, 민감 로그 마스킹, 오래된 health 정보, 알림 반복 억제.

**완료 기준:** 사용자가 장애 원인과 후속 조치를 이해하고 운영 역할이 개인 자료 권한을 우회하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-23.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-24 · 배포·백업·복원·migration 복구

**구간:** P8 · **상태:** PLANNED · **선행:** BE-21, BE-22, BE-23

**구현 범위:** Compose 기반 API/worker/PostgreSQL/파일 volume 배포를 정리한다. DB+assets+schema/config manifest의 일관된 backup, 깨끗한 다른 환경 restore, 키 보관·복구와 삭제/철회 reconciliation을 구현한다.

**입출력·데이터·코드 계약:** 산출물: deploy/runbook, backup manifest, restore report. source rollback과 schema rollback을 구분하고 파괴적 down migration을 자동 실행하지 않는다. API와 worker compatible rollout 순서를 정한다.

**필수 반례·검증:** 빈 환경 restore, 누락 asset/hash mismatch, backup 시점 중 write, migration 실패, 오래된 backup 복원 후 철회 재등장 차단, 모델 서버 미접속.

**완료 기준:** 복원된 계정·자료·문서·공개본을 실제 조회하고 무결성을 검증한다. backup 파일 생성만으로 완료 처리하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-24.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-25 · 성능·관측·병목 최적화

**구간:** P9 · **상태:** PLANNED · **선행:** BE-12, BE-20, BE-24

**구현 범위:** 실측 p50/p95/p99, DB query 수, queue wait, core 단계 지연, 메모리·비용을 측정한다. N+1, pagination, cache invalidation, upload limits를 점검한다. exact reference와 비교해 필요한 경우에만 pgvector ANN을 추가한다.

**입출력·데이터·코드 계약:** 산출물: 환경/데이터 규모/동시성 명시 benchmark report, health/metrics와 resource budget. 원문 전체나 사용자별 민감 내용을 metrics label에 넣지 않는다.

**필수 반례·검증:** 두 workspace 혼합 부하, queue 밀림 속 CRUD, 큰 문서/긴 목록, filtered ANN recall, DB pool 고갈, cache stampede, graceful shutdown.

**완료 기준:** 병목과 실제 수치가 공개되고 목표 미달 원인을 추적할 수 있다. 구조만 보고 처리량·지연을 보장하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-25.md`. 테스트 작성과 실제 실행을 구분한다.

### BE-26 · 통합 검색·필터·안전한 read model

**구간:** P4 · **상태:** PLANNED · **선행:** BE-07, BE-08, BE-09, BE-10, BE-11, CORE-04

**구현 범위:** 기록/맥락/위키/문서/할일·일정의 권한 내 검색과 필터·정렬·cursor pagination을 구현한다. 일반 탐색 검색과 core 추천을 별도 use case로 둔다. PG lexical adapter는 lab TF-IDF와 동일 알고리즘이라고 주장하지 않는다.

**입출력·데이터·코드 계약:** 모듈: search. GET search?q&type&cursor, scope 선필터, allowlisted snippet/highlight, 결과 count의 공개 범위. 필요시 pg_trgm/FTS, semantic adapter는 이후 개선.

**필수 반례·검증:** 권한 없는 결과·개수·snippet, 삭제 반영, IME query, 특수문자, cursor 변조, 중복/누락 pagination, source 부분 실패.

**완료 기준:** Core 추천 모드가 꺼져 있어도 자신의 자료를 검색할 수 있고 모든 결과가 상세 접근 권한과 일치한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/be-26.md`. 테스트 작성과 실제 실행을 구분한다.

<!-- GENERATED:TASKS:BE:END -->
