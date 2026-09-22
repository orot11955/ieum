> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# 관계 모델 · 제약 계약

- 기준: 2026-09-22 논리 설계. 기존 문서의 대표 필드·가칭을 구체화한다.
- 상세 모델: 전달 패키지 `schema.json`, `schema.dbml`, 데이터 사전. 저장소 도식은 [ERD](erd.md).

## 1. 이름과 책임을 통일한다

| 이전 가칭/빈틈 | 구체 모델 |
| --- | --- |
| 사용자/회원/작성자 혼용 | auth_user는 계정, source_revision.attribution은 외부 저자, 공개 저자는 publication metadata |
| 프로젝트 별도 여부 불명확 | 초기 PROJECT는 context.kind. 별도 프로젝트 테이블을 중복 생성하지 않음 |
| 위키와 글에 별도 버전 엔진 | document.kind=WIKI/ARTICLE/NOTE + draft/revision 공통 구현 |
| ThoughtUnit revision 모호 | thought_unit은 정체성, unit_revision은 특정 원문 버전·범위 |
| source_link에 임의 type/id | claim_evidence의 정확히 한 대상 + 버전 고정 복합 FK |
| asset_usage 가칭 | capture_asset, document_asset, publication_asset의 실제 FK |
| 채널/키 한 행 | publication_channel, delivery_client, delivery_key 분리 |
| 로그 하나 | workspace audit와 instance_audit_event를 분리; security/운영/판단은 별도 접근 |

초기 공유 권한은 Owner-only다. Editor/Viewer·capability 편집기의 미래 인터페이스를 이유로 실제 grant 기능을 열지 않는다. Operator는 다른 사용자의 private 콘텐츠 권한을 갖지 않는다. 인프라 운영자에 대한 암호학적 격리를 제공하는 것은 아니다.

## 2. PK·FK·소유 범위

계정 식별자는 인증 어댑터가 반환하는 문자열 subject로 취급한다. 도메인 UUID와 억지로 동일 타입으로 바꾸지 않는다. 실제 auth_session/factor/verification의 물리 schema는 인증 통합 시험에서 확정한다.

개인 엔터티는 workspace_id를 갖는다. 전역 id가 PK인 테이블도 `(workspace_id,id)` unique key를 노출하고 개인 리소스 참조에는 이를 포함한다. revision은 `(workspace_id,parent_id,revision)`이 고유하다. 공개 API가 UUID를 숨긴다고 권한이 생기는 것은 아니다.

Unit revision은 `(workspace_id,unit_id,capture_id)`를 부모 thought_unit의 같은 키에 연결하고 `(workspace_id,capture_id,capture_revision)`을 capture_revision에 연결한다. 다른 Capture의 원문 revision을 잘못 붙이지 못하게 한다. 원문 offset은 UTF-16 `[start,end)`이며 본문과 일치하는지는 seal/입력 검증에서 확인한다.

