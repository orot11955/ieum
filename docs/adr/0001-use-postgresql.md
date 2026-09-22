> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# ADR 0001 · 운영 저장소는 PostgreSQL, 첫 실험은 파일

- Status: Accepted, revised
- 최초 결정/개정: 2026-09-22
- 의미: 다음 구현의 선택이며 성능 검증 완료가 아니다.

## Context

기록 revision, 다중 소속, primary 최대 하나, 출처 관계, 승인·취소 트랜잭션이 필요하다. 기존 설계는 첫 가설 검증 전에 DB/API/UI를 모두 준비하도록 하여 실험 비용이 커졌다.

## Decision

운영 저장 단계 M3의 기본 저장소는 PostgreSQL 18로 유지한다. Drizzle + node-postgres는 DB adapter에만 둔다. M0/M1은 JSONL과 불변 snapshot으로 실행하며 PostgreSQL 설치를 요구하지 않는다.

DB 도입 시 FK, active membership unique, primary partial unique, revision 확인, idempotent command, profile invalidation을 구현한다. 자료의 의미를 JSONB에 모두 숨기는 Generic EAV는 사용하지 않는다.

검색은 exact reference를 먼저 만든다. pg_trgm/FTS, 필요 시 pgvector를 같은 DB에서 시험하되 인덱스가 품질과 속도를 자동 보장한다고 가정하지 않는다. [PostgreSQL 18](https://www.postgresql.org/docs/18/) · [pgvector](https://github.com/pgvector/pgvector)

## Alternatives

SQLite는 단일 사용자 저장의 단순한 대안이지만, 현재 계획의 트랜잭션·검색 확장 실험을 위해 운영 DB는 PostgreSQL로 정한다. Neo4j, 별도 vector DB, Elasticsearch는 측정된 병목이나 필수 검색 요구가 있을 때 다시 검토한다. 얕은 관계 조회부터 RDB에서 검증한다.

## Consequences

파일 baseline과 DB adapter 간 결과 일치를 검사해야 한다. DB 운영 비용은 M3까지 미룬다. 이후 graph/vector 규모가 커지면 실제 쿼리·recall·자원 측정으로 재평가한다.

기준 계약: [도메인](../architecture/domain-model.md) · [런타임](../architecture/runtime-and-performance.md)
