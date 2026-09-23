# 09 · 단계별 구현 순서와 충돌 정리

상태: **구현 계획**. 이 문서는 새 작업 카드나 구현 허가가 아니다. 75개 카드의 범위·선행·상태·완료 기준은 [backlog.json](backlog.json)이 정본이다. 아래 순서는 그 선행 그래프를 사용자 기능 단위로 풀어 쓴 실행안이다. 현재 공통 UI 소스와 core/lab 빌드·계약 예제·원본 근거 모델·시점 snapshot은 있지만 판단 점수·후보 로직/API/업무 웹 기능은 미구현이다. BASE-01–03과 CORE-01/02는 VERIFIED다.

## 1. 공통 실행 규칙

1. 구현 지시를 받으면 main의 `git status`, 로컬/원격 차이, 사용자 변경, `npm run prep:check`를 확인한다. 원격 main이 바뀌었으면 변경된 계약을 재검토한다. 문서 기준 SHA `f4ccbc2`는 BASE-01의 검토 출발점이며 현재 HEAD로 고정하라는 뜻이 아니다.
2. `backlog.json`에서 해당 카드의 모든 선행이 VERIFIED/ACCEPTED인지 확인한다. 단계 번호가 앞서도 선행을 건너뛰지 않는다. P0의 모든 spike가 끝나기 전에도 BASE-03이 VERIFIED면 CORE-01을 시작할 수 있다.
3. 카드마다 정상·실패·동시성/충돌 반례, 입력/출력·권한·revision 계약을 먼저 정한다. 계약/schema → 순수 규칙 → 저장/명령 → HTTP → 화면 → 통합 검증 순으로 필요한 부분만 구현한다. 여러 영역이 걸리면 공유 contract/migration/lockfile을 한 소유자가 직렬로 반영한다.
4. 카드의 실제 명령·exit code·환경·반례·데이터 영향·미검증을 `docs/evidence/<id>.md`에 남긴다. 통과한 범위만 VERIFIED로 올리고 `node scripts/plan/render.mjs`와 계획 검사를 실행한다. 기능 ID가 있는 작은 커밋으로 main에 반영하되 실패하는 중간 상태를 원격 main에 올리지 않는다.
5. 실제 운영 DB, 사용자 데이터, 배포는 별도 inventory·backup·허가 전에는 다루지 않는다. 새 격리 개발 DB와 합성 fixture를 사용한다. 실제 품질·운영 복원은 별도 증거로 판정한다.

## 2. 실행 묶음

표의 화살표는 권장 착수 순서다. 한 행의 카드 모두를 한 커밋으로 묶으라는 뜻이 아니다. 서로 독립된 행은 선행 조건을 충족하면 앞뒤를 바꿀 수 있지만, 같은 working tree의 공유 파일 수정은 직렬로 통합한다.

