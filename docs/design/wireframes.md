> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# 화면 와이어프레임 · 행동·저장 구조 매핑

27개 주요 화면을 구성했다. 아래는 제품 구현 계약이며 전달한 HTML은 합성 데이터의 탐색 시연이다. HTML의 W01–W27 사이드바와 상태 도구는 설계 탐색 장치다. 실제 로그인 화면에서 개인 메뉴를 공개하라는 요구가 아니다.

## 주요 화면 배치

### 기록 상세 · W06

```text
┌────────────┬─────────────────────────┬──────────────────────┐
│ 개인 메뉴  │ 원본 기록 / revision    │ 출처 · 관련 맥락     │
│ 기록       │ [본문 편집 영역]        │ 저자·위치·자료 버전  │
│ 할일·일정  │ [새 버전 저장]          │ [원자료] [맥락]      │
│ 위키       ├─────────────────────────┴──────────────────────┤
│ 문서       │ 코어 제안: 할일 후보 / 위키 근거 연결          │
│ 제안함     │ [수정 후 적용] [보류]  원문 저장과 별도 상태    │
└────────────┴────────────────────────────────────────────────┘
```

### 문서 편집 · W13

```text
┌────────────┬────────────────────────────────────────────────┐
│ 개인 메뉴  │ 제목 / 작업본 v12 / 저장 상태 / [발행 검토]    │
│            ├──────────────────────────┬─────────────────────┤
│            │ 본문 · 편집기            │ 자료·주장 연결      │
│            │ 내 경험                  │ 경험: Unit r3       │
│            │ 외부의 주장·반론         │ 자료: Source r1     │
│            │ 새로운 해석              │ 내 해석: AUTHOR     │
│            │ 아직 열린 질문           │ [근거 추가]         │
│            ├──────────────────────────┴─────────────────────┤
│            │ [버전 비교]  공개본 v2는 현재 작업과 분리      │
└────────────┴────────────────────────────────────────────────┘
```

W13의 본문은 편집 화면을 뜻한다. 저장 포맷은 FE-02에서 검증할 Tiptap JSON이며, 기존 Markdown 자료의 변환·export 손실 범위는 FE-02 완료 조건으로 남긴다.

### 충돌 해결 · W14

```text
┌─────────────────────────────────────────────────────────────┐
│ 다른 기기에서 v13 저장됨 · 내 입력은 v12 기준 · 저장 안 됨  │
├────────────────────────────┬────────────────────────────────┤
│ 서버의 최신 내용 v13       │ 내 미저장 내용                 │
│ 추가·삭제 표시             │ 현재 입력 보존                 │
├────────────────────────────┴────────────────────────────────┤
│ [새 초안으로 복사] [최신 기준 다시 편집] [취소]              │
│ 참조 원문도 바뀐 경우: 출처 STALE 안내, 자동 교체하지 않음   │
└─────────────────────────────────────────────────────────────┘
```

### 발행 전 검토 · W16

```text
┌──────────────────────────┬──────────────────────────────────┐
│ 공개 제목·본문·요약      │ 대상 문서 revision + manifest    │
│ 채널 / slug             │ [ ] 비공개 내용 제외 확인        │
│ 공개 작성자·태그        │ [ ] 인용과 해석 확인             │
│ 공개 첨부 미리보기      │ [ ] 승인된 공개 첨부 확인        │
│                          │ [재인증 후 이 버전 발행]         │
└──────────────────────────┴──────────────────────────────────┘
```

### 로그·운영 · W24/W27

```text
┌────────────┬────────────────────────────────────────────────┐
│ 운영 메뉴  │ [종류] [기간] [행동] [결과] [연관 ID]          │
│ 회원       ├───────┬────────────┬──────────────┬──────────────┤
│ 권한       │ 시각  │ 행동       │ 대상/버전    │ 결과         │
│ 로그       ├───────┴────────────┴──────────────┴──────────────┤
│ 작업·백업  │ 선택 사건: request → command → job → judgement │
│ 설정       │ 필드명/버전만; 개인 원문은 별도 권한 검사      │
└────────────┴────────────────────────────────────────────────┘
```

모바일에서는 작업 영역을 한 열로 만들고 출처 패널은 본문 아래 또는 접근 가능한 보조 패널로 이동한다. 표·주간 일정만 영역 내부 스크롤을 허용한다. 필수 저장·취소·재시도 동작이 화면 밖으로 사라지지 않아야 한다.

## 화면·경로·권한·엔터티

