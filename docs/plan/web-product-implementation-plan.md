# 개인 관리 웹 · 제품 구현 순서와 완료 기준

- 개정: 2026-09-22
- 상태: 계획. 코드 구현·테스트·운영 성능은 아직 수행하지 않았다.
- 상위: [Core Lab 및 제품 계획](core-lab-experiment-plan.md)

## 1. Core 실험과 제품 기반을 혼동하지 않는다

기존 기본 작업 M0/M1은 작은 CLI 판단 실험으로 유지하고 M2는 의미 검색 비교다. 이 문서는 이후 **M3/M4/M5를 실제 개인 관리 제품으로 구현하는 상세 범위**다. 웹 설계를 요청받았다는 이유로 지금 모든 제품 코드를 구현하지 않는다.

Core 추천 목표 달성이 수동 일정·할일·위키·문서 작성·명시적 발행의 필수 조건은 아니다. 하지만 실제 계정을 수용하는 웹은 인증·소유 범위·감사·복구가 없는 상태로 먼저 외부 공개하지 않는다.

단계 매핑: F= M3-A 기반, P= M3-B 개인 관리, D= M4 문서 작업실, R= M5 발행 API. X는 후속이다. 임베딩/구조/초안 자동화 실험은 별도 품질 gate로 켜고 끈다.

## 2. M3-A / F — 사용자를 안전하게 수용하는 웹 기반

구현할 산출물:

| 업무 | 구현 내용 | 명세 ID |
| --- | --- | --- |
| Runtime foundation | 내부 web/API, PostgreSQL migration, 설정 검증, requestId, error DTO | WEB-01/02, CFG-01 |
| Auth spike | auth adapter, cookie 세션, 초대 제한, reset, MFA, 철회 시험 | IAM-01/02 |
| 계정·공간 | bootstrap, member 상태, 개인 Workspace, 운영자와 Owner 분리 | MEM-01, ACL-01 |
| 공통 UX | shell, 로그인/만료, 목록/폼/오류/빈 상태, 모바일·키보드 | WEB-01/02 |
| 운영 기본 | 감사/security log, 최소 job/outbox, health, 첫 백업·복원 절차 | LOG-01, JOB-01, OPS-01 |

Better Auth는 우선 후보이며 실제 사용하는 버전·플러그인의 advisory와 라이브러리 세션 정책을 확인한다. integration spike의 통과 조건은 공개 가입 차단, 계정 정지 즉시 접근 차단, MFA 필요 상태에서 일반 세션 권한 부여 차단, cookie cache 없이 철회 검증, reset token 일회성이다. 충족 전에 인증 스택을 확정 구현이라고 보고하지 않는다.

테스트용 최소 두 계정을 준비하되 공개 저장소에는 합성 fixture만 둔다. A/B의 Workspace가 검색·첨부·job·로그까지 분리되는 것을 확인한다. 실제 서비스는 1인 모드로 먼저 열 수 있으나 여러 계정 초대 기능을 켜기 전에 격리 gate를 통과해야 한다.

아직 만들지 않는 것: 소셜 가입/SSO, 팀 협업, custom ACL editor, 결제, 고도화된 대시보드, 외부 블로그 화면. 운영자 콘솔은 회원·상태·마스킹된 로그와 설정만으로 시작한다.

## 3. M3-B / P — 실제 개인 관리

첫 수직 기능은 `기록 → 수동 Task 생성 → 완료 결과 → 관련 위키`다. 이를 완성한 다음 기본 일정, 첨부, 통합 검색, 맥락, 제안함을 추가한다. 모든 관리 대상에 공통 UI를 억지로 적용하지 않는다.

필수 산출물: 원문/revision·출처, Task 상태·기한·완료/재개, timed/all-day 일정, 위키 편집·revision, 맥락 다중 연결, scope 적용 검색, private asset, 휴지통·복원, Markdown/manifest Import/Export, 인앱 작업 알림. 명세 CAP/SRC/TASK/CAL/WIKI/CTX/SRCH/DATA/CORE/NOTI를 단계적으로 완성한다.

