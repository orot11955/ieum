# ADR 0012 · main 단일 브랜치와 제로베이스 계획 1.1

- 날짜: 2026-09-23 KST
- 상태: 채택 — 사용자의 main 직접 작업·계획 정리 요청
- 기준: main f4ccbc233aa5c62f3310e00d483c2115f145876a

## 결정

현재 main을 그대로 출발점으로 삼고 새 브랜치/PR/force push를 사용하지 않는다. 이전 계획의 archive/replan 브랜치는 역사적 참조일 뿐 재생성하지 않는다. 기능 검증을 마친 작은 커밋을 main에 순차 반영한다.

현재 실행 정본은 docs/plan/의 제로베이스 계획 1.1과 backlog.json 75개 카드다. BASE-01의 계획/문서 준비 후 명시적 구현 지시가 오면 BASE-02부터 시작한다. P0–P9가 실행 순서이며 과거 M/S/I 번호는 연구/변경 경위로만 해석한다.

Core는 순수 TS, backend 조립은 NestJS+FastifyAdapter, DB는 PostgreSQL+Drizzle, 내부 웹은 React/Vite다. 인증/queue/editor 버전과 통합은 해당 spike에서 검증한다. 미래 package/runtime을 이번 준비에서 설치하거나 구현하지 않는다.

## 대체 범위

ADR 0010/0011의 과거 착수 순서·일괄 제품 패치 적용 지시와 기존 docs/plan 4개 실행 계획은 새 계획으로 대체한다. 예전 웹 아키텍처의 앱 내부 조립 경로는 새 00/05의 API/worker/shared backend 경계를 따른다. 실제 Paper/Dark 디자인과 원본·출처·권한·검토 발행 계약은 유지한다. ADR 0001–0009의 유효한 도메인/안전 결정을 삭제하지 않는다.

과거 시점별 review와 실행 사본은 Git 이력에서 찾을 수 있다. 현재 트리에 동일한 계획·상태를 여러 벌 저장하지 않는다. JSON의 카드와 생성된 Markdown의 일치를 자동 검사한다.

## 결과와 한계

main의 이전 제품 patch 재적용/의존성 자동 변경 workflow는 제거한다. 지속 CI는 contents: read의 계획·디자인 검사만 수행한다. 준비 완료는 제품 실행·인증·DB·브라우저·판단 품질·복원·배포 성공이 아니다. source 정리는 운영 데이터를 삭제하거나 downgrade하지 않는다.
