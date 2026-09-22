# 웹 애플리케이션 구조 · 화면 · API · 데이터 계약

- 개정: 2026-09-22
- 상태: 제품 구현 설계. 폴더·API·타입은 구현할 계약이며 현재 실행 코드는 없다.
- 범위: [웹 기능 명세](../product/web-functional-spec.md)의 F/P/D/R.

## 1. 배포와 모듈

처음 제품은 **모듈형 모놀리스**다. React/Vite 내부 웹, Fastify 관리/Delivery API, PostgreSQL, 파일 저장소, 같은 코드베이스의 worker로 시작한다. worker 분리는 실행 자원과 작업 수명 때문이지 독립 microservice를 만들기 위해서가 아니다. Redis, Kafka, Elasticsearch, 외부 vector DB는 필수 의존성이 아니다.

관리 웹과 관리 API는 reverse proxy에서 같은 origin으로 제공하는 것을 기본안으로 한다. 외부 블로그는 별도 앱이며 공개 Delivery route만 소비한다. 내부 관리 라우트를 단지 URL prefix가 다르다는 이유로 외부에 모두 노출하지 않는다.

제품 단계의 목표 구조:

```text
apps/web/src/
  app/             # router, auth bootstrap, providers, shell
  pages/           # 화면 조립
  features/        # capture/task/wiki/document/publishing 등 사용자 작업
  entities/        # 도메인별 client model과 조회 경계
  shared/          # UI primitive, HTTP, date/format, 오류 표현
apps/api/src/
  modules/         # 아래 업무 모듈: http/application/domain/infrastructure
  platform/        # config, auth adapter, DB, logging, jobs
apps/worker/       # 같은 application service를 쓰는 작업 entrypoint
apps/lab-cli/      # 기존 판단 실험 도구
packages/core/     # 순수 판단 계산; 제품 서버를 참조하지 않음
packages/contracts/ # 관리/Delivery schema 분리; ORM 타입 미노출
```

폴더는 구현하는 모듈만 만든다. 모든 작은 기능에 위 네 계층을 기계적으로 생성하지 않는다. UI, application, domain 규칙과 infrastructure의 의존 방향을 지키는 것이 목적이다. Core의 Framework/DB 독립성은 유지한다.

업무 모듈은 Identity, Workspace, Capture/Source, Planning(Task/Event), Knowledge(Context/Wiki), Documents, Publishing/Delivery, Assets, DataTransfer, Judgement, Notifications, Operations로 구분한다. 직접 다른 모듈의 테이블을 무제한 수정하지 않고 소유 서비스의 명령을 호출한다. 복잡한 범용 Repository/Service framework를 먼저 만들지 않는다.

## 2. 요청 처리 순서

```text
UI 이벤트 / HTTP 요청
 → request ID·body limit·rate limit
 → session/credential 검증과 계정 상태
 → 입력 schema와 workspace membership 확인
 → 요청 action/resource 정책 확인
 → application command
 → transaction 안에서 현재 권한·revision·도메인 전이 재검사
 → 데이터 변경 + 감사 사건 + 필요한 outbox/job 등록
 → commit → 허용된 DTO 응답
 → worker가 후속 파생 작업 수행
```

트랜잭션에서 현재 membership/authzVersion을 확인해 최초 HTTP 검사 이후의 권한 변화도 처리한다. 권한 없는 리소스의 상세 존재를 드러내는 응답은 피하고 정책을 일관되게 적용한다. 조회 요청도 동일한 범위와 읽기 권한을 적용한다.

Core 호출 경로는 자료 읽기·feature 준비·후보 검색을 application/adapter에서 수행한 뒤, 권한 내 snapshot으로 계산한다. 기록 저장 성공을 Core 응답 성공과 묶지 않는다. 의미 제안은 Proposal이고 사용자 명령 적용은 application service의 일이다.

## 3. 프론트 상태와 재사용 기준

서버 상태는 도메인별 Query 계층으로 관리한다. 조회 key에는 사용자/Workspace/필터/리소스 ID를 포함하고 logout/공간 전환/권한 변경 때 관련 cache를 폐기한다. 서버가 권한으로 막아도 이전 사용자의 client cache가 잠깐 보이지 않아야 한다.

