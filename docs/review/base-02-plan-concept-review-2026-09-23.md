# BASE-02 시점 계획·제품 콘셉트 검토

범위: [제품 목적](../product/vision-and-scope.md), [로드맵](../plan/01-master-roadmap.md), [데이터/API 계약](../plan/05-data-api-and-state-contracts.md), [검증 gate](../plan/06-testing-and-release-gates.md), [요구사항·화면 추적](../plan/08-sources-and-traceability.md), 75개 카드와 현재 BASE-02 diff. 문서 계약의 정합성 검토이며 실제 제품 동작·보안·효용 검증이 아니다.

## 판정

현재 P0–P9 흐름은 제품의 세 책임인 **개인 관리 앱, 선택적 판단·정제 보조, 승인 발행·Delivery**를 모두 다룬다. R01–R14와 W01–W27의 카드 연결은 계획 검사로 확인했다. Core Lab 또는 단순 CRUD만으로 최종 제품 완료를 선언하지 않고, 수동 명령과 비동기 판단을 분리하는 방향도 제품 목적과 맞는다.

| 관점 | 문서에서 확인한 계약 | 구현 때 판별할 증거 |
| --- | --- | --- |
| 매일 쓰는 관리 도구 | 기록뿐 아니라 Task/Event/Wiki가 각자의 상태와 revision을 갖는다. 결과·경험은 다시 기록과 연결된다. | G3에서 Core/provider 중단 후에도 기록→할일/결과→일정/위키가 재시작 전후에 유지되는지 확인한다. |
| 정리 보조의 효용 | 후보 검색, 근거 제시, 제안/보류, 승인 적용이 다른 단계다. 추천 품질은 관찰 후 활성화한다. | G1/G4/G5에서 동일 원본 파생 중복·시점/권한 누수·오류와 미응답·승인 전 적용을 각각 반증한다. 실제 효용은 G9에서 별도 판정한다. |
| 문서의 신뢰성 | 개인 경험, 외부 주장, 반론, 사용자 해석, 모델 재서술의 출처를 구분하고 검토한 revision만 발행한다. | G6/G7에서 source/claim 변경과 stale READY, private canary, 개정/철회 후 Delivery 응답을 확인한다. |
| 운영 가능한 제품 | 공개 기능, 데이터 이식·삭제·복원, 실제 품질과 사용자 효용이 서로 다른 완료 조건이다. | G7 통과 뒤에도 G8의 새 환경 restore와 G9의 종단 인수 전에는 공개 운영 가능 또는 full V1으로 판정하지 않는다. |

이 설계는 사용자가 직접 완료·수정·발행하는 경로가 판단 품질과 독립적이라는 점에서 일관된다. 다만 이것은 문서 계약에 대한 판단이다. 실제 사용 편의, 추천 품질, 복원 가능성은 아직 측정하지 않았다.

## 발견과 반영

**보통 · P7 수동 발행의 장애 반례 누락.** 제품 불변식은 Core/provider 장애 중에도 명시적 발행이 가능해야 한다. 이전 BE-19와 QA-07 카드에는 stale READY·철회·private 자료 누출 반례는 있었지만 Core/worker 불가 중 발행의 필수 실행이 없었다. [backlog.json](../plan/backlog.json)의 BE-19와 QA-07 필수 검증에 이 상황을 추가하고 생성 문서를 갱신했다. 구현 때 발행 명령이 판단 job의 성공이나 worker 가용성을 기다리지 않는지 확인해야 한다.

## 남은 검증 경계

- BASE-02의 통과는 패키지 경계와 최소 실행 증거다. raw revision/span, 다중 맥락, 제안/보류, provenance, 공개 projection의 구현 증거가 아니다.
- 인증 라이브러리·DB role/RLS·편집기 호환성은 BE-02/03과 FE-02에서 실제 버전과 통합 반례로 결정해야 한다. 현재 기술 이름을 검증 완료로 승격하지 않는다.
- 판단 품질의 pilot 목표는 실제 허용 데이터의 관찰값이 아니다. G1/G4/G9에서 합성 fixture, 실제 품질, 사용자 효용을 분리한다.
- G7의 공개 기능 검증만으로 공개 운영 가능 상태가 되지 않는다. 삭제·복원·운영 G8과 종단 G9가 남는다.

## 계획 실행 전 정리와 착수 판정

2026-09-23 재점검에서 참조되지 않는 `docs/status/plan-adoption-diff.json`을 제거했다. 이 파일은 과거 계획 1.0→1.1 채택 수치의 중복 요약이며 실행 검사나 현재 카드 상태의 입력이 아니었다. Git에서 무시하는 로컬 `.pnpm-store`, `node_modules`, core/lab `dist`와 패키지별 `node_modules`, 생성된 디자인 CSS/TS도 지웠다. 정본 `backlog.json`, 생성 카드·목록, BASE-01의 검사 입력인 `cleanup-manifest.json`, 보존 대상으로 지정된 디자인·UI 소스와 BASE-02 인프라 원본은 유지했다. 준비 검사는 필요한 디자인 출력을 다시 생성하고, workspace 검사는 lockfile로 의존성을 설치한 뒤 실행한다.

**판정: 계획은 단계적으로 실행 가능하지만 다음 제품 카드는 아직 착수 불가.** 정리 후 `npm run plan:check`가 75개 카드·27개 화면·14개 요구사항·184개 로컬 링크와 생성 문서의 일치를 통과했다. 검사 결과의 `readyTasks: []`는 BASE-02가 `IMPLEMENTED`이기 때문이다. BASE-02의 로컬 고정 설치·검사는 [증거](../evidence/base-02.md)에 있지만, 완료 기준인 새 기기 재현과 원격 Linux CI 결과는 아직 없다.

1. 현재 main의 미커밋 계획/BASE-02 변경을 diff로 검토하고 기능 ID가 있는 커밋으로 반영한다. 사용자 변경을 덮어쓰거나 원격 main을 강제 이동하지 않는다.
2. 해당 commit에서 GitHub Actions의 preparation/workspace job과 새 환경의 `pnpm install --frozen-lockfile`→lint/format/typecheck/unit/build/smoke를 확인한다. 실패하면 원인을 해결하고 같은 기준으로 다시 검사한다.
3. 실제 증거를 기록한 뒤 BASE-02를 `VERIFIED`로 올리고 `node scripts/plan/render.mjs`와 계획 검사를 실행한다. 그때 BASE-03을 다음 우선 카드로 착수한다. BE-01/FE-01도 개별 선행관계상 열리지만, 공유 계약·설정 변경은 직렬로 반영한다.
4. BASE-03은 작은 schema→OpenAPI→client 왕복과 private DTO 유출·금지 import 실패를 닫아야 한다. 이후 auth/editor 통합은 BE-02/FE-02의 spike 결과로 결정한다. 운영 DB, 배포, 실제 사용자 데이터는 각 카드의 승인·격리·복구 조건 전에는 실행하지 않는다.

따라서 현재 저장소는 **제품 기능 구현 전의 준비 단계**다. BASE-02 소스와 CI 정의가 있다는 사실만으로 선행 카드가 검증되었거나 전체 제품이 실행된다고 판정하지 않는다.
