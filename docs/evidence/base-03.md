# BASE-03 · 도메인·HTTP·편집기 계약과 의존 방향

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux GitHub Actions가 통과했다.
- 기준: main `513b855`에서 착수. macOS arm64, Node v24.18.0과 v26.7.0, pnpm v11.24.0.
- 사용 패키지: Zod 4.6.5, openapi-typescript 7.13.0, openapi-fetch 0.17.0. 선택 버전은 `pnpm-lock.yaml`에 고정했다.

## 구현과 반례

`@ieum/contracts/management`, `/delivery`, `/editor`를 별도 export로 정의했다. Zod strict 요청/응답에서 OpenAPI 3.0.3 JSON과 TypeScript client 타입을 생성하고, 생성 타입을 사용하는 `openapi-fetch` 테스트가 같은 합성 Capture 생성·Publication 조회 예제를 왕복한다. 관리 요청 body의 `workspaceId` 주입과 Delivery 응답의 `privateRawBody` 추가는 strict schema에서 실패한다.

관리 요청 DTO→application command→저장 입력/Core snapshot을 명시적으로 매핑한다. 실제 DB/ORM row는 없으며 BE-07에서 스키마가 생길 때 연결한다. Core의 UTF-16 `[start,end)`는 원문 `slice`와 이모지 반례로 확인했다. 편집기 `schemaVersion` envelope는 원문 offset과 분리했다. 실제 editor node/block 계약은 FE-02에서 검증한다.

architecture 검사에는 Core의 외부 package import, web의 backend/DB import, Delivery의 management/core/backend import를 금지했다. 임시 fixture의 Core→backend, web→Drizzle/NestJS, Delivery→상대 경로 Core import를 넣은 CLI가 exit 1로 종료되는 것을 Node 테스트로 확인한다. `contracts:check`는 OpenAPI JSON/client 타입 생성물과 Zod 정본의 일치도 검사한다.

## 실제 명령

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `pnpm install --no-frozen-lockfile` | 0 | 새 고정 의존성 설치·lockfile 갱신 |
| `pnpm contracts:generate` | 0 | 관리/Delivery OpenAPI와 client 타입 생성 |
| `pnpm install --frozen-lockfile --offline` | 0 | lockfile 고정 설치 재확인 |
| `pnpm contracts:check` | 0 | 생성물 drift 없음, architecture 검사와 금지 import CLI 반례 1개 통과 |
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | 모두 0 | 새 TS 소스와 생성 client 타입 포함 검사 |
| `pnpm test:unit` | 0 | Core 3개, contracts 3개 통과 |
| `pnpm build`, `pnpm lab:smoke` | 모두 0 | core/contracts/lab 빌드와 기존 smoke 유지 |
| `pnpm audit --audit-level high` | 0 | 조회 시점 알려진 high 이상 공지 없음 |
| Node 24.18.0에서 `pnpm install --frozen-lockfile --offline`, `pnpm contracts:check`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 프로젝트 지정 런타임에서 고정 설치·경계·빌드·smoke 재확인 |
| [GitHub Actions run 35842760556](https://github.com/orot11955/ieum/actions/runs/35842760556), commit `744bd6bcefee427908dbf93efdb50df6919a8a7b` | success | Linux의 준비 job과 workspace job 모두 성공. frozen install, lint, 계약 검사, format, typecheck, unit, build, smoke, tracked diff 검사 포함 |

첫 architecture 검사에서 테스트 파일의 Vitest import를 Core 제품 코드로 잘못 분류해 exit 1이었다. 제품 소스만 검사하도록 범위를 조정했다. 첫 typecheck는 `openapi-fetch` 주입 fetch의 실제 단일 `Request` 시그니처와 테스트 코드가 달라 exit 2였고 테스트 adapter를 수정했다. 수정 후 위 명령이 통과했다.

독립 검토에서 Delivery의 상대 경로 Core import와 `@nestjs/common` import가 기존 경계 검사에 걸리지 않는 것을 발견했다. 경로 판정과 패키지 패턴을 보완하고 두 금지 사례를 fixture에 추가했다. 관리 `title`의 `.trim()` 변환은 생성 OpenAPI의 `minLength`와 의미가 달라 제거했다. 수정 뒤 `contracts:check`와 관련 검증을 다시 통과했다.

## 미검증·데이터 영향

실제 HTTP 서버, 인증·권한, DB row/transaction, 편집기 IME, 공개 projection·철회, 브라우저와 실데이터는 BASE-03의 실행 예제에 없다. 이들 계약의 통합·보안 판정은 해당 BE/FE/QA 카드에 남는다. 생성 OpenAPI/client 파일은 원본 Zod에서 재생성하며 DB migration·운영 데이터·배포 변경은 없다.
