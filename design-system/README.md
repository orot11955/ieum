> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../docs/plan/README.md)과 [ADR 0012](../docs/adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# IEUM Paper Terminal 1.0.0

내부 관리 웹의 고정 디자인 계약이다. 사용자가 제공한 크림·검정·형광 초록 컨셉을 해석했다. 제품 React UI/인증/DB/API를 구현한 패키지는 아니다.

## 파일

- `ieum.tokens.json`: DTCG 2025.10의 제한된 type/alias 집합으로 작성한 원본.
- `policy.json`: 대비 검사·소스 guard·허용 예외·화면 커버리지.
- `baseline.lock.json`: 승인된 source 계약의 SHA-256. build가 자동 갱신하지 않는다.
- `recipes.css.in`: 공통 스타일; breakpoint는 build 때 token 값으로 치환한다.
- `component-contracts.ts`: 목표 UI API 타입. 구현은 I-UI 단계다.
- `screen-matrix.json`: W01–W27의 컴포넌트/예외/모바일 계약.
- `reference.html` + `reference.mjs`: 실제 데이터 변경 없는 네 화면 시연.

## 실제 실행 가능한 명령

Node 22 이상에서 외부 패키지 설치 없이 동작한다. 제품용 목표 runtime은 기존 계획대로 Node 24이며 본 작업의 로컬 실행 runtime은 보고서에 명시한다.

```bash
node scripts/design/build.mjs
node --test scripts/design/test.mjs
node scripts/design/check.mjs
node scripts/design/guard.mjs
```

build는 `tokens.css`, `ui.css`, `tokens.ts`를 생성한다. 이 파일들은 Git의 authored source가 아니며 `.gitignore` 처리한다. ZIP에는 생성 결과가 포함된다. 생성한 다음 `reference.html`을 로컬 웹 서버나 파일을 지원하는 브라우저에서 연다. 전달 패키지의 `IEUM-UI-Reference.html`은 CSS/JS를 내장한 단일 파일이다.

제품 web entry가 생성한 tokens.css → ui.css 순으로 한 번만 import하도록 한다. 컴포넌트마다 복사하지 않는다. 포털은 같은 theme/density 경계에 둔다. 외부 블로그에 이 CSS 사용을 강제하지 않는다.

상세: [디자인 계약](../docs/design/design-system-contract.md), [컴포넌트 상태](../docs/design/component-state-contract.md), [최종 구현 판단](../docs/plan/01-master-roadmap.md).

## 고정과 변경

고정은 버전을 못 바꾼다는 뜻이 아니라 승인 없이 화면마다 변형하지 않는다는 뜻이다. 변경은 의미/영향 화면/상태와 대비 검사/버전/lock을 함께 검토한다. lock만 새로 생성해 경고를 지우는 행위를 금지한다. 생성기는 DTCG 전체 표준 처리기가 아니고 소스 guard도 AST 전 범위 검사기가 아니다. 이 한계를 shared wrapper·리뷰·실제 시각 테스트로 보완한다.

CI workflow를 추가하지만 required check/branch protection은 별도 저장소 설정이다. 아직 없는 제품 코드에 대해 검사한 것처럼 보고하지 않는다.