| 화면 | 단계 / 경로 | 권한 | 관련 엔터티 |
|---|---|---|---|
| W01 로그인 | F / `/login` | anonymous | auth_user, auth_session |
| W02 초대 수락·첫 설정 | F / `/invitation/:token` | valid invitation | invitation, auth_user, workspace, workspace_member, user_preference |
| W03 계정 복구·2단계 인증 | F / `/security/challenge` | recovery or MFA challenge | auth_user, auth_factor, auth_session |
| W04 내 하루와 생각 | P / `/app` | workspace.read | capture, task, calendar_event, document, proposal, notification |
| W05 기록함 | P / `/app/captures` | capture.read/write | capture, capture_revision, capture_tag, tag, context_membership |
| W06 기록·출처 상세 | P / `/app/captures/:id` | capture.read/write | capture, capture_revision, source, source_revision, capture_source, thought_unit, unit_revision, task_origin |
| W07 할일 | P / `/app/tasks` | task.read/write | task, task_context, task_origin, task_result, task_tag |
| W08 일정 | P / `/app/calendar` | event.read/write | calendar_event, task_event, event_origin, event_context |
| W09 개인 위키 | P / `/app/wiki` | wiki.read/write | document, document_draft, document_revision, document_link, document_context, document_tag |
| W10 맥락·프로젝트 | P / `/app/contexts/:id` | context.read/write | context, context_membership, context_relation, task_context, document_context |
| W11 통합 검색 | P / `/app/search` | scoped search.read | capture, document, context, task, tag |
| W12 문서 작업실 | D / `/app/documents` | document.read/write | document, document_draft, document_revision, document_review |
| W13 문서 편집 | D / `/app/documents/:id/edit` | document.write | document, document_draft, document_revision, document_claim, claim_evidence, document_asset |
| W14 버전 비교·충돌 해결 | D / `/app/documents/:id/compare` | document.write | document_draft, document_revision, claim_evidence |
| W15 정리 제안함 | P / `/app/proposals` | proposal.read/accept + target.write | judgement_run, proposal, feedback, command_receipt, context_profile |
| W16 발행 전 검토 | R / `/app/documents/:id/publish` | publication.publish + recent reauth | document_revision, document_review, publication_channel, publication_revision, document_asset |
| W17 발행본 관리 | R / `/app/publications/:id` | publication.read/publish/withdraw | publication, publication_revision, publication_slug, publication_asset |
| W18 Delivery API 클라이언트 | R / `/app/delivery` | delivery.clients.manage | publication_channel, delivery_client, delivery_key |
| W19 파일·자료 | P / `/app/assets` | asset.read/write | asset, capture_asset, document_asset, public_asset, publication_asset |
| W20 가져오기·내보내기 | P / `/app/data-transfer` | workspace.import/export + reauth | data_transfer, job, job_attempt, asset, command_receipt |
| W21 휴지통·복구 | P / `/app/trash` | workspace.restore/purge | capture, document, asset, publication |
| W22 회원 관리 | F / `/ops/users` | ops.users.manage | auth_user, invitation, workspace, workspace_member, instance_operator |
| W23 권한·데이터 경계 | F / `/settings/access` | own capabilities / ops policy metadata | workspace, workspace_member, instance_operator, workspace_setting |
| W24 로그·변경 이력 | F / `/ops/logs` | ops.logs.read or own audit.read | audit_event, instance_audit_event, security_event, job_attempt, judgement_run, command_receipt |
| W25 작업·처리 상태 | P / `/app/jobs` | job.read/retry (scoped) | job, job_attempt, outbox_event, data_transfer, judgement_run |
| W26 개인 설정·보안 | F-P / `/settings` | self settings + recent reauth | user_preference, auth_session, auth_factor, workspace_setting, notification |
| W27 운영 상태·백업 | F-R / `/ops/health` | ops.health/read backup metadata | backup_manifest, job, job_attempt, security_event, instance_setting |

## 핵심 사용자 경로

1. W01 → W02/W03 → W04 → W06: 로그인·개인 공간·첫 기록.
2. W06 → W15 → W07 → W08 → W06 → W09: 기록에서 행동, 결과를 다시 지식으로.
3. W09/W11 → W12 → W13 → W14 → W16 → W17 → W18: 근거 기반 문서와 별도 공개 API.
4. W19 → W20 → W25 → W21: 자료 이식·실패·복구.
5. W22/W23 → W24/W27: 운영 계정·정책·감사·백업.

## 상태·반응형·시연의 경계

HTML에서 기본, 비어 있음, 로딩, 오류, 권한 없음, 충돌을 상단 도구로 전환한다. 이는 UI 상태 확인용이며 백엔드 에러를 실제 재현하는 테스트가 아니다. 모든 제품 command는 auth/action/workspace/baseVersion을 서버에서 다시 검사한다.

1440px: 내비게이션 + 작업 영역 + 설계 주석. 390px: 화면 선택 + 단일 열 + 표/일정 내부 가로 스크롤. 본문 전체 가로 넘침을 금지한다. 화면 이동, 상태 전환, 입력, 모달 열기/닫기는 동작하지만 실제 세션·저장·코어 호출·발행·회원 수정은 하지 않는다.

제품의 화면 메뉴는 기능/권한에 맞게 별도로 노출한다. 로그인 전 메뉴와 다른 사용자의 client cache를 노출하지 않는다. 초안 충돌·계정 정지·삭제 후 오래된 제안은 성공 화면과 별도 상태이며 원본을 조용히 변경하지 않는다.
