# IEUM 구현 작업 규칙

이 파일은 저장소 구현 지침이다. 제품 요구, 세부 설계, 실험 결과를 대신하지 않는다.

## 먼저 읽을 문서

- [README](README.md), [제품 목적](docs/product/vision-and-scope.md), [앱·발행 경계](docs/architecture/application-and-publishing.md)
- Core 작업: [Core 구조](docs/architecture/judgement-core.md), [실험 계획](docs/plan/core-lab-experiment-plan.md)
- 웹 작업: [기능 명세](docs/product/web-functional-spec.md), [인증·권한](docs/architecture/identity-and-access.md), [웹 구조](docs/architecture/web-application-design.md), [데이터·운영](docs/architecture/data-and-operations.md), [웹 계획](docs/plan/web-product-implementation-plan.md)

세부 계약은 문서별 책임에 따라 읽는다. 충돌을 발견하면 임의 혼합하지 말고 더 구체적인 계약과 변경 이유를 확인한다. `Superseded` ADR을 현재 규칙으로 적용하지 않는다. 제품 경계는 ADR 0007, 웹 기반 보완은 ADR 0008이다.

## 제품 전체와 작업 범위

이음은 내부 사용자 웹·앱과 관리 백엔드가 있는 개인 관리 제품이다. 일정·할일·위키·문서 작성·검토·발행·Delivery API는 제품 범위이며 Core는 일부 의미 판단을 맡는다. 외부 블로그 독자 화면은 별도다. 모든 저장·편집·완료·수동 발행을 모델 응답에 묶지 않는다.

별도 지시가 없는 최초 Core 구현은 **M0+M1**이다. 순수 TS, 파일 어댑터/CLI, 합성 fixture, 시점 Replay, 후보·보류·근거, 수동 선택 이력과 evidence pack을 구현한다. 제품 DB/UI/Delivery·모델·구조 변경기를 선행 구현하지 않는다. M2 의미 검색은 baseline 측정 후 진행하며 lexical 정확도 통과가 전제는 아니다.

사용자가 **웹 제품 기반 구현을 명시적으로 지시하면 M3-A/F**부터 시작한다. 내부 web/API, auth 통합 시험, 개인 Workspace, 초대형 회원·세션·권한, 최소 감사/health/설정과 격리 테스트가 범위다. P/D/R은 이후 작은 단계로 나눈다. 웹 설계 문서 작성만으로 코드 구현을 승인받았다고 해석하지 않는다.

Core/Lab 문서의 UI/발행 제외는 첫 판단 실험의 경계다. 최종 제품의 내부 UI와 문서 편집을 선택 사항으로 만들거나 발행을 파일 export로만 제한하지 않는다.

## 원본·판단·발행 불변식

1. 원문을 정규화·요약 결과로 덮어쓰지 않는다. 출처는 원문 revision과 범위를 참조한다.
2. ThoughtUnit은 여러 Context에 연결될 수 있다. primary는 선택 사항이며 최대 하나다.
3. 검색 점수·승인·같은 의견 반복을 진실성이나 독립 근거로 해석하지 않는다. 보정된 모델이 없으면 확률 필드는 null이다.
4. missing, 측정된 0, 명시적 반박, 미응답을 구분한다. 권한/정답/현재 입력/미래 자료 누수를 막는다.
5. 의미 변경은 사용자 명령 또는 승인된 Proposal로 적용한다. 생성 모델에 DB·파일·발행 쓰기 권한을 주지 않는다.
6. 입력·맥락·검색 결과·설정·모델 revision을 기록한다. 동일 snapshot 반복은 새 증거가 아니다.
7. 명시적 사용자 지정은 추천 성능에서 분리하고 노출되지 않은 사례를 거절로 학습하지 않는다.
8. Task/Event/Wiki는 실제 상태가 있는 관리 대상이다. 원문 변경으로 승인된 작업 상태를 자동 덮어쓰지 않는다.
9. 공개본은 검토한 문서 revision에서 만든다. Draft 변경이 공개본을 바꾸지 않으며 private source/trace/첨부를 Delivery에 섞지 않는다.

## 인증·소유·운영 불변식

1. User, 개인 Workspace, InstanceOperator, Workspace Owner를 분리한다. 서비스 초대는 기존 공간 공유가 아니다. 초기 공간은 Owner-only다.
2. 실제 사용자 웹에서 인증·권한을 생략하지 않는다. 공개 signup은 끄고 auth 라이브러리의 우회 endpoint까지 검사한다.
3. 운영자 역할만으로 개인 본문을 열람하지 않는다. 편집·발행·전체 export·영구 삭제·key 관리·운영을 구분한다.
4. HTTP뿐 아니라 검색 결과/개수, 첨부, cache, profile/vector, job, export, 로그에도 scope를 적용한다. 금지 자료를 모델에 보낸 후 결과에서 지우는 방식은 금지다.
5. 서버가 현재 session/account/membership/action/resource 상태를 검사한다. 프론트 버튼과 role cache는 권한 근거가 아니다. 철회가 즉시 반영되는지 테스트한다.
6. password·session/API token·reset URL·원문/prompt 전체·DB 연결문자열을 일반 로그나 공개 fixture에 넣지 않는다.
7. 민감 변경의 감사와 outbox는 같은 transaction에 기록한다. 외부 collector 장애와 DB 감사 실패를 구분한다. audit 로그를 절대 변조 불가라고 주장하지 않는다.
8. 자동저장 충돌·idempotency·stale Proposal·중복 job·삭제 후 재생성을 테스트한다. public asset도 별도 공개 승인을 받는다.
9. 개인 Export와 전체 Backup을 구분한다. 운영 복원은 제한된 절차로 수행하고 파일 생성 성공을 복원 성공으로 보고하지 않는다.
10. 실제 개인정보·비공개 데이터·embedding·secret·private export를 공개 저장소에 커밋하지 않는다. 비밀값은 설정됨 여부만 반환한다.

## 구현 기준

`packages/core`는 동기적 계산과 도메인 타입 중심이다. DB·네트워크·모델 I/O는 application/adapter에서 끝내고 권한 내 불변 snapshot을 넘긴다. evaluator마다 SQL을 실행하는 N+1을 만들지 않는다.

strict TS, finite number 검증, stable tie-break, 주입 clock·seed, 빈 집합 처리, typed failure를 사용한다. case ID에 맞춘 production 정답 하드코딩과 불필요한 generic framework를 금지한다. 웹 modules는 구현 중인 기능만 만들고 ORM 타입을 Core/Delivery DTO에 노출하지 않는다.

라이브러리 버전은 호환성·현재 advisory·실제 설정 시험 후 lockfile에 고정한다. auth·MFA·CSRF·RLS를 문서의 이름만으로 구현 완료라고 취급하지 않는다. 외부 public signup/URL fetch/upload/공유 기능은 관련 gate를 통과한 뒤 켠다.

## 완료 보고

실제로 존재하고 실행한 검사만 보고한다. 기능 ID, 파일/schema/API, 명령과 성공/실패, fixture/실제 데이터 구분, 비활성·미구현 기능, 측정하지 않은 성능과 알려진 위험을 남긴다. DB/UI가 없는데 integration/E2E 통과라고 쓰지 않는다.

가중치·임계값·모델·정규화기 변경에는 비교 결과를 남긴다. test를 보고 튜닝했다면 새 holdout을 확보한다. 웹 제품에서는 두 사용자 격리, 수동 기본 흐름, Core 실패, 자동저장 충돌, 발행/개정/철회, 공개 API 계약, 백업 복원까지 단계에 맞춰 검사한다.
