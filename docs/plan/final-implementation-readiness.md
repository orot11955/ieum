# 최종 구현 착수 판단 · 2026-09-22

## 판정

**GO — 디자인 기반과 첫 인증·개인 공간 구현을 시작할 수준이다.** 전체 화면/66개 엔터티 일괄 구현, 공개 배포, 발행 보안 검증 완료를 의미하지 않는다. 사용자 요청은 착수 판단까지이며 이번 변경에서 제품 API/React 앱/DB migration을 시작하지 않았다. 실행 가능한 디자인 자산 생성·검사 도구만 추가했다.

현재 제품 목적과 내부 앱/판단 Core/Delivery 경계, W01–W27, ERD의 핵심 관계·제약, 웹 기능·권한·운영 요구, 시각 기준이 있어 첫 구현의 입력이 충분하다. 남은 문제는 더 많은 추상 문서를 쓰기보다 작은 auth/UI spike와 실제 DB 테스트로 답해야 한다.

## 계획 대조에서 보완한 사항

| ID | 기존 빈틈 | 최종 반영 |
| --- | --- | --- |
| G01 | I00 auth spike가 runtime/DB harness(I01)보다 먼저라 의존성이 불명확 | S0에서 최소 실행/테스트 기반, S1에서 실제 auth mapping 후 제품 migration 확정 |
| G02 | 화면/ERD는 있지만 시각 정본이 없음 | 고정 token→recipe→공통 wrapper→페이지, CI와 화면 상태 matrix |
| G03 | I07 위키 편집이 I10 autosave/conflict 구현보다 먼저 | I07부터 draft/version/IME/충돌 기반을 공유; I10은 출처·글 정제 확장 |
| G04 | generic 기록 create와 문서 edit가 모두 같은 폼일 위험 | workflow별 폼·상태를 유지하고 primitive만 공유 |
| G05 | 초기 auth schema가 논리 ERD의 vendor 테이블과 다를 수 있음 | 실제 subject/type/session/MFA 매핑을 S1 산출물로 확정; ERD를 그대로 생성하지 않음 |
| G06 | 모든 job·백업·운영 화면이 첫 기록보다 먼저 거대해질 수 있음 | 감사/command receipt/필요 job skeleton은 기반, 고급 운영 UI는 해당 사용처에 맞춰 추가 |
| G07 | 단일 boolean permission UI가 source·검색·worker 범위를 놓칠 수 있음 | 서버 범위 검사+반례 테스트; UI 숨김은 보조 |
| G08 | 데모 UI 통과를 제품 전체 접근성·보안 통과로 볼 위험 | 디자인 검사/브라우저 표본/제품 release gate의 증거를 분리 |
| G09 | 디자인 token값만 고정하면 feature별 CSS에서 벗어날 수 있음 | 소스 guard+UI wrapper+외부 라이브러리 adapter+상태 screenshot 의무 |
| G10 | 여전히 두 트랙 시작 명령이 모호할 수 있음 | Core 연구 지시는 M0/M1, 제품 지시는 아래 S0→S1→S2. 현재 기본 제품 경로를 명확히 제시 |

## 수정한 실행 순서

### S0 — 실행 기반과 디자인 기반 (I01 최소 기반 + I-UI)

작은 pnpm workspace, TypeScript strict, web/API test harness, DB integration harness를 준비한다. 앱 서비스 stub를 모두 만들지 않는다. build/check를 web build와 CI에 연결하고 branch required check를 설정할 권한자가 확인한다.

공통 Button/Field/Checkbox/Radio/Status/Notice/Card/Dialog와 layout primitives를 먼저 만든다. 동봉 타입과 recipe를 실제 React wrapper로 옮기고 variant API를 닫는다. auth를 기다리는 동안 공유 DTO mock 기반 UI 작업은 병렬 가능하다. 최종 auth 화면의 데이터 접근은 S1 이후 연결한다.

완료: 토큰 직접 변경 실패, component state gallery, keyboard/dialog/forced-colors/reduced-motion/IME 기본 검사, generated asset 재생성 일치. 아직 제품 auth 성공을 주장하지 않는다.

### S1 — 인증 spike와 권한 계약 (I00)

현재 후보 인증 라이브러리의 실제 schema·ID·Fastify/Drizzle 연동·advisory를 확인한다. invite-only 우회, MFA 전 세션, 정지·세션 철회, CSRF/origin, 복구 one-time token, authzVersion을 실제 시험한다. logical ERD의 vendor auth table을 그대로 만든 뒤 라이브러리 table을 중복 생성하지 않는다.