참조 컬럼은 별도 조회 index를 검토한다. FK 선언이 자동으로 참조하는 쪽의 index까지 만들어 주지는 않는다. [PostgreSQL 제약](https://www.postgresql.org/docs/18/ddl-constraints.html)

## 3. 여러 종류의 근거를 안전하게 표현한다

claim_evidence는 document_claim에 속하며 target을 아래 중 하나만 갖는다.

- unit_id + unit_revision
- source_id + source_revision
- source_document_id + source_document_revision

모든 target은 같은 Workspace의 실제 revision에 FK로 연결한다. `num_nonnulls(unit_id,source_id,source_document_id)=1`과 각 ID/revision의 동시 null/동시 not-null 검사를 함께 적용한다. 단일 ID 검사만으로 revision 결측을 허용하지 않는다. target 종류를 늘리면 명시적 schema 변경과 검사를 추가한다.

직접 작성한 주장에는 근거 행이 0개일 수 있다. author_asserted를 위조 인용으로 채우지 않는다. source_revision.attribution은 author/역할/위치/자료 유형/접근일의 구조화된 메타데이터이며 플랫폼 회원 테이블과 연결하지 않는다. 내 경험·외부 주장·재서술·새 해석을 구분한다.

Task/Event는 직접 등록할 수 있어 origin 행이 없어도 된다. origin이 있으면 Unit 또는 문서 revision 중 하나에 연결한다. 결과는 task_result가 새 Capture를 가리키도록 하여 `행동→경험→지식` 흐름을 완성한다.

## 4. 원문·작업본·검토·공개 상태

Capture/Unit/Source/Document의 identity와 revision을 구분한다. 편집 중 참조는 document_draft의 versioned 작업 데이터로 저장할 수 있지만 revision 확정 때 실제 원문·첨부·주장 연결을 검증하여 정규화된 행을 만든다. 문서의 본문만 아니라 공개 metadata·인용·첨부 version을 포함한 manifest hash를 만든다.

Document review는 `(document_id,revision,manifest_hash,reviewer,decision)`의 append-only 행이다. READY는 특정 manifest에만 유효하다. 같은 revision에 후속 반려가 있으면 이전 READY를 선택해 우회하지 못하게 한다. publish 명령은 관련 문서/검토를 잠그고 현재 유효한 READY와 일치하는 manifest를 확인한다.

publication_revision은 같은 Publication의 document_id, 선택한 document_revision, 그 revision의 review_id에 FK로 묶인다. publication.current_revision은 **자신의** publication_revision에만 연결한다. 최초 publication 행과 첫 revision/current pointer는 한 transaction으로 만든다. 공개된 상태에는 유효한 current pointer가 있어야 한다.

공개 제공은 다음을 모두 확인한다: channel 활성, publication PUBLISHED, 현재 revision 존재, 현재 공개 차단 없음, 허용된 credential/public-read 정책. 과거 revision이나 slug alias, public asset 경로로 철회를 우회할 수 없어야 한다. 내부 draft 변경·휴지통 복원·과거 백업 복원은 재발행 명령이 아니다.

## 5. 주소와 키의 생명주기

publication_slug의 `(workspace_id,channel_id,slug)`는 고유하며 주소 변경 후 이전 slug도 예약한다. 현재 주소는 publication당 하나로 제한한다. 같은 문서의 다른 채널 발행은 별도 Publication으로 표현하지만 첫 UI는 기본 채널 하나만 사용한다. 이전 주소 redirect는 해당 공개본이 제공 가능한 경우에만 허용한다.

DeliveryClient는 소비자·채널·scope, DeliveryKey는 실제 credential 버전이다. 새 키 발급→외부 서버 적용→사용 확인→이전 키 철회 순서로 교체할 수 있다. raw secret은 반환을 한 번만 하고 digest로 검증한다. 만료·철회와 lastUsed는 key별로 관리한다. 관리 세션·Preview 자격증명과 공유하지 않는다.

공개 asset은 검증한 원본에서 만든 별도 파생물이다. publication_asset으로 해당 공개 revision과 묶는다. 여러 발행본에 쓰는 파일은 단일 전역 public URL 차단만으로 처리하지 말고 조회하는 publication의 제공 상태를 확인한다. CDN·정적 사이트에 이미 전달된 사본을 즉시 회수할 수 있다는 보장은 하지 않는다.

## 6. 행 단위 검사와 transaction 검사를 구분한다

| DB 키/행 제약으로 표현 | application + transaction에서 확인 |
| --- | --- |
| workspace 포함 복합 FK | 현재 actor 권한·membership·재인증 |
| active unit/context pair unique, active PRIMARY 최대 1 | primary 이동 종료/생성의 원자성 |
| 날짜/시간 필드의 배타 조합과 end>start | 시간대 해석·DST의 사용자 확인 |
| claim target XOR와 버전 쌍 | 인용 의미·원문 span·개인정보 검토 |
| 같은 Publication/문서/review FK | 최신 유효한 READY, 공개 manifest와 첨부 상태 |
| key digest/slug/tag unique | 키 scope·철회·최종 owner 제거 금지 |
| job attempt 번호/lease token 존재 | 유효 lease/fencing 확인과 결과 적용 |

PostgreSQL CHECK는 다른 행의 현재 상태를 일반적으로 보장하는 용도로 쓰지 않는다. 최신 review·마지막 Owner·graph cycle을 단순 CHECK 안의 조회 함수로 해결했다고 주장하지 않는다. [PostgreSQL 제약](https://www.postgresql.org/docs/18/ddl-constraints.html)

TIMED event는 starts_at/ends_at(timestamptz)/IANA zone을, ALL_DAY는 start_date/end_date(date, 배타 종료)를 사용한다. 두 조합은 XOR다. Task의 기한은 없음/date-only/timed 중 하나다. due_date와 due_at 동시 설정을 금지하고 timed일 때 zone을 함께 요구한다.

## 7. 삭제·로그·job

휴지통은 별도 범용 EAV 저장소가 아니라 root의 deleted_at/state와 유형별 조회로 구현한다. 원문 revision과 공개 snapshot의 불변성은 사용자 삭제권을 막는 영구 보존 의무가 아니다. 일반 soft delete와 명시적 purge를 구분하고, purge 순서·출처 unresolved 표시·삭제 원장·백업 reconciliation을 구현 때 검증한다.

감사 대상에는 live FK를 강제해 삭제와 함께 사라지게 하지 않는다. audit의 target_snapshot은 ID/version/action의 제한된 메타데이터이고 원문 복제본이 아니다. 개인정보 있는 Workspace audit와 인스턴스 회원/설정 변경의 instance_audit_event를 구분한다.

command_receipt는 actor/workspace/action/idempotencyKey/requestHash를 저장한다. outbox와 민감 변경 감사는 같은 transaction이다. job_attempt는 시도별 lease/fencing token을 갖는다. 만료된 worker가 새 attempt의 결과를 덮어쓰지 못하게 조건부 update 또는 잠금으로 적용한다. 알림 recipient는 같은 workspace_member에 연결하고 클릭 시 접근을 다시 검사한다.

DB RLS는 방어 계층이며 인증·권한 결정 그 자체가 아니다. owner/BYPASSRLS 사용과 pool scope 잔존을 테스트한다. 일반 app/worker/public-read/ops 경계의 통합 시험 없이 안전하다고 선언하지 않는다. [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)

## 8. 범위를 늘리지 않는 선택

반복 일정·외부 캘린더 동기화, 실시간 공동 편집, 공유 ACL 편집기, 다중 사이트 UI, webhook 자동화, 과금은 다음 기능으로 남긴다. 태그는 capture/task/document에 먼저 적용하고 다른 유형으로 확대할 때 실제 FK를 추가한다. user_preference/workspace_setting/instance_setting의 JSON은 스키마가 있는 설정일 뿐 임의 업무 데이터를 넣는 EAV가 아니다.