폼 편집 상태는 화면 또는 해당 feature의 hook이 가진다. 목록 필터·정렬·선택한 탭은 URL로 복원하고, modal 열림 같은 단기 상태는 local state로 둔다. 전체 앱 global store에 원문·초안·권한·모든 화면 상태를 복제하지 않는다.

hook 분리는 생명주기와 사용자 동작이 독립적인 경우에 한다. 예: `useDocumentDraft`는 저장·dirty·충돌 상태, `useWorkspacePermissions`는 서버가 준 능력의 UI 표시, `useCaptureQuery`는 조회와 캐시를 맡는다. 하나의 거대한 page hook이나 아주 작은 setter hook 수십 개를 기본 패턴으로 삼지 않는다.

UI의 permission hook은 버튼 표시용이다. publish와 삭제를 허용하는 최종 근거는 서버다. 권한·자격증명을 localStorage에 저장해 신뢰하지 않는다. 첫 제품은 개인 본문의 service worker/offline cache를 기본 비활성으로 한다.

## 4. 공통 화면 계약

리스트는 loading/empty/loaded/error/forbidden, 폼은 pristine/dirty/saving/saved/conflict/error 상태를 표현한다. empty에는 첫 행동을, error에는 requestId와 재시도를, forbidden에는 안전한 이동 경로를 제공한다. 내부 stack trace는 표시하지 않는다.

삭제·권한 상승·발행·영구 삭제는 위험도를 다르게 표시한다. 일상적인 수정마다 modal을 요구하지 않되 되돌릴 수 없는 동작에는 대상·영향·확인과 필요한 재인증을 사용한다. 일괄 작업은 전체 성공인 척하지 않고 대상별 성공/실패를 표시한다.

자동저장 요청은 debounce와 순서를 제어하고 더 오래된 응답으로 최근 편집을 덮어쓰지 않는다. unload 보호는 보조이며 실제 저장 성공은 서버 응답으로 판단한다. 세션 만료 시 본문을 보존해 같은 사용자 재인증 후 복구하되 명시적 logout 때는 로컬 비공개 흔적을 정리한다. 기기 디스크에 초안을 보존하는 기능은 후속 명시적 opt-in이다.

