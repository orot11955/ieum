# BE-02 · Better Auth / Drizzle / Fastify 호환성 시험

2026-09-24 KST. 실제 PostgreSQL 18.4를 격리 Colima `ieum-be02`의 컨테이너에 띄워 시험했다. 운영 DB와 실사용 계정은 사용하지 않았다. 이 보고서는 인증 adapter의 호환성 근거이며 계정·초대 업무 정책의 완료 판정은 BE-04에서 한다.

## 선택과 경계

- Better Auth `1.7.5`, `@better-auth/drizzle-adapter` `1.7.5`, CLI `auth` `1.7.5`, Drizzle ORM `0.45.3`, Drizzle Kit `0.31.11`, `pg` `8.23.0`을 lockfile에 고정했다. Nest community wrapper 없이 Nest의 Fastify 인스턴스에 native `/api/auth/*` handler를 등록한다.
- Fastify가 JSON 본문을 한 번 파싱한 뒤 Fetch `Request`로 전달한다. 재직렬화와 맞지 않는 원래 `Content-Length` 및 신뢰하지 않는 proxy/hop-by-hop 헤더는 제거한다. 응답의 `Set-Cookie`를 `getSetCookie()` 배열로 보존한다. 알 수 없는 `Host`·proxy host/proto와 다른/없는 POST `Origin`은 vendor handler 전에 거부한다. vendor의 CSRF·origin 검사는 유지한다.
- 공개 이메일 가입을 비활성화했다. cookie session cache를 꺼 철회 직후 다음 요청에서 DB 세션을 다시 확인한다. `AuthPort`는 사용자·세션 ID·이메일만 업무 계층에 전달하며 vendor 타입을 노출하지 않는다.
- Fastify의 `request.ip`로 확인한 peer IP만 인증 라이브러리의 rate-limit IP 헤더로 전달한다. 신뢰 프록시 구성은 현재 사용하지 않는다. 운영 프록시 배치 시 proxy/peer IP와 rate limit 정책을 다시 시험해야 한다.
- 런타임은 `AUTH_DATABASE_URL`, `AUTH_BASE_URL`, `AUTH_SECRET` 세 값이 모두 있을 때 인증 경로를 올린다. 일부만 있으면 시작 오류로 처리한다. 현재 이메일 발송 구현은 없어서 실제 비밀번호 재설정 요청은 비활성이다. 시험에서는 발송 콜백을 주입해 token 사용·재사용 금지·세션 철회를 검증했다. BE-04에서 초대·복구 전달 채널을 연결한다.

## 확정 스키마와 migration

`auth.config.ts`와 고정 CLI `auth@1.7.5`로 `apps/api/src/auth/schema.ts`를 생성했다. Drizzle adapter의 `schemaName: "auth"`와 명시적 schema mapping을 사용한다. `db/migrations/auth/0000_familiar_marvel_apes.sql`은 다음 auth vendor 테이블만 만든다.

| 테이블 | 용도 |
| --- | --- |
| `auth.user` | 사용자 credential 메타데이터, `two_factor_enabled` |
| `auth.account` | 이메일 credential 연결과 vendor password hash |
| `auth.session` | DB session token·만료·user FK |
| `auth.verification` | 재설정 token의 일회성 검증 값 |
| `auth.two_factor` | 암호화된 TOTP secret·복구 코드·시도 잠금 상태 |

업무 workspace/role 테이블과 runtime DB role/RLS는 BE-03/BE-04 범위다. 이 migration은 빈 **시험 DB**에서만 적용했다. 운영 배포·기존 schema upgrade·rollback은 수행하지 않았다.

## 실행 결과

환경: macOS arm64, Node v24.18.0, pnpm v11.24.0, Colima 격리 Docker, `postgres:18.4-alpine`, loopback `127.0.0.1:55432`. 값은 전부 합성 fixture다.

| 명령 또는 검증 | 결과 |
| --- | --- |
| `pnpm --filter @ieum/api exec auth generate --config auth.config.ts --output src/auth/schema.ts --yes` | exit 0, 5개 vendor 테이블 생성. 기존 schema가 아직 없다는 CLI 경고는 생성 전에만 발생했다. |
| `pnpm --filter @ieum/api exec drizzle-kit generate --config drizzle.config.ts` | exit 0, auth migration 생성 |
| `pnpm --filter @ieum/api exec drizzle-kit migrate --config drizzle.config.ts` | exit 0, 격리 PostgreSQL에 적용 |
| `pnpm --filter @ieum/api test:auth` | exit 0, 실제 DB 통합 5개: 가입 차단·Host/Origin/본문 오류, 로그인/로그아웃·session, 다른 기기 즉시 철회, 재설정 token 일회성·기존 세션 철회, MFA 미완료·복구 코드 일회성 |
| `pnpm --filter @ieum/api exec vitest run test/auth.fastify.test.ts` | exit 0, JSON 한 번 전달과 별개 `Set-Cookie` 두 개 보존 |
| `npm run prep:check` / `pnpm install --frozen-lockfile` | exit 0 / 0, 계획·디자인 기준선과 7개 workspace 잠금 설치 |
| `pnpm lint` / `pnpm format:check` / `pnpm contracts:check` / `pnpm typecheck` | 모두 exit 0, 신규 코드 스타일·경계·strict 타입 검사 |
| `pnpm test:unit` / `pnpm build` / `pnpm api:smoke` / `pnpm lab:smoke` | 모두 exit 0. API 단위 7개, 기존 Core 65/contracts 3/Lab 25/backend 1/worker 1개 통과. 빌드 산출물 스모크 통과 |
| `git diff --check` | exit 0, 공백 오류 없음 |
| `pnpm audit --audit-level high` | exit 0. 조회 시점 high/critical 0, moderate 1. |

`pnpm audit --json`의 moderate 1건은 `drizzle-kit`의 개발 도구 경로에 있는 `esbuild 0.18.20`의 [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)다. 공격 조건은 취약한 esbuild 개발 서버에 웹사이트가 접근하는 경우다. 이 프로젝트는 해당 개발 서버를 API 런타임에 사용하지 않는다. 배포 의존성 분리와 이후 버전 교체 가능성을 BE-03에서 재확인한다. 이 조회는 미공개/신규 취약점 부재를 보장하지 않는다. [Better Auth 보안 공지](https://github.com/better-auth/better-auth/security/advisories)와 [공식 Drizzle adapter 문서](https://better-auth.com/docs/adapters/drizzle)를 버전 선택 시 확인했다.

독립 `security-review`는 이 변경의 HTTP 입력→인증 adapter→세션/credential 저장 경계를 읽기 전용으로 추적해 재작업이 필요한 결함을 확인하지 못했다. 검토자는 Fastify bridge 단위 테스트 1개를 별도로 통과시켰지만 Node v26.7.0에서 실행해 요구 v24와 달랐다. main의 Node v24.18.0 단위·실제 DB 검증을 위 표의 근거로 사용한다. 운영 HTTPS/프록시/rate limit은 검토의 남은 조건이다.

## 남은 검증 경계

GitHub Actions의 PostgreSQL job 결과는 이 문서 작성 시점에 아직 없다. 실제 발송 채널·초대 수락·계정 정지·workspace 권한·운영 HTTPS/proxy/rate limit·복구 감사는 BE-04와 통합 gate에서 검증한다. 인증 credential과 MFA secret·복구 코드는 로그나 이 문서에 기록하지 않았다.
