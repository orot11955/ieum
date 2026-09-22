# 구현 백로그 · 화면과 ERD를 기준으로

- 기준: 2026-09-22 설계. 일정 약속이 아니라 의존성과 완료 조건을 정한 실행 계획이다.
- 상위: 기존 Core Lab/웹 제품 계획. 이 문서는 M3-A/F, M3-B/P, M4/D, M5/R의 구체 작업 단위다.
- 읽을 문서: design/README → wireframes → ERD → schema-contracts → 검토 R01–R18.

## 1. 첫 진입점을 명확히 한다

Core 가능성을 먼저 실험하는 작업은 기존 M0/M1(CLI, lexical, replay)을 따른다. 웹 제품 구현 지시를 받으면 아래 I00부터 시작한다. 기본 앱의 저장/편집을 모델 품질에 종속시키지 않는다. 같은 레포에서 두 트랙의 contract와 구현 범위를 구분하고 다른 트랙의 stub을 대량 생성하지 않는다.

첫 제품 마일스톤은 `로그인 → 첫 개인 공간 → 기록 저장 → 할일 생성/완료 → 결과 기록 → 위키`다. 27개 화면이나 66개 논리 엔터티를 한 번에 구현하지 않는다. 운영자 UI는 초기에는 필요한 회원/상태/감사만 노출한다.

## 2. 작업 단위와 의존성

| ID | 단계 | 선행 | 산출물 / 화면 | DB·핵심 검사 |
| --- | --- | --- | --- | --- |
| I00 | F | 없음 | 실제 auth adapter spike, schema/DTO/에러 계약, 화면 mocks | vendor schema 매핑, invite-only/MFA/철회, id 타입 |
| I01 | F | I00 | monorepo의 web/API, 설정, DB migration harness | health·requestId·error DTO, 빈 DB migration·rollback 절차 |
| I02 | F | I01 | W01–W03/W26 로그인·온보딩·복구·세션 | User/Workspace/member/preferences, 중복 초대·last owner |
| I03 | F | I02 | W22/W23 최소 회원·권한, W24 감사 | 범위별 repository/RLS, 두 사용자 404/다운로드/cache 검사 |
| I04 | F | I01–I03 | command receipts/outbox/job, W25/W27 최소 운영 | 원자 감사, idempotency, attempts/fencing, 첫 복원 시험 |
| I05 | P | I02–I04 | W04–W06 기록/출처/Unit/태그 | revision·span·typed FK, 다른 Capture revision 거부 |
| I06 | P | I05 | W07/W08 Task/Event + 결과 Capture | origins XOR, task_event, all-day/timed/date deadline |
| I07 | P | I05 | W09/W10 위키/맥락 + 문서 공통 기반 | draft version·document revision·backlinks·tag/context links |
| I08 | P | I05–I07 | W11/W15 검색·제안함, Core 어댑터 | 권한 내 snapshot, stale/중복 제안, Core offline CRUD |
| I09 | P | I04–I07 | W19–W21 자료·이식·휴지통, W26 알림 | 검증 asset, approved import manifest, 삭제·복원·export scope |
| I10 | D | I07/I09 | W12–W14 문서 작업실·출처·충돌 | claims/evidence XOR, seal, 늦은 autosave 응답·두 탭 |
| I11 | D-R | I03/I10 | W16 버전 검토 + 공개 preview | manifest와 최신 READY, 공공 metadata/asset 변경 시 재검토 |
| I12 | R | I11/I09 | W17/W18 발행·철회·채널·키 교체 | 같은 pub/doc/review FK, slug 예약, credential scope |
| I13 | R | I12 | Delivery OpenAPI와 별도 소비자 fixture | private field leak, alias/asset 철회, cache/키 교체 |
| I14 | 전 단계 | 해당 기능 | 접근성/실패/복원/기본 성능 hardening | 페이지별 keyboard/mobile, 장애·정지·재시도·복원 gate |

I14는 끝에서만 하는 QA가 아니라 각 작업 완료의 일부다. 추정 인일과 실제 담당자는 첫 auth spike와 편집기 선택 후 나눈다. 근거 없는 총 기간이나 처리량을 확정하지 않는다.

## 3. 병렬 진행할 수 있는 경계

