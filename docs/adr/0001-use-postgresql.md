# ADR 0001 — PostgreSQL을 기본 저장소로 사용한다

- Status: Accepted
- Date: 2026-09-22

## Context

ieum Core는 Capture, ThoughtUnit, Context, Membership, Relation, Judgement Evidence를 저장해야 한다.

초기에는 관계 그래프처럼 보이지만 다음 요구가 동시에 존재한다.

- 강한 FK/Unique 제약
- Primary Context 최대 1개 같은 Partial Unique 제약
- JSON 구조 Evidence
- Replay를 위한 안정적인 Query
- 향후 Full Text / trigram / vector 실험 가능성
- 단일 사용자 환경에서의 단순 운영

## Decision

기본 DB로 **PostgreSQL 18**을 사용한다.

초기 확장:

- pg_trgm

필요할 때만 검토:

- PostgreSQL Full Text Search
- pgvector

ORM/Query Adapter는 Drizzle ORM을 사용한다.

## Rejected Alternatives

### Neo4j

현재 관계 규모에서는 운영 복잡성이 이득보다 크다.
Graph 탐색은 RDB Relation Table로 충분하다.

### 별도 Vector DB

V1에 Embedding 자체가 없다.
향후 Semantic Evaluator가 실제 Replay 성능을 크게 개선할 때만 검토한다.

### Generic EAV

Domain 의미와 제약이 사라지고 Query/Test/이해 비용이 커지므로 사용하지 않는다.

## Consequences

장점:

- 하나의 DB로 Core V1 전체를 운영할 수 있다.
- 강한 제약과 재현 가능한 Query를 유지한다.
- Search/Semantic 실험도 같은 DB 안에서 시작할 수 있다.

비용:

- 아주 깊은 Graph Traversal이 중요해지면 별도 최적화가 필요할 수 있다.

그 시점이 오기 전에는 별도 Graph DB를 추가하지 않는다.
