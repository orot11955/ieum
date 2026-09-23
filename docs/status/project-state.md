# IEUM 프로젝트 상태 · BE-10 VERIFIED, CORE-16 BLOCKED

- 검증 기준: main `609fb4c` (2026-09-24 KST, BE-10 GitHub Actions run `35904937096` 전체 성공)
- 실행 정본: [계획 1.1](../plan/README.md), [backlog](../plan/backlog.json)
- 완료 범위: **BASE-01–03, CORE-01–15, BE-01–05, BE-07–10 VERIFIED**. 원본·근거·시점 snapshot, lexical/semantic/hybrid 관찰 검색과 합성 평가, 근거 묶음, 추출 후보, 구조 진단·변경안 미리보기, 문서 계획·claim 검증 계약, Nest/Fastify 조립, 실제 DB 인증·업무 workspace/RLS·계정/초대/세션/복구·명령/감사/outbox·원문/unit revision·다중 Context 소속과 관계·독립 Task 수명·결과 원본·일정 시간대/DST까지 확인했다.
- 진행 중: 다음 독립 서버 카드는 **BE-06 비동기 작업**이다. BE-11은 FE-01→FE-02 선행 검증을 기다린다. **CORE-16은 FE-14·FE-16과 허용된 실제 기록/holdout 부재로 BLOCKED**다.
- 브랜치 정책: main 직접 작업, 새 브랜치/PR/force push 없음

## 실제 현재 상태

| 영역 | 상태 | 다음 담당 |
|---|---|---|
| 원본 제품 목적·권한·도메인·화면/ERD 계약 | 보존된 설계; 새 실행 정본 아래 참고 | 해당 BASE/CORE/BE/FE 카드 |
| Paper/Dark 토큰·recipe·lock·생성/검사 스크립트 | 보존, 준비 검사 대상 | FE-01 |
| 공통 React UI·theme-init·theme unit test | 보존한 소스 표본; runtime/브라우저 미검증 | FE-01 |
| 75개 작업 카드와 렌더/정합성 검사 | BASE-01–03·CORE-01–15·BE-01–05·BE-07–10 VERIFIED, CORE-16 BLOCKED | BE-06·FE-01 |
| pnpm workspace·strict TS·Vitest·lint/format·core/lab/API build와 CI 정의 | Node 24.18.0 로컬 검사와 Linux GitHub Actions 통과 | BE-02·FE-01 제품 기반 |
| 관리/Delivery Zod·OpenAPI·client 타입, Core 원본·근거 검증/시점 snapshot/lexical·semantic·hybrid 후보 검색·관찰 판단 기준선 | 합성 예제와 Linux CI 통과; 계정·원문 HTTP/DB만 구현 | 후속 BE/FE 카드 |
| 판단 Core·Lab·실제 판단 품질 | 합성 40 Context/60 query에서 B0 Recall@10 49/50, 합성 B1 37/50, B2/B3 47.5/50. 구조·문서 계약은 검증됐으나 실제 사용자 품질 미평가, 활성 제안 설정 없음 | CORE-16은 FE-14·FE-16/실제 자료 후 재개 |
| Nest API·인증·DB·worker·업무 기능 | BE-01–05·BE-07–10이 Linux CI 통과. job API 미구현 | BE-06·11–26 |
| 내부 업무 웹·편집기·브라우저 E2E | 미구현 | FE-01–21 |
| Delivery·운영 복원·개인 데이터 migration | 미구현/미검증 | P7–P9 |
| 실제 운영 DB/배포/사용자 기기 작업 트리 | 미접근·미확인·미변경 | 실제 작업 전에 명시적으로 확인 |

## 정리 판단

BASE-01에서 삭제된 제품 경로를 실행하는 npm scripts·의존성/lock·root TS/Vitest/Vite 설정과 깨진 web index를 걷어냈다. 기존 다크 theme-init와 공통 UI/test는 재사용 가치가 있어 보존했다. 옛 제품 패치를 자동 적용하거나 패키지를 자동 고정하는 workflow는 제거했다. 현재 CI 정의는 준비 검사와 고정 lockfile 기반 core/lab·계약 예제 검사를 수행한다.

