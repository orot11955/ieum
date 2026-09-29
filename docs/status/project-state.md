# IEUM 프로젝트 상태 · 계획 2.0 개인 관리 우선 · 2026-09-29

- 실행 정본: [계획 2.0](../plan/README.md), [ADR 0014](../adr/0014-remove-core-personal-management-first.md). 상태 요약은 이 문서 하나에만 둔다.
- 브랜치 정책: main 직접 작업, 새 브랜치/PR/force push 없음
- 다음 작업: **M1 앱 기반과 로그인**
- 사용자 ACCEPTED 기능: 없음

## 영역별 현재 상태

| 영역 | 상태 | 근거 |
|---|---|---|
| 인증·계정·세션·MFA·복구 | API·DB 검증 완료. 화면 없음 | [BE-02](../evidence/be-02.md), [BE-04](../evidence/be-04.md) |
| 공간 격리·RLS·명령/감사/outbox·worker | 검증 완료 | [BE-03](../evidence/be-03.md), [BE-05](../evidence/be-05.md), [BE-06](../evidence/be-06.md) |
| 기록(원문 revision·unit 분할) | API·DB 검증 완료. 화면 없음(M2) | [BE-07](../evidence/be-07.md) |
| 맥락(다중 소속·관계) | API·DB 검증 완료. 화면 없음(M3). 구조 제안의 다중 후속은 제거 | [BE-08](../evidence/be-08.md) |
| 할일·일정 | API·DB 검증 완료. 화면 없음(M4) | [BE-09](../evidence/be-09.md), [BE-10](../evidence/be-10.md) |
| 위키·문서 draft/revision | API·DB 검증 완료. 화면 없음(M5) | [BE-11](../evidence/be-11.md) |
| 통합 검색 | 없음(M6) | — |
| 공통 UI·편집기·폼 spike | Paper/Dark 공통 UI, 합성 편집기·폼 Chromium 검증 | [FE-01](../evidence/fe-01.md), [FE-02](../evidence/fe-02.md) |
| 문서 작업실·모델 초안·첨부·발행·Delivery | 코드·테스트 유지, **동결**. 실제 모델 호출은 미검증 | [BE-16](../evidence/be-16.md)–[BE-20](../evidence/be-20.md) |
| 개인 데이터 이식 | 일부 도메인 구현 후 **중단**(M7에서 범위 결정) | [BE-21](../evidence/be-21.md) |
| 판단 Core·Lab·제안·추출·구조 | **제거**(ADR 0014, migration `0021`) | Git 이력 |
| 운영 DB·배포·사용자 기기 | 미접근·미확인·미변경 | 실제 작업 전 명시적 확인 |

## 검증 기준

로컬 Node 24.18.0에서 `npm run prep:check`, `pnpm contracts:check`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm api:smoke`, `pnpm --filter @ieum/backend test:db`, `pnpm --filter @ieum/api test:identity`를 실행한다. 두 DB 테스트는 Testcontainers PostgreSQL을 쓴다. `pnpm --filter @ieum/api test:auth`는 `AUTH_DATABASE_URL`이 필요하며 CI가 실행한다. 원격 Linux CI는 `.github/workflows/preparation-ci.yml`이다.

ADR 0014의 Core 제거 커밋은 위 명령을 로컬에서 통과했다(`test:auth`는 로컬 skip). 원격 Linux CI run `36511718995`(commit `fb41fcc`)는 인증 PostgreSQL을 포함한 4개 job 모두 성공했다. 브랜치 보호 설정은 확인하지 못했으므로 CI 실패가 main 반영을 막는다고 주장하지 않는다.

## 알려진 제한

- migration `0019`–`0021`은 운영 DB에 적용한 적이 없다. `0021`은 판단·구조 테이블을 삭제하므로 대상 DB가 생기면 inventory·backup을 먼저 확인한다.
- context membership 무효화 job은 BE-06 검증 예시로 남아 있다. 이를 읽는 소비자는 없다.
- `packages/backend/src/data-transfer/service.ts`는 약 4,000줄이다. BE-21을 재개할 때 먼저 나눈다.

과거 75개 카드 계획, 시점별 검토, Core 증거는 커밋 `82be8d8` 이전의 Git 이력에서 확인한다. 파일별 정리 기록은 [cleanup manifest](cleanup-manifest.json)에 있다.
