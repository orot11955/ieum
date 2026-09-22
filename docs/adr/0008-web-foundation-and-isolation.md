> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# ADR 0008 · 개인 웹 기반과 계정·데이터·공개 경계

- Status: Accepted for implementation planning
- Date: 2026-09-22
- 의미: 제품 설계의 기준. 기능 구현이나 인증·권한 검증 완료가 아니다.

## Context

이음의 제품 경계는 내부 관리 앱+판단 보조+Delivery API다. 사용자 요청에 따라 로그인, 회원, 글, 데이터, 권한, 로그와 일상 운영 기능을 구체화해야 한다. 단순 CRUD 목록만으로는 개인 데이터의 격리·버전·복구·공개 경계를 보장할 수 없다.

## Decision

초기 배포안은 1인 자가 호스팅이며 확장은 초대형 별도 계정이다. 공개 회원가입·공동 편집·과금 SaaS는 기본 범위 밖이다. User와 Workspace를 분리하고 각 계정에 개인 공간을 만든다. 서비스 초대를 기존 공간 공유로 해석하지 않는다.

운영자 역할과 공간 Owner 역할을 나눈다. 운영자가 앱에서 모든 개인 자료를 읽는 권한을 기본 부여하지 않는다. 읽기/편집/발행/전체 export/영구 삭제/키 관리/운영 작업을 구분한다. 초기 개인 공간은 Owner-only이며 공유 role은 검증 후 활성화한다.

관리 웹은 서버 DB 세션과 HttpOnly 쿠키를 기본으로 한다. Better Auth Fastify/Drizzle는 후보이며 실제 보안 공지·지원 버전과 IEUM 초대/정지/MFA/철회 정책의 통합 시험을 거친다. 장기 브라우저 JWT·직접 만든 인증 프로토콜·무제한 admin bypass를 기본안으로 하지 않는다.

글 작업본·불변 revision·검토·공개 snapshot을 분리한다. 자동저장은 충돌을 검출하고 발행은 특정 검토 버전을 대상으로 한다. 개인 Export와 운영 Backup을 분리하고 휴지통·복원·첨부 접근·작업 재시작을 제품 기능으로 포함한다.

감사, 보안, 운영, 작업/Delivery, 판단 trace를 목적과 권한별로 분리한다. 민감 본문과 credential을 일반 로그에 복사하지 않는다. 중요한 변경의 감사와 outbox를 같은 transaction에 기록한다.

기술 경계는 모듈형 모놀리스다. 내부 웹/API/worker/DB를 필요에 맞춰 분리 실행하되 microservice·메시지 브로커·통합 로그 플랫폼을 선행 필수화하지 않는다. Core는 기존 순수 TS 경계를 유지하고 권한 내 snapshot에서 일부 판단만 수행한다.

## Consequences

계정 한 개여도 ownership 필드와 권한 검증은 구현한다. 복수 계정을 수용하기 전 검색·파일·export·worker까지 격리 테스트한다. 서버/DB 접근권을 가진 운영자로부터의 암호학적 차단은 별도 요구이며 이 설계가 제공한다고 주장하지 않는다.

M0/M1 Core Lab 기본 범위는 그대로다. 실제 웹 기반은 M3-A/F, 개인 관리는 M3-B/P, 문서는 M4/D, 발행은 M5/R로 구분한다. 기본 수동 기능을 Core 품질에 종속시키지 않지만 실제 사용자 웹의 인증·복구·운영 gate는 생략하지 않는다.

세부 기준: [기능 명세](../product/web-functional-spec.md) · [인증·권한](../architecture/identity-and-access.md) · [웹 구조](../architecture/web-application-design.md) · [데이터·운영](../architecture/data-and-operations.md) · [제품 구현 계획](../plan/04-web-plan.md).