blocking 결과: 현재 stack에서 철회·초대/MFA 정책이 충족되지 않으면 해당 adapter 결정을 수정한다. UI 토큰과 도메인 전체를 다시 설계할 필요는 없다. candidate는 검증된 선정과 다르다. Better Auth는 cookie cache를 사용할 때 즉시 철회가 지연될 수 있으므로 이음의 초기 cache-off 방침을 실제 시험한다. [공식 세션 문서](https://better-auth.com/docs/concepts/session-management)

### S2 — 첫 계정·개인 공간 (I02/I03/I04의 최소 부분)

W01/W02/W03/W26의 로그인·온보딩·복구·보안, 개인 Workspace, 기본 Owner 역할, 최소 Operator 화면과 감사·설정·health를 연결한다. 최소 두 계정으로 같은 DB에서 query/첨부/cache/job의 격리 계약을 시험한다. 아직 없는 첨부/job 기능은 계약 테스트를 단계에 맞게 추가하고 통과했다고 선기재하지 않는다.

완료: 가입은 개인 공간 생성이지 다른 공간 공유가 아님; 마지막 Owner 보호; 계정 정지 직후 접근 차단; 수동 기능은 Core 비의존. 외부 공개는 G-F gate 전 금지한다.

### S3 — 첫 개인 사용 흐름 (I05/I06/I07)

`로그인 → 원본 기록 → 할일 생성/완료 → 결과 기록 → 위키`를 완성한다. Task와 일정, 위키는 명확한 상태를 가진다. I07 단계부터 공통 draft/version/동시 수정·한글 composition을 처리하고 초안을 잃지 않는 것을 완료 기준으로 한다.

66개 전체 모델을 한 번에 migration하지 않는다. 검증된 auth tables와 현재 기능에서 필요한 Workspace/원문/Task/Document 및 실제 link만 추가한다. 27개 화면 모두 빈 틀로 미리 생성하지 않는다.

### S4 — 정리·자료와 문서 정제 (I08/I09/I10)

scope 적용 검색, 제안함, 첨부 검증, Import/Export와 휴지통을 붙인다. 문서 정제는 공통 편집 기반에 source refs/claim mapping/자료 묶음을 추가한다. Core/모델이 실패해도 저장·수동 편집·작업 완료는 유지한다. 파일형식/외부 fetch/프로필 rebuild는 관련 테스트 통과 후 켠다.

### S5 — 검토·발행·API (I11/I12/I13)

sealed manifest, 현재 유효한 READY, 공개 snapshot, channel/slug/key 회전, 철회·asset·alias 경계를 실제 트랜잭션으로 검증한다. 독립 API 소비자로 목록/상세/개정/철회를 확인한다. 외부 블로그에는 내부 CSS/ORM/개인 세션을 공유하지 않는다.

I14 hardening은 매 단계에 포함한다. 특히 공개 릴리스 전 복원 시험과 삭제/철회 reconciliation이 필요하다. UI 표시만으로 DB constraints/RLS/권한/발행 검사를 대체하지 않는다.

## 보류와 진행을 분리한다

| 항목 | 상태 |
| --- | --- |
| 디자인 토큰·상태 기준 | 고정, 적용 시작 가능 |
| 작은 웹/공통 UI·인증 spike | GO |
| 전체 기능 병렬 구현 | 보류: 계약을 공유한 다음 세로 기능 단위로 진행 |
| auth vendor schema·RLS·트랜잭션 | 구현 중 선행 확인; 검증 전 계정 수용/공개 보류 |
| 자체 개인 사용 | G-F/G-P 충족한 기능부터 |
| 공개 Delivery 운영 | G-R + 복원/철회 gate 전 NO-GO |
| 네이티브·다크·협업·범용 자동화 | 기존대로 후속 |

예상 일수/속도/정확도는 이번 문서로 확정하지 않는다. 첫 S0/S1 결과로 작업량과 실제 의존성을 갱신한다. 성능 budget은 별도 측정과 품질 목표이지 예측된 수치가 아니다.

## 구현자에게 주는 첫 작업 지시

> S0만 시작하라. 디자인 정본과 component-state-contract, 인증/웹/ERD 계약을 읽고 최소 web/API/test harness와 토큰 build/check 연결, 공통 React UI wrapper 및 상태 gallery를 작성하라. primitive/임의 CSS appearance를 쓰지 말고 색·크기·상태는 고정 recipe를 사용하라. auth는 S1에서 실제 mapping을 확인하기 전 production schema를 추측하지 말라. 일정/문서/발행/코어 기능을 선행 구현하지 말고, 현재 필요한 package와 테스트만 만들어라. 성공/실패 명령, 실제 실행 환경, 미검증 범위, 다음 S1 질문을 보고하라.

사용자가 제품 구현을 승인하면 이 지시를 사용한다. 이번 작업의 **착수 가능 판정** 자체는 저장소에 제품 앱을 자동으로 구현하거나 배포하라는 승인이 아니다.