과거 4개 실행 계획은 Git 이력에 남고 현재 트리에서는 새 계획으로 대체한다. 시점별 검토 3건은 R01–R18 등 설계 판단 근거를 보존하기 위해 참고 문서로 유지한다. 제품/아키텍처/디자인/ADR는 근거와 불변식을 잃지 않도록 보존하며, 옛 실행 링크와 문서 우선순위를 정리한다. 정본 ZIP·통합본·과거 validation 보고서도 중복 체크인하지 않는다.

파일별 삭제·보존과 확인한 hash는 [정리 manifest](cleanup-manifest.json)에 있다. 삭제는 Git 관리 파일만 대상으로 하며 사용자 디스크/DB/backup을 다루지 않는다.

## 준비 검증과 다음 행동

실제 실행 결과는 [BASE-01 증거](../evidence/base-01.md), [BASE-02 증거](../evidence/base-02.md), [BASE-03 증거](../evidence/base-03.md), [CORE-01 증거](../evidence/core-01.md), [CORE-02 증거](../evidence/core-02.md), [CORE-03 증거](../evidence/core-03.md), [CORE-04 증거](../evidence/core-04.md), [CORE-05 증거](../evidence/core-05.md), [CORE-06 증거](../evidence/core-06.md), [CORE-07 증거](../evidence/core-07.md), [CORE-08 증거](../evidence/core-08.md), [CORE-09 증거](../evidence/core-09.md), [CORE-10 증거](../evidence/core-10.md), [CORE-11 증거](../evidence/core-11.md), [CORE-12 증거](../evidence/core-12.md), [CORE-13 증거](../evidence/core-13.md), [CORE-14 증거](../evidence/core-14.md), [CORE-15 증거](../evidence/core-15.md), [CORE-16 차단 근거](../evidence/core-16.md)를 따른다. plan/design 검사 통과를 제품 typecheck/build/DB/E2E 통과로 해석하지 않고, core/lab 빌드를 완성된 판단 기능 검증으로 확대하지 않는다. CORE-07/09/10은 합성 자료의 회귀 평가이며 실제 사용자 품질·제안 precision은 검증하지 않았다. workflow는 원격 Linux에서 통과했지만 브랜치 보호 설정은 확인하지 못했으므로 main 반영 차단이 설정됐다고 주장하지 않는다.

BE-02의 PostgreSQL·CI 시험은 [BE-02 증거](../evidence/be-02.md)와 [auth spike 보고서](../evidence/auth-spike-report.md)에 있다. BE-03의 로컬/Linux PostgreSQL·role/RLS 반례는 [BE-03 증거](../evidence/be-03.md)에 있다. BE-04의 계정·초대·MFA·세션·복구와 로컬 PostgreSQL 반례는 [BE-04 증거](../evidence/be-04.md)에 있다.

BE-05의 명령·멱등성·감사·outbox 및 로컬/Linux PostgreSQL/HTTP 반례는 [BE-05 증거](../evidence/be-05.md)에 있다.

BE-07의 원문·unit revision, UTF-16 분할, 출처 중복, 개인 공간 격리와 로컬/Linux PostgreSQL/HTTP 반례는 [BE-07 증거](../evidence/be-07.md)에 있다.

BE-08의 Context identity/membership revision, 다중 소속, 단일 primary, 관계·순환·보관 검색과 로컬 PostgreSQL/HTTP 반례는 [BE-08 증거](../evidence/be-08.md)에 있다.

BE-09의 Task 독립 상태 전이, DATE/INSTANT 기한, 결과→새 Capture와 로컬 PostgreSQL/HTTP 반례는 [BE-09 증거](../evidence/be-09.md)에 있다.

BE-10의 일정 UTC/IANA·종일 날짜·DST gap/fold·변경/취소와 로컬/Linux PostgreSQL/HTTP 반례는 [BE-10 증거](../evidence/be-10.md)에 있다.

다음 카드로 넘어가기 전 [실행 지시문](../plan/07-codex-execution-playbook.md)을 적용한다. 원격 main과 로컬 변경, 대상 카드의 선행 검증 상태를 먼저 확인한다. 운영 DB가 있는지 알 수 없으므로 새 격리된 개발 DB 외에는 연결하지 않는다.

## 과거 검토 기록

이전 리뷰는 보존된 docs/review와 기준 commit `f4ccbc233aa5c62f3310e00d483c2115f145876a`의 `docs/review/`에서 Git 이력으로 확인한다. 과거 제품 코드의 구조 부족은 계획 00의 역사적 비교에 남아 있다. 그것을 현재 main에 제품 코드가 남아 있다는 주장으로 사용하지 않는다.