| 묶음 | 카드와 순서 | 구현 산출물 | 완료 확인과 진행 조건 |
|---|---|---|---|
| 0 · 현재 기준선 | BASE-01(VERIFIED) | 계획·디자인 준비 기준선 | 기존 [증거](../evidence/base-01.md)를 확인한다. 제품 build/DB/E2E 증거로 확대 해석하지 않는다. |
| 1 · 실행 토대 | BASE-02 → BASE-03 | strict TS/core·lab 최소 빌드, 패키지 경계, management/Delivery/editor 계약의 작은 왕복 예제 | 깨끗한 설치·typecheck·test·build, 잘못된 import/DTO 유출 실패. 새 패키지와 명령의 실제 버전을 증거에 고정한다. |
| 2 · 독립 Core 기초 | CORE-01 → CORE-02 → CORE-03 → CORE-04 | 불변 원문/span·시점/권한 snapshot·lexical 기준선·origin별 후보/예산 | 이모지 span, 미래/동일 원본/타 공간 누수, query의 IDF 유입, 동점/잘림/후보 누락 반례. Core에는 DB·HTTP·모델 I/O가 없어야 한다. |
| 3 · 판단 수직 흐름 | CORE-05 → CORE-06 → CORE-07; CORE-08은 CORE-06 뒤 | candidate/abstain·근거, 불변 replay, label/메트릭, 사용자가 선택한 evidence pack | 동일 snapshot 결정 재생, missing/0/error 분리, unknown label·origin 분할 누수 차단, 출처 없는 문장 미생성. QA-02로 G1을 검증한다. B0 품질 수치는 다음 실험의 기준선이지 자동 추천 허가가 아니다. |
| 4 · P0 호환성 spike | BE-01 → BE-02; FE-01 → FE-02; 모두 끝나면 QA-01 | Nest/Fastify 실행 예제, auth adapter, 두 테마 상태 gallery, editor/typed client 예제, 실패하는 CI 규칙 | 인증 cookie/MFA/철회·IME/block ID·focus/forced-colors·공개 DTO 누출 반례. QA-01은 BE-02/FE-02 이후 G0를 확인한다. 이 묶음은 BASE-03 이후 Core 묶음과 독립 진행 가능하다. |
| 5 · 개인 공간 | BE-03 → BE-04 → BE-05; BE-04 뒤 FE-03 → FE-04; 마지막 QA-03 | 실제 PostgreSQL role/RLS, 계정·Owner/Operator, session/복구, receipt/감사, 로그인 웹 | 두 사용자 교차 접근, pool scope 누수, MFA 미완료/철회, 마지막 Owner, 중복 명령/감사 실패를 실제 DB와 브라우저로 확인해 G2를 닫는다. |
| 6 · 원문과 맥락 | BE-07 → FE-05 → BE-08 → FE-06 | 원문 revision·unit 분할, 기록함, 다중 membership·관계, 맥락 화면 | 이전 revision/span 불변, 원문 수정 후 분할 재검토, primary 최대 하나, 경쟁하는 연결과 낡은 화면 응답. CORE-01 타입은 저장 모델과 명시적으로 매핑한다. |
| 7 · 관리 항목 | BE-09 → FE-07; BE-10 → FE-08 | 할일/결과와 일정의 독립 lifecycle, 기한·시간대 UI | 완료한 Task가 원문 수정으로 재개되지 않음, 결과 origin 보존, 종일/시간대/DST·변경/취소와 오래된 revision 충돌. |
| 8 · 위키와 홈 | BE-11 → FE-09 → FE-10 → QA-04 | 공통 draft/revision 엔진, autosave/IME/충돌, 기록→행동→지식 홈 | 두 탭·역순 ACK·저장 실패·세션 만료. Core/provider를 끄고 로그인→기록→다중 맥락→할일/결과→일정/위키를 재시작 후까지 E2E로 확인해 G3를 닫는다. |
| 9 · 판단 연결 | CORE-09 → CORE-10; BE-06 → BE-12 → BE-13 → FE-12 | exact semantic/hybrid 비교, worker/outbox, scope 고정 snapshot/profile, 제안·노출·승인 UI | 동일 eligible set 비교, stale result, worker kill/중복, actor 철회, 원자적 승인. 실제 품질과 정책이 충분하지 않으면 observe를 유지한다. |
| 10 · 추출과 검색 | CORE-11 → BE-14 → FE-13; BE-26 → FE-11; 마지막 QA-05 | 자유 기록의 할일/일정 후보와 승인 명령, 별도의 통합 검색 | 모호한 날짜·중복 생성·동일 origin·권한 밖 검색 결과·cursor 범위. QA-05는 판단/추출 G4이며 P4 전체 완료에는 BE-26/FE-11 검증도 필요하다. |
| 11 · 맥락 구조 | CORE-12 → CORE-13 → BE-15 → FE-14 | 목적/bridge 진단, split/merge/link 대안, before/after·원자 적용·inverse | 원본 파생물의 독립 근거 과대 가산 금지, 다중 맥락 bridge 유지, 새 기록 후 Undo 충돌. G5 증거를 이 시점에 남기고 QA-06에서 다시 검토한다. 품질 미달이면 적용 기능을 비활성화한다. |
| 12 · 수동 문서 작업실 | CORE-14 → BE-16 → FE-15 | evidence pack·관점/outline/readiness, 출처와 claim이 있는 수동 문서 | 자기 경험/외부 주장/반론 구별, 원문 수정·삭제의 stale 표시, block 변경 뒤 claim 재검토. 모델 없이 문서를 완성할 수 있어야 한다. |
| 13 · 선택적 정제 | CORE-15 → BE-17 → FE-16 | 모델 초안 검증, opt-in provider job, diff와 부분 적용 | 지어낸 source·변경된 claim·prompt 지시·provider 실패·생성 중 사용자 편집. 결과는 검토 전 draft를 덮어쓰지 않는다. P7의 수동 발행 개발은 이 기능의 성공에 종속되지 않는다. |
| 14 · 첨부와 문서 gate | BE-18 → FE-17; 구조/문서 카드 뒤 QA-06 | private asset/검증/public derivative, 파일 UI, G5/G6 보고서 | 다른 사용자 다운로드, MIME/경로/메타데이터, 검증 전 사용, 모델 오류 격리. QA-06은 구조와 문서를 별도 판정하며 full V1의 두 영역을 함께 확인한다. |
| 15 · 발행 | BE-19 → BE-20 → FE-18 → QA-07 | READY manifest·immutable 공개 projection·Delivery 전용 role/API·검토 UI·독립 소비자 | stale review, r7 발행 중 draft r8 수정, private canary, alias/asset/304 우회, 철회·credential 폐기. G7은 공개 기능의 검증이며 공개 운영 승인은 아니다. |
| 16 · 개인 데이터 수명 | BE-21 → BE-22 → FE-19 | import/export dry-run, 휴지통/복원/영구 삭제 영향 화면 | 중복/참조 누락·권한 변경 후 다운로드·삭제 후 출처 경고. Export 파일과 운영 backup의 목적/복구 범위를 분리한다. |
| 17 · 운영·복원 | BE-23 → BE-24 → FE-20 → QA-08 | 계정·job·설정/로그, backup manifest, 배포/복원 절차, 운영 화면 | 새 빈 환경 restore, 누락 asset, 이전 backup의 삭제/철회 재노출, role/credential 복구, 실패 rollback. 운영 DB 변경은 별도 승인된 범위에서만 한다. |
| 18 · 최종 인수 | CORE-16; BE-25; FE-21; 마지막 QA-09 | 실제 품질·효용 보고, 실측 성능, 27화면 상태·접근성, 종단 릴리스 판정 | G1–G8 증거와 실제 허용 데이터/환경의 한계를 묶어 G9를 판정한다. 수동 사용 가능, 의미 판단 활성, full V1, 공개 운영 가능을 각각 표기한다. |