I00에서 route/DTO/permission/error 계약과 같은 mock fixture를 확정하면 화면 작업과 DB 제약/어댑터 작업을 나눌 수 있다. 화면이 임의 응답 구조를 먼저 만들어 서버가 맞추게 하지 않는다.

Capture 모델 이후에는 일정·할일(I06)과 위키 공통 편집(I07)을 분리할 수 있다. 문서 seal/manifest와 공개 DTO 계약은 단일 책임자가 관리한다. 여러 워커가 같은 migration·auth policy·publication contract를 동시에 변경하지 않는다. 변경마다 영향 화면·엔터티·테스트 ID를 기록한다.

## 4. 각 기능의 Definition of Done

화면, application command, 저장 모델, 권한, 오류 상태, 감사, 테스트를 모두 포함한다. 기능을 켤 조건과 끌 조건도 기록한다. 불변식은 domain service에서 검증하고 DB가 강제할 수 있는 범위는 FK/unique/check로 다시 막는다.

검사 수준:

- 순수 테스트: 상태 전이, null 조합, score/policy, 시간 범위, manifest 안정성.
- PostgreSQL 통합: 실제 FK/index/RLS, 동시 primary/slug, transaction rollback, 두 사용자 scope.
- API: 401/403/404, version conflict, 멱등 재시도, 크기/필터 제한, 공개 DTO.
- 브라우저: W01→W06→W07→W09 및 W13→W16→W17, 모바일, 미저장 입력·로그아웃 cache.
- worker/운영: 중복 전달, lease 만료, 계정 정지, 원문 삭제, 외부 모델 장애, DB+첨부 복원.

제품 API/DB/browser 테스트를 아직 실행하지 않았으므로 이 목록을 통과 결과로 표시하지 않는다. 이번 HTML 검사는 UI 시연 artifact의 동작만 검증했다.

## 5. release gate

G-F: 두 사용자 격리, 공개 가입 우회 방지, MFA/세션 철회, 운영자와 Owner 분리, 감사·백업 절차.

G-P: 모델 없이 기록·실행·위키 사용 가능, 삭제 원본의 재등장 방지, 날짜·시간대/중복 처리, 검증된 첨부만 사용.

G-D: autosave 충돌 입력 보존, 인용 revision 일치, 검토된 manifest 고정, 출처의 변경·삭제를 표시.

G-R: draft 수정이 공개본을 바꾸지 않음, 최신 READY 우회 없음, 타 문서 revision 금지, 철회된 alias/asset 제공 금지, 외부 소비자의 갱신/철회 계약.

G-Ops: 작업 재시작·중복·expired worker, 오류 로그의 secret 유출, export 권한 철회, 과거 백업 복원으로 철회 글/세션이 되살아나는 경우를 검사.

각 gate에 통과한 기능만 운영에서 켠다. HTML의 성공 화면이나 Mermaid 그림으로 보안 통과를 선언하지 않는다.

## 6. 최초 웹 구현 요청용 지시

> I00–I03을 한 번에 완성하려고 하지 말고 I00 계약·인증 spike부터 구현하라. README/AGENTS와 design 문서, schema-contracts, R01–R18을 읽고 실제 선택한 인증 라이브러리의 User ID·세션·MFA schema를 매핑하라. I01에서 실제 DB와 migration 검사를 준비하고 I02에서 W01–W03/W26의 가입·로그인·개인 공간을 구현하라. 서비스 초대를 기존 개인 공간 공유로 취급하지 말고, 문서/일정/코어/발행을 선행 구현하지 말라. 결과에 생성 파일·실제 실행한 명령·테스트·비활성 기능·미해결 위험을 보고하라.

이 지시는 향후 구현 요청 때 사용할 범위다. 이번 설계 작업에서 실제 코드 작업을 시작하거나 프로덕션에 적용하지 않는다.

## 7. 최종 연결성 확인

각 기능 ID는 wireframe ID, API command, entity/FK, permission, 오류, 테스트에 연결되어야 한다. 화면만 있는 기능도, 사용자 행동이 없는 불필요한 테이블도 남기지 않는다. 새 요구가 들어오면 이 연결표부터 변경한 뒤 모델·화면·구현 계획을 함께 갱신한다.