Core를 통합할 때 기록 저장 후 별도 판단 job으로 제안한다. acceptance가 실제 Task/Event 생성과 연결될 때 idempotency·출처·undo·stale 확인을 구현한다. API timeout이나 모델 실패에서 원문 저장 성공과 추천 실패를 별도로 표시한다.

자동 URL fetch, 반복 일정, 외부 캘린더 동기화는 필수 사용자 흐름과 분리해 X로 유지한다. 기본 외부자료는 수동 출처 등록으로 충분히 쓸 수 있어야 한다. 업로드 검사·export scope·파일 복원 검사를 통과한 유형만 활성화한다.

## 4. M4 / D — 글·위키 편집과 통찰 문서

편집 기반은 Markdown 작업본 + 불변 document revision + source refs다. 위키와 글의 공통 편집 엔진은 공유할 수 있다. 작성 화면에 본문, preview, 자료/출처 패널, 저장 상태, 버전 비교, 검토 상태를 제공한다.

자동저장에는 baseVersion, 요청 순서, debounce, 실패 복구가 필요하다. 두 탭 충돌에서 한쪽 글이 조용히 사라지지 않아야 한다. 사용자 로그아웃 후 이전 사용자의 draft가 다음 계정에 보이지 않아야 한다.

문서의 자료는 자기 경험·실험, 외부 저자의 주장·반론, 새 해석으로 구분한다. Source pack으로 수동 작성이 먼저 작동하고, 모델의 outline/정제/초안은 선택적 기능으로 추가한다. source mapping의 존재와 의미적 정확성은 별도로 검토한다.

완료 기준: 원문 선택→자료 묶음→글 편집→revision 확정→READY 검토가 내부 웹에서 가능하다. 구조 분리/병합 판단 성공을 수동 문서 작성의 선행 조건으로 두지 않는다. 실시간 공동 편집과 2인 승인 강제는 하지 않는다.

## 5. M5 / R — 발행·Delivery

명시적인 Publish/Revise/Withdraw application command를 구현한다. 특정 READY revision과 검증된 공개 asset에서 publication snapshot을 만들고 current 공개 포인터를 원자적으로 변경한다. 개인정보를 포함한 private 모델의 자동 serialization은 하지 않는다.

발행 목록·공개 미리보기·버전·slug·요약·태그·공개 저자 정보·철회 기능, 좁은 읽기용 DeliveryClient/키를 추가한다. publication 관련 작업은 감사·revision 검사·필요 재인증을 통과한다. 편집권한과 발행권한의 직접 API 테스트를 한다.

Management/Delivery OpenAPI contract와 외부 소비자 fixture를 작성한다. 실제 외부 블로그는 별도 레포/프로젝트로 만든다. 공개 목록·상세·개정·철회·asset·cache invalidation을 소비자 계약 테스트로 검증하며 내부 DB/ORM 타입 공유를 요구하지 않는다.

예약 발행·여러 채널 동시 운영·웹훅 고도화는 X다. 최초에는 한 채널과 검증된 조회·재조회 정책으로 시작한다. 웹훅을 추가하면 서명·재시도·중복·SSRF·철회 반영을 함께 구현한다.

## 6. 릴리스 gate

| Gate | 반드시 확인할 조건 | 적용 단계 |
| --- | --- | --- |
| G1 계정 | 초대/복구 token 만료·재사용, MFA, 세션 철회, 정지/탈퇴 | F |
| G2 격리 | 두 사용자 간 URL/검색/수량/첨부/vector/job/export/cache 접근 차단 | F, 기능 추가마다 |
| G3 권한 | 운영자≠개인 Owner, 편집≠발행, key≠관리 세션, stale grant | F→R |
| G4 저장 | 두 탭 수정 충돌, idempotent 명령, transaction rollback·감사 | F→D |
| G5 자료 | MIME/signature·크기·quota·경로, private asset·preview 차단 | P |
| G6 수명 | 휴지통·복원·영구 삭제·source stale·다른 job의 재생성 금지 | P→R |
| G7 이식·복구 | import dry-run/충돌, 자기 공간 export, DB+asset 복원 | P 및 R 전 |
| G8 판단 | core offline CRUD, 제한된 snapshot, 제안 권한·revision | P, 보조 기능마다 |
| G9 공개 | draft 수정 불변, private field/asset 누출 없음, 철회·이전 버전 차단 | R |
| G10 운영 | job 중복·재시작, secret log 미기록, dependency/advisory, backup·health | F→R |
| G11 접근성 | 핵심 화면 keyboard/focus/label/오류/모바일 사용 가능 | F→R |

