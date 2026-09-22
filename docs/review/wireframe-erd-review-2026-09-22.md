> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# 와이어프레임 · ERD 대조 검토

기준 commit `cb964a0`. 상태: 설계 보완 완료, 제품 구현 검증은 미수행. 화면 명세·논리 관계·권한·운영의 연결을 검토했다. 새 보완의 정본은 `docs/design/schema-contracts.md`이며 기존 대표 필드 표보다 구체적인 계약이다.

## 발견한 누락과 수정

| ID | 중요도 | 기존의 빈틈 | 반영한 보완 | 구현 검증 |
| --- | --- | --- | --- | --- |
| R01 | 높음 | 첫 로그인 뒤 빈 개인 공간으로의 흐름 없음 | W02 onboarding, 기본 timezone/외부 AI off, Workspace 원자적 생성 | 초대 중복/만료/개인 공간 중복 |
| R02 | 높음 | 문서 READY와 공개 payload 변경의 연결 약함 | sealed manifest + append-only review + 현재 READY 확인 | 검토 뒤 metadata/asset 변경 시 거부 |
| R03 | 높음 | publication current가 다른 글 revision을 가리킬 수 있음 | 같은 Publication/Document/review의 복합 FK와 current pointer | 다른 Publication revision 삽입 거부 |
| R04 | 높음 | 근거가 임의 type/id일 위험 | claim_evidence target XOR + 실제 revision FK | ID/revision 일부 null, 타 공간, 고아 ID 거부 |
| R05 | 높음 | 코어에서 만든 Task/Event의 출처·결과 관계 불명확 | optional typed origin + task_result → Capture | 중복 제안 적용·원문 수정이 완료 상태를 뒤집지 않음 |
| R06 | 높음 | 자동저장과 모바일 충돌의 사용자 경로 없음 | W14 비교/새 초안/취소, v12/v13 conflict 화면 | 두 탭·늦은 응답·세션 만료 |
| R07 | 높음 | 비공개 파일과 공개 asset의 수명 혼합 | private immutable Asset → public derivative → publication_asset | 철회 뒤 과거 파일 URL·공유 asset 경계 |
| R08 | 중간 | 발행 채널은 언급만 있고 엔터티 없음 | publication_channel, 기본 채널 1개 | client의 다른 채널 접근 차단 |
| R09 | 중간 | 주소 변경 시 오래된 글 URL 재사용 위험 | publication_slug 예약·현재 하나·접근 검사된 alias | 동시 동일 slug, 철회된 alias |
| R10 | 높음 | client와 키를 한 행으로 두면 무중단 교체 어려움 | delivery_key의 여러 버전과 만료·철회 | 새 키 확인 후 이전 키 차단 |
| R11 | 중간 | 태그/검색과 실제 소속 관계 누락 | tag 및 capture/task/document 태그, typed context links | 다른 공간 tag/Context 연결 거부 |
| R12 | 중간 | 위키 내부 링크와 출처 인용이 혼재 | document_link(현재 탐색)와 claim_evidence(불변 출처) 분리 | 제목 변경/삭제 후 backlink·stale 처리 |
| R13 | 높음 | 동일 원문의 다른 revision/캡처에 Unit이 연결될 수 있음 | Unit-parent-capture triple key와 capture_revision FK | 다른 Capture의 원문 version 참조 거부 |
| R14 | 높음 | 운영자 변경의 audit가 Workspace 종속으로 누락 | instance_audit_event와 private audit 분리 | 운영자가 원문 trace를 로그로 우회 불가 |
| R15 | 높음 | 재시도 job이 이전 worker 결과를 덮어쓸 수 있음 | job_attempt + lease token/fencing + 결과 전 재검사 | 만료 worker와 새 attempt 경쟁 |
| R16 | 중간 | import preview 이후 내용이 달라질 수 있음 | 승인 manifestHash/previewVersion 고정 | dry-run 파일 변조 후 apply 거부 |
| R17 | 높음 | 삭제/복원 후 공개 또는 캐시가 되살아날 수 있음 | 삭제 후 필터·stale 처리·비공개 복원·복원시 철회 대조 | profile/worker/backup 경로 |
| R18 | 중간 | 종일·시간 지정 및 기한에 모순된 nullable 조합 | event XOR/date-only deadline/check + timestamptz | 자정·시간대·역전 범위·동시 필드 |

중요도는 이음 설계의 오류 비용을 기준으로 정한 우선순위다. 실제 취약점 검증 결과나 외부 표준 등급이 아니다. 모든 행은 현재 **설계에 반영**한 상태이며 제품 테스트가 통과했다는 뜻은 아니다.

## 실행한 설계 검사

- 화면 27개 × 1440px/390px = 54개 렌더링 검사: 문서 전체 가로 넘침 0, JavaScript 오류 0.
- 6개 상태 전환, 실제 HTML dialog 열기/Escape 닫기, ERD SVG 로딩 검사.
- 화면이 참조한 엔터티 이름의 누락 0.
- 66개 논리 엔터티·141개 FK 계약의 테이블/필드 존재, 타입, 부모 unique key, private FK workspace 포함 검사: 오류 0.
- Graphviz로 전체 개요 1개와 상세 ERD 7개를 SVG로 렌더링. PDF에서도 주요 화면과 ERD 페이지를 재렌더링해 확인.

관계 검사는 JSON 모델의 정적 일관성 검사다. PostgreSQL migration/RLS/constraint execution 검사가 아니다. Mermaid 원본과 DBML은 편집용이며 사용자가 선택한 외부 도구/버전의 파서 호환성 검사는 별도다. 다중 기기·접근성·보안에 대한 실제 제품 검증은 수행하지 않았다.

## 아직 결정하거나 검증할 것

인증 어댑터의 실제 테이블·타입과 API endpoint, 제한된 SQL 정책, 효과적인 세션 철회, 사용하는 편집기, 파일 검증 구현, 최초 성능 budget, 삭제 원장·백업의 운영 방식은 구현 단계에서 확인한다. API 경로와 엔터티 목록은 계약 초안이지 이미 배포된 API가 아니다.

마지막 Owner, 최신 READY, context DAG, 공개 자산 제공 상태, 원문/인용 의미 일치 등은 그림이나 FK만으로 해결하지 못한다. 명령·트랜잭션·권한·UI 상태별 테스트가 있어야 한다. CHECK로 다른 행의 상태를 일반적으로 검증하지 않는 이유는 [PostgreSQL 공식 문서](https://www.postgresql.org/docs/18/ddl-constraints.html)를 따른다.

모달 키보드/focus 계약은 [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)를 참고한다. 현재의 Escape 시연 테스트만으로 전체 접근성 준수를 주장하지 않는다.

## 범위와 변경 영향

최종 제품은 내부 관리 앱 + 판단 보조 + 발행 API이며 외부 블로그는 별도다. 기존 M0/M1 Core Lab과 F/P/D/R 순서를 유지하고, 새로운 완결 기준을 구현 백로그에 연결했다. 여러 역할·사이트·모델·워크플로를 동시에 확대하지 않는다. 검토를 이유로 실제 서비스 계정·개인 자료·프로덕션 DB를 변경하지 않았다.
