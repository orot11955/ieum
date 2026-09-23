# BASE-02 · 최소 workspace와 CI 기반

- 상태: **IMPLEMENTED**. 로컬 검사는 통과했으나 원격 GitHub Actions와 새 기기 실행은 미확인이다.
- 작업 기준: local main `010fee7e41013b2cfcfe91c32ad6b496d32ee275`, 시작 시 `origin/main` 추적 참조와 동일. 일반 샌드박스의 원격 조회는 DNS 실패(exit 128)였으나 승인된 네트워크에서 `git ls-remote --heads origin main`을 다시 실행해 같은 SHA를 확인했다(exit 0).
- 환경: macOS arm64, Node v24.18.0, pnpm v11.24.0. 제품 DB·모델·운영 서비스는 사용하지 않았다.

## 구현 범위

`pnpm-workspace.yaml`은 지금 필요한 `packages/core`와 `apps/lab-cli`만 포함한다. strict TS, Node ESM package export, Vitest 한 개의 package export 검사, ESLint/Prettier, lockfile, 빌드된 lab smoke entry와 CI workspace job을 추가했다. `CORE_PACKAGE_ID`는 빌드 연결 확인용 marker이며 판단 Core 기능을 구현했다는 뜻이 아니다. CI는 기존 plan/design 준비 검사 다음에 고정 설치→lint→format→typecheck→unit→build→smoke를 실행하도록 정의했다.

pnpm은 transitive `esbuild` 설치 스크립트를 `allowBuilds.esbuild: false`로 명시적으로 차단한다. 로컬 Vitest/빌드는 이 설정으로 통과했다. Linux runner의 실제 결과는 아직 확인하지 못했다.

## 실제 실행 결과

| 명령·절차 | exit | 결과 |
|---|---:|---|
| `npm run prep:check` | 0 | 계획 75개 카드/27개 화면과 디자인 테스트 18개 통과. 제품 검증과 구분 |
| 기존 `node_modules`를 임시 경로로 옮긴 뒤 `pnpm install --frozen-lockfile --store-dir .pnpm-store` | 0 | 고정 lockfile로 workspace 설치. 설치 실행 때 레지스트리 접근은 승인된 네트워크 환경을 사용 |
| `pnpm install --frozen-lockfile --offline` | 0 | 같은 lockfile과 캐시로 재설치 검사 |
| `pnpm lint` / `pnpm format:check` | 0 / 0 | 새 core/lab 소스와 설정 검사 |
| `pnpm typecheck` | 0 | core 빌드와 lab/core strict TypeScript 검사 |
| `pnpm test:unit` | 0 | package export를 실제 빌드 산출물에서 읽는 Vitest 1개 통과 |
| `pnpm build` / `pnpm lab:smoke` | 0 / 0 | Node가 빌드된 CLI를 실행해 `@ieum/core:lab-harness` 출력 |
| `pnpm audit --audit-level high` | 0 | 확인 시점의 알려진 high 이상 공지 없음. 취약점 부재 보장은 아님 |
| 잘못된 import와 `number`→`string` 대입을 임시 소스에 넣고 `pnpm typecheck` | 2 (기대한 실패) | TS2305와 TS2322를 검출. 임시 소스와 생성된 임시 산출물 제거, `noEmitOnError` 설정 |
| `git diff --check` | 0 | 공백 오류 없음 |

`pnpm` 패키지 설치 전 일반 샌드박스에서는 레지스트리 DNS가 실패했고, 최초 설치는 pnpm 저장소 경로 차이로 재시도가 필요했다. 프로젝트 내 `.pnpm-store`로 통일한 뒤 고정 설치와 검사가 통과했다. 이는 코드 검사 실패가 아닌 환경/설치 경로 문제다.

## 미검증과 다음 판정

GitHub Actions의 새 workspace job은 아직 원격에서 실행되지 않았다. 실제 새 기기에서 네트워크 설치를 반복하지 않았으며, Linux의 esbuild 설치 스크립트 차단 상태도 원격 결과로 확인해야 한다. 따라서 BASE-02를 VERIFIED로 올리지 않았다. 기능 커밋을 main에 반영한 뒤 CI 결과와 새 기기 설치→검사→빌드 증거를 확인한다. 그때 실패가 없으면 VERIFIED로 올리고 BASE-03을 시작한다.

읽기 전용 공급망 검토는 workflow의 `contents: read`, checkout credential 미보존, 고정 의존성과 integrity, 비밀 주입 부재를 확인했고 지정 파일에서 수정 필요 결함을 찾지 못했다. 패키지 본문과 원격 실행은 해당 검토 범위 밖이다.

데이터 영향은 로컬 `node_modules`와 무시되는 `.pnpm-store`뿐이다. DB migration·운영 데이터·배포 변경은 없다. 소스 복구는 BASE-02 설정/패키지/CI 변경을 되돌리는 것으로 충분하며 데이터 변환이 필요하지 않다.
