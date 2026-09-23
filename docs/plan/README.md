# IEUM 제로베이스 실행 계획 · 1.1

2026-09-23 KST · **main 채택 / CORE-01–15 VERIFIED / CORE-16 BLOCKED**

이음의 최종 목표는 원본·출처 보존, 일정·할일·위키 관리, 관련 맥락 연결·분리·병합, 근거 있는 문서 정제, 승인 발행·Delivery API다. 외부 블로그는 별도다. Core 장애가 명시적 저장·완료·편집·발행을 막지 않는다.

## 실행 정본

**[backlog.json](backlog.json)이 75개 카드의 ID·범위·계약·검증·완료 기준·상태 정본이다.** 상세 문서의 카드 부분과 [task-index.md](task-index.md)는 여기서 생성한다. 수동으로 양쪽을 따로 수정하지 않는다.

| 문서 | 책임 |
|---|---|
| [00 · 재검토/결정](00-repository-review-and-decisions.md) | 현재/역사적 기준선, 보존·재작성, 기술 결정 |
| [01 · P0–P9](01-master-roadmap.md) | 구간과 통합 순서 |
| [02 · Core](02-core-plan.md) | CORE-01–16 |
| [03 · Backend](03-backend-plan.md) | BE-01–26 |
| [04 · Web](04-web-plan.md) | FE-01–21, W01–W27 |
| [05 · 데이터/API](05-data-api-and-state-contracts.md) | 수명·transaction·출처·공개 계약 |
| [06 · 검증](06-testing-and-release-gates.md) | QA-01–09 및 품질·운영 gate |
| [07 · 실행 지시](07-codex-execution-playbook.md) | main 전용 시작 지시, 커밋·보고 |
| [08 · 출처/추적](08-sources-and-traceability.md) | 기존 계획의 출처·요구/화면 매핑 |
| [09 · 단계별 구현 순서](09-implementation-sequence.md) | 카드 선행관계에 따른 실행 묶음·gate·문서 충돌 정리 |
| [최소 계약 예제](contracts.md) | BASE-03의 관리/Delivery·편집기·Core 경계와 생성 경로 |

BASE-01–03과 CORE-01–15는 VERIFIED다. **CORE-16은 FE-14·FE-16과 허용된 실제 기록·holdout이 준비될 때 재개한다.** 현재 BE-01·FE-01·QA-02가 착수 가능하다. 라이브러리 호환성 spike는 카드의 선행관계가 충족될 때만 진행한다. main 이외 브랜치·PR을 만들지 않는다.

## 현재 실행 가능한 검사

Node 24에서 패키지 설치 없이 실행한다.

```sh
node scripts/plan/render.mjs --check
node scripts/plan/check.mjs
node scripts/design/build.mjs
node scripts/design/themes.mjs
node --test scripts/design/test.mjs
node scripts/design/check.mjs
node scripts/design/themes.mjs --check
```

카드를 바꾼 경우 `node scripts/plan/render.mjs`로 파생 문서를 갱신한다. `pnpm install --frozen-lockfile`, `pnpm contracts:check`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm lab:smoke`는 core/lab와 계약 예제만 검사한다. 제품 integration/E2E·판단 Lab 명령은 해당 카드에서 만든다.

[상태와 제한](../status/project-state.md) · [BASE-01 증거](../evidence/base-01.md) · [BASE-02 증거](../evidence/base-02.md) · [BASE-03 증거](../evidence/base-03.md) · [CORE-01 증거](../evidence/core-01.md) · [CORE-02 증거](../evidence/core-02.md) · [CORE-03 증거](../evidence/core-03.md) · [CORE-04 증거](../evidence/core-04.md) · [CORE-05 증거](../evidence/core-05.md) · [CORE-06 증거](../evidence/core-06.md) · [CORE-07 증거](../evidence/core-07.md) · [CORE-08 증거](../evidence/core-08.md) · [CORE-09 증거](../evidence/core-09.md) · [CORE-10 증거](../evidence/core-10.md) · [CORE-11 증거](../evidence/core-11.md) · [CORE-12 증거](../evidence/core-12.md) · [CORE-13 증거](../evidence/core-13.md) · [CORE-14 증거](../evidence/core-14.md) · [CORE-15 증거](../evidence/core-15.md) · [CORE-16 차단 근거](../evidence/core-16.md) · [문서 우선순위](../adr/0012-main-zero-base-execution.md)

통합 Markdown/ZIP·기존 validation-report·SHA256SUMS는 배포 사본이므로 저장소에 중복 체크인하지 않는다. 최신 실행/검사 결과는 상태 문서와 CI가 기준이다.