조건을 만족하지 못하면 해당 기능을 비활성 상태로 유지한다. 문서에 테스트 이름이 있다고 실행한 것으로 집계하지 않는다.

## 7. 중요한 반례 시나리오

A가 B의 리소스 ID를 알아도 목록/상세/다운로드를 열 수 없어야 한다. Operator가 B의 private judgement trace를 로그 콘솔로 우회하지 못해야 한다. 아직 공유 UI가 없으면 임의 role grant API도 열지 않는다.

정지 직전 등록된 export 또는 publish 관련 job이 정지 이후 실행되면 다시 권한을 확인하고 중단한다. token scope 변경 뒤 이전 cursor/cache로 민감 데이터가 남지 않아야 한다. auth 라이브러리의 별도 signup 경로를 직접 호출해 invite-only를 우회하지 못해야 한다.

출처가 삭제된 동안 모델이 만든 제안은 적용 전 stale 처리한다. 같은 제안을 두 번 승인해도 같은 Task 하나만 생성한다. import 파일의 published 상태는 새 공개본을 만들지 못한다.

업로드 후 DB 기록 실패, DB commit 후 worker 종료, 외부 로그 collector 장애, 중복 outbox 전달을 시험한다. 감사 row 삽입이 필요한 민감 변경에서 삽입 실패하면 변경도 rollback한다. 거부·실패 사건은 rollback된 transaction에만 남겨서 사라지지 않게 별도의 보안 기록 경로로 처리한다.

과거 backup을 복원해 철회된 글이나 세션이 다시 활성화되지 않도록 reconciliation하고, 공개 제공은 검증 전 off다. 단순 backup 파일 생성 성공과 실제 복원 성공을 따로 기록한다.

## 8. 최초 웹 구현 작업 지시

M0/M1 실험 지시와 혼동하지 말 것. 사용자가 **웹 제품 기반 구현을 시작하라고 했을 때** 다음 범위를 사용한다.

> README, AGENTS, 웹 기능 명세, identity-and-access, web-application-design, data-and-operations를 읽고 M3-A/F만 구현하라. 내부 웹 shell, auth 통합 spike, 개인 Workspace, 초대형 회원·세션·권한, 최소 감사·health·설정, 실제 격리 테스트를 완성하라. Core 정교화나 문서/발행/협업 모듈을 선행 구현하지 말라. 초기 Owner-only 개인 공간을 지키고 공개 signup과 범용 admin impersonation을 만들지 말라. auth library의 default를 신뢰하지 말고 철회·초대·MFA·CSRF·scope를 직접 테스트하라. 실제 실행한 명령과 실패를 보고하고 다음 단계가 사용할 계약을 남겨라.

이후 P/D/R은 별도 작은 변경으로 진행한다. 기능 ID별 UI/API/DB/권한/감사/테스트 산출물을 PR 또는 commit에서 추적한다. documentation-only 작업을 이 구현 지시의 자동 승인으로 해석하지 않는다.

## 9. 결과 보고

변경한 기능 ID, schema/migration, 실제 API contract, 설정·secret 요구, 실행 테스트, 미구현/비활성 기능, 성능 측정 범위, 알려진 위험과 다음 검증을 보고한다. Core 실험 통과, 웹 기본 기능 완성, 보안 gate, API 소비자 검증, 사용자 효용은 서로 다른 상태다.