목록·상세는 모바일에 대응하되 편집기의 기능을 억지로 표에 끼워 넣지 않는다. 기본 폼 label, focus·키보드 이동, 오류 안내, 대비를 검증한다. 테스트 목표는 [WCAG 2.2](https://www.w3.org/TR/WCAG22/)의 관련 AA 항목이다.

## 5. 업무별 생명주기

| 대상 | 기본 상태/전이 | 핵심 제약 |
| --- | --- | --- |
| Capture | active → archived / trashed → restored / purged | raw revision은 정제본으로 덮어쓰지 않음 |
| Task | TODO ↔ IN_PROGRESS ↔ DONE, CANCELED | completedAt은 완료 시점; 재개도 이력 |
| Event | CONFIRMED → CANCELED | timed 또는 all-day 중 하나; end > start |
| Context | ACTIVE / ARCHIVED / SUPERSEDED | 이름 변경과 ID 유지; 다중 membership |
| Wiki | active / archived / trashed + draft/revision | 링크 깨짐과 근거 stale을 표시 |
| Document | editable draft → sealed revision → READY 또는 CHANGES_REQUIRED | 검토는 특정 revision에만 유효 |
| Publication | PUBLISHED → WITHDRAWN, 새 revision으로 개정 | draft 변화와 독립된 공개 snapshot |
| Proposal | pending → accepted/rejected/dismissed/expired/superseded | 재적용 idempotent; base revision 확인 |
| Asset | PENDING → VERIFIED / REJECTED → TRASHED | 검증 전 사용/공개 금지 |
| Job | QUEUED → RUNNING → SUCCEEDED/FAILED/CANCELED | lease·attempt·idempotency; exactly-once 주장 없음 |

일정의 timed instant는 UTC+timestamptz와 IANA timezone을 저장한다. 종일은 날짜 범위로 저장하며 종료일 배타 여부를 계약에 고정한다. 할일 기한은 date-only와 timed deadline을 구분한다. 시간대 없는 `내일 오후`를 모델이 임의 instant로 확정하지 않는다. 반복 일정과 DST 예외 처리는 후속 별도 검증 전까지 끈다.

문서 READY는 사실 정확도 인증이 아니라 사용자의 공개 검토 상태다. 편집하면 새 draft가 생기고 기존 READY revision이나 공개 snapshot을 수정하지 않는다. 승인이 필요한 기능도 1인 모드에서는 본인이 검토·발행할 수 있어야 하며 불필요한 2인 승인 체계를 강제하지 않는다.

## 6. 제품 데이터 모델의 추가 범위

공통 business row에 `id, workspace_id, created_by, created_at, updated_at, version, deleted_at?`를 둔다. 불변 revision에는 수정·삭제 의미를 다르게 적용한다. 소유 범위와 출처는 [기록 도메인](domain-model.md) 및 [인증·권한](identity-and-access.md)에 따른다.

| 묶음 | 논리 테이블 | 주요 관계/제약 |
| --- | --- | --- |
| 인증 | auth_user, credential/account, session, verification, mfa, invitation | 선택 라이브러리 schema를 확인; 제품 table과 매핑 |
| 소유 | workspace, workspace_member, capability_grant | 초기 1 user–1 personal workspace; last-owner 보호 |
| 기록 | capture/revision, thought_unit/revision, source, context, membership, relation | 같은 Workspace composite FK, 원문 span |
| 실행 | task, task_event_link, calendar_event, activity_result | unit/source refs; 중복 추출 승인 unique |
| 문서 | document(kind=wiki/article/note), document_draft, document_revision, source_link | draft optimistic version; revision 불변 |
| 발행 | publication, publication_revision, delivery_client | channel/slug unique, current 공개 revision |
| 첨부 | asset, asset_usage, public_asset_projection | private 원본과 공개 파생물 분리 |
| 판단 | judgement_run, proposal, feedback, feature/profile | 현재 source revision과 model/config manifest |
| 작업 | job, outbox_event, notification, export/import_run | Workspace·actor·권한 재검사 |
| 운영 | audit_event, security_event, system_setting, backup_manifest | 콘텐츠 본문 대신 허용된 메타데이터 |

첫 구현에서 모든 테이블을 생성하지 않는다. 해당 제품 단계가 사용하는 스키마와 제약만 migration한다. 위키/글의 공통 revision 엔진은 재사용하되 Task/Event를 범용 document JSON으로 만들지 않는다. source link의 임의 resource_type/id가 FK 없이 고아로 남지 않게 대상별 FK 또는 제한된 link table로 구현한다.

공개 발행과 원문을 다른 schema/table/DTO로 읽게 한다. 공개 schema에 임의 내부 문서 조회 join을 허용하지 않는다. publication 승인 생성 시 내용과 첨부를 명시적으로 선택한다.

## 7. API 계약 초안

실제 OpenAPI 파일은 구현 단계 산출물이다. 관리 API와 Delivery API의 schema·인증·오류 예시는 별도로 작성한다. 표는 앱 명령 예시이며 인증 라이브러리의 실제 endpoint 이름까지 새로 정의하는 것은 아니다.

| 묶음 | 예시 경로/동작 | 주요 검사 |
| --- | --- | --- |
| 자기 계정 | GET `/api/v1/me`, `/api/v1/me/sessions` | 현재 account/session, 안전한 DTO |
| 회원 | GET `/api/v1/admin/users`, POST `.../invitations`, `.../users/{id}/suspend` | ops.users.manage, 재인증, 감사 |
| 공간 | GET `/api/v1/workspaces/{wid}/capabilities` | membership 검증; 운영자 우회 없음 |
| 기록 | GET/POST `/api/v1/workspaces/{wid}/captures` | source/size/schema, scope |
| 실행 | POST `.../tasks`, PATCH `.../tasks/{id}`, POST `.../events` | version, 도메인 전이, 감사 |
| 위키·글 | GET/POST `.../documents`, PUT `.../documents/{id}/draft` | kind, baseVersion, body limit |
| revision | POST `.../documents/{id}/revisions`, `.../revisions/{rid}/ready` | 현재 draft snapshot, 검토권한 |
| 발행 | POST `.../publications`, `.../publications/{id}/revise`, `.../withdraw` | publish capability, READY revision, 공개 검사 |
| 제안 | GET `.../proposals`, POST `.../proposals/{id}/accept` | idempotency, current permission/revision |
| 자료 | POST `.../assets`, GET `.../assets/{id}/download` | 허용 포맷·범위; private 다운로드 인증 |
| 데이터 | POST `.../imports`, `.../exports`, `.../trash/{id}/restore` | 검증 preview, scope, 재인증 조건 |
| 작업 | GET `.../jobs/{id}`, POST `.../jobs/{id}/retry` | actor/workspace, retry 가능 여부 |
| 로그 | GET `.../audit-events`, GET `/api/v1/admin/security-events` | 별도 로그 읽기 권한과 마스킹 |
| 공개 | GET `/delivery/v1/publications`, `/delivery/v1/publications/{id}` | public 또는 좁은 delivery client scope |

`...`는 같은 `/api/v1/workspaces/{wid}`를 뜻한다. auth의 sign-in/reset/MFA endpoint는 선택 라이브러리를 어댑터로 연결하고 제품 정책을 우회할 수 없게 시험한다.

목록은 제한된 page size(초기 최대 100 제안), 안정적인 정렬(`createdAt,id` 등), 서버가 허용한 filter 필드, opaque cursor를 사용한다. cursor는 권한을 대신하지 않고 scope/filter와 묶는다. 무제한 `GET all` export endpoint를 만들지 않는다.

업데이트는 body의 baseVersion을 필수로 받고 불일치하면 409와 최신 version을 반환한다. HTTP If-Match를 채택한다면 조건부 요청 규약과 일치시키고 기존 body 계약과 혼용하지 않는다. POST의 중복 부작용은 actor/workspace/action에 scoped Idempotency-Key와 request hash로 검사한다. 같은 키에 다른 payload는 충돌이며 만료 뒤까지 영원한 멱등성을 주장하지 않는다.

오류 DTO는 RFC 9457 형식을 기반으로 `type,title,status,detail,instance`와 `code,requestId,fieldErrors?`를 제안한다. 401 미인증, 403 권한 부족, 404 비노출 리소스, 409 충돌, 413 크기 초과, 422 입력 의미 오류, 429 제한, 503 의존 장애를 일관되게 사용한다. 오류에 SQL/stack/secret/body를 포함하지 않는다. [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)

## 8. 코어와 AI 설정

사용자에게 모델별 세부 가중치 콘솔을 기본 홈에 노출하지 않는다. 기본 설정은 보조 기능 켜기/끄기, 제안 노출량, 처리할 데이터 범위, 외부 모델 전송 허용 여부, 작업 예산이다. 전문가 설정의 config/threshold 변경은 version과 비교 실험을 남긴다.

자유 텍스트의 일정·할일 추출은 LLM 선택 어댑터 또는 작은 규칙으로 후보를 만들 수 있다. 명시 폼 입력은 추론에 통과시키지 않는다. 자동으로 생성한 항목에는 출처와 적용/되돌리기 이력이 있어야 한다. 제안함의 승인도 일반 업무 명령과 동일한 권한·제약을 통과한다.

실행 가능 지시가 원문에 들어 있어도 데이터로 취급한다. Core/model은 관리 자격증명·임의 파일·SQL·발행 명령을 직접 받지 않는다. 외부 provider 전송은 scope별 opt-in이며 기록 전체를 기본 전송하지 않는다.

## 9. 운영 연결과 수용 기준

API는 requestId, commandId, jobId, judgementRunId를 연결하지만 개인정보를 일반 로그로 복제하지 않는다. 핵심 변경의 감사 사건과 작업 등록을 같은 트랜잭션에 남긴다. 외부 로그 수집기 장애가 CRUD를 막지 않도록 전달은 별도로 하고, 필수 감사 row 기록 실패는 민감 변경을 rollback한다.

기능 완료는 UI 성공 화면만이 아니라 다른 사용자의 직접 API 요청, 두 탭 수정, 재시도·재시작, Core 실패, 첨부 검증 실패, 삭제 후 오래된 추천, 초안과 공개본 분리까지 확인하는 것이다. 테스트·단계는 [제품 구현 계획](../plan/web-product-implementation-plan.md)에 있다.
