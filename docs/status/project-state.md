# IEUM 프로젝트 상태 · BASE-03 VERIFIED, CORE-01 다음

- 검증 기준: main `744bd6bcefee427908dbf93efdb50df6919a8a7b` (2026-09-23 KST, GitHub Actions 성공)
- 실행 정본: [계획 1.1](../plan/README.md), [backlog](../plan/backlog.json)
- 완료 범위: **BASE-01 저장소/문서 준비, BASE-02 최소 workspace·CI, BASE-03 관리/Delivery/Core 계약 예제**. 세 카드 모두 VERIFIED
- 다음 구현: **CORE-01–08**; BE-01·FE-01도 선행 조건 충족
- 브랜치 정책: main 직접 작업, 새 브랜치/PR/force push 없음

## 실제 현재 상태

| 영역 | 상태 | 다음 담당 |
|---|---|---|
| 원본 제품 목적·권한·도메인·화면/ERD 계약 | 보존된 설계; 새 실행 정본 아래 참고 | 해당 BASE/CORE/BE/FE 카드 |
| Paper/Dark 토큰·recipe·lock·생성/검사 스크립트 | 보존, 준비 검사 대상 | FE-01 |
| 공통 React UI·theme-init·theme unit test | 보존한 소스 표본; runtime/브라우저 미검증 | FE-01 |
| 75개 작업 카드와 렌더/정합성 검사 | BASE-01–03 VERIFIED, 나머지 PLANNED | CORE-01 |
| pnpm workspace·strict TS·Vitest·lint/format·core/lab build와 CI 정의 | Node 24.18.0 로컬 검사와 Linux GitHub Actions 통과 | CORE-01 모델 |
| 관리/Delivery Zod·OpenAPI·client 타입, Core UTF-16 span, 경계 검사 | 합성 예제와 Linux CI 통과; 실제 HTTP/DB 없음 | CORE-01, BE-01, FE-01 |
| 판단 Core·Lab·실제 판단 품질 | 미구현/미평가 | CORE-01–16 |
| Nest API·인증·DB·worker·업무 기능 | 미구현 | BE-01–26 |
| 내부 업무 웹·편집기·브라우저 E2E | 미구현 | FE-01–21 |
| Delivery·운영 복원·개인 데이터 migration | 미구현/미검증 | P7–P9 |
| 실제 운영 DB/배포/사용자 기기 작업 트리 | 미접근·미확인·미변경 | 실제 작업 전에 명시적으로 확인 |

## 정리 판단

BASE-01에서 삭제된 제품 경로를 실행하는 npm scripts·의존성/lock·root TS/Vitest/Vite 설정과 깨진 web index를 걷어냈다. 기존 다크 theme-init와 공통 UI/test는 재사용 가치가 있어 보존했다. 옛 제품 패치를 자동 적용하거나 패키지를 자동 고정하는 workflow는 제거했다. 현재 CI 정의는 준비 검사와 고정 lockfile 기반 core/lab·계약 예제 검사를 수행한다.

과거 4개 실행 계획은 Git 이력에 남고 현재 트리에서는 새 계획으로 대체한다. 시점별 검토 3건은 R01–R18 등 설계 판단 근거를 보존하기 위해 참고 문서로 유지한다. 제품/아키텍처/디자인/ADR는 근거와 불변식을 잃지 않도록 보존하며, 옛 실행 링크와 문서 우선순위를 정리한다. 정본 ZIP·통합본·과거 validation 보고서도 중복 체크인하지 않는다.

파일별 삭제·보존과 확인한 hash는 [정리 manifest](cleanup-manifest.json)에 있다. 삭제는 Git 관리 파일만 대상으로 하며 사용자 디스크/DB/backup을 다루지 않는다.

## 준비 검증과 다음 행동

실제 실행 결과는 [BASE-01 증거](../evidence/base-01.md), [BASE-02 증거](../evidence/base-02.md), [BASE-03 증거](../evidence/base-03.md)를 따른다. plan/design 검사 통과를 제품 typecheck/build/DB/E2E 통과로 해석하지 않고, core/lab 빌드를 판단 기능 검증으로 확대하지 않는다. workflow는 원격 Linux에서 통과했지만 브랜치 보호 설정은 확인하지 못했으므로 main 반영 차단이 설정됐다고 주장하지 않는다.

다음 카드로 넘어가기 전 [실행 지시문](../plan/07-codex-execution-playbook.md)을 적용한다. 원격 main과 로컬 변경, BASE-03 검증 상태를 먼저 확인한다. 운영 DB가 있는지 알 수 없으므로 새 격리된 개발 DB 외에는 연결하지 않는다.

## 과거 검토 기록

이전 리뷰는 보존된 docs/review와 기준 commit `f4ccbc233aa5c62f3310e00d483c2115f145876a`의 `docs/review/`에서 Git 이력으로 확인한다. 과거 제품 코드의 구조 부족은 계획 00의 역사적 비교에 남아 있다. 그것을 현재 main에 제품 코드가 남아 있다는 주장으로 사용하지 않는다.
