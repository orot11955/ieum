> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# ADR 0011 — Paper Terminal 1.1과 제품 구현 시작

2026-09-22 사용자 승인: 다크 모드 추가 후 S0–S5 구현을 단계별로 진행한다.

기존 1.0의 종이 테마 원본은 보존하고 `themes.json`의 완전한 semantic color overlay로 paper-dark를 추가한다. 밝게/어둡게/시스템 3개 선호를 제공하며, 초기 head script에서 결정해 밝은 화면 깜박임을 줄인다. 개인 기록이 아닌 테마 선호만 localStorage에 저장한다. 고대비·모션 감소·인쇄는 별도 사용자 환경으로 유지한다. 어두운 모드의 focus는 dark gap 위의 밝은 외곽선과 gap으로 구분한다.

현재 로컬 DNS/패키지 다운로드 제한 때문에 GitHub Actions에서 Node 24와 의존성을 설치·정확한 버전 고정 후 단기 artifact로 가져와 실제 로컬 테스트한다. npm의 구버전 resolver 오류는 Node 24/npm 11로 해결했다. 감사에서 발견한 static-serving 취약 의존성을 업그레이드하고 불필요한 drizzle-kit을 제거했다. 의존성 관리 명령은 이번 구현에서 npm + package-lock을 정본으로 사용한다. 혼합 lockfile을 만들지 않는다.

제품 PostgreSQL은 유지하며, 로컬 테스트/개발은 동일 PostgreSQL 엔진 기반 PGlite 어댑터를 사용할 수 있다. PGlite를 운영 DB 대체나 실제 PostgreSQL 서버·pool·동시성 검증으로 주장하지 않는다. 운영은 PostgreSQL URL 및 별도 migration credential을 요구한다. SQL 제약과 RLS를 명확히 검토하기 위해 명시적 버전 SQL migration을 사용하고, 인증의 물리 schema는 Better Auth 1.7.5의 Drizzle mapping으로 검증한다.

최종 구현 상태와 배포 가능 여부는 실행 증거와 인수인계 문서로 별도 보고한다. 기존 공개 운영 NO-GO는 인증·격리·파일·복원 등 실제 gate 통과 전까지 유지한다.