## 3. 모순처럼 보이던 지점의 적용 결정

| 지점 | 적용 결정과 근거 |
|---|---|
| 과거 M/S/I·F/P/D/R 단계와 P0–P9 | 실행 순서는 ADR 0012와 현재 backlog의 P0–P9다. 이전 번호는 요구사항·변경 경위의 출처이며 새 카드 선행 조건을 덮지 않는다. |
| BASE-01만 VERIFIED인데 로드맵의 “모두 PLANNED” | [로드맵](01-master-roadmap.md)의 오래된 문장을 정본 상태에 맞췄다. 이후 상태 변경은 backlog에서 하고 renderer로 파생 문서를 갱신한다. |
| “Core 먼저”와 P0 auth/editor spike | BASE-03 뒤에는 Core와 spike의 카드 선행이 각각 열린다. Core Lab 실험 때문에 모든 P0 spike를 기다리지 않는다. P2 관련 카드의 착수는 각 카드 선행을 따르고, P2 전체 인수 전에는 인증 spike와 G0 증거를 확인한다. |
| G0에 auth/editor가 있으나 QA-01 선행에는 없었음 | QA-01 선행을 BE-02·FE-02로, P2 인수 QA-03의 선행에 QA-01을 추가했다. 따라서 실제 두 spike와 G0 증거 없이 개인 공간 G2를 닫을 수 없다. |
| main 직접 커밋과 “merge 검증 차단” | QA-01의 증명 범위는 위반 시 로컬 검사/CI job 실패다. branch protection은 확인된 설정이 아니므로 push 차단을 약속하지 않는다. |
| P4 목록에 검색이 있으나 QA-05는 판단/추출만 검증 | QA-05는 G4에 한정한다. BE-26/FE-11의 검색·scope·cursor 반례가 VERIFIED여야 P4 전체 완료다. |
| P6 모델 정제와 P7 수동 발행의 선행 | BE-19는 BE-16/BE-18을 요구하며 모델 정제 BE-17을 요구하지 않는다. 수동 문서의 승인 발행 개발은 가능하지만 모델 정제와 G6 미검증을 full V1 완료로 표시하지 않는다. |
| G7 공개 기능과 “공개 운영 가능” | G7은 공개 DTO·철회·독립 소비자 검증이다. 복원/삭제/운영 G8과 전체 G9 전에는 공개 운영 가능으로 판정하지 않는다. |
| 이전 ADR의 특정 라이브러리 버전·구현 경로 | ADR 0012와 계획 00의 후보/검증 gate가 현재 실행 결정을 이끈다. 실제 버전·auth/queue/editor adapter는 BASE-02 및 해당 spike에서 호환성·보안·실행 증거를 확인한 뒤 고정한다. 과거 숫자를 설치 지시로 사용하지 않는다. |

## 4. 카드별 인계와 중단 기준

각 카드 착수 기록에는 **목표, 선행 카드와 증거, 수정 가능 경로, 바꾸지 않을 계약, 정상/실패/경쟁 반례, 실행 명령, 미검증·복구 방법**을 적는다. 실제 코드가 생기면 그 카드에 필요한 테스트 명령을 추가한다. 아직 없는 제품 명령을 준비 검사 성공으로 대신하지 않는다.

계약/스키마/권한 경계가 예상보다 커지면 다음 카드로 넘기지 말고 영향 카드와 데이터 변환·호환성·검증을 먼저 갱신한다. 인증·공개·삭제·복원은 테스트 통과만으로 운영 데이터 작업을 허가하지 않는다. 품질 표본 부족이나 외부 provider 장애는 해당 기능의 상태를 제한하고, 원본 저장·할일 완료·위키 편집·명시적 발행의 수동 경로는 계속 검증한다.
