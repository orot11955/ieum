# ADR 0002 — Judgement Core는 Pure TypeScript로 유지한다

- Status: Accepted
- Date: 2026-09-22

## Context

ieum의 가장 큰 실험 대상은 UI나 API가 아니라 판단 로직이다.

판단 알고리즘은 반복적으로 변경, Replay, Benchmark되어야 한다.

Framework 또는 DB 구현과 강하게 결합되면 다음 문제가 생긴다.

- Core Unit Test가 무거워진다.
- 알고리즘 실험마다 Framework Context가 필요해진다.
- Replay가 느리고 재현성이 떨어진다.
- Persistence 모델이 Domain 모델을 지배하게 된다.

## Decision

`packages/core`는 가능한 한 Pure TypeScript로 유지한다.

Core에서 금지하는 직접 dependency:

- Fastify
- React
- Drizzle
- pg
- Axios
- TanStack Query
- NestJS

외부 데이터 접근은 Port를 통해 수행한다.

예:

```ts
interface ContextProfileReader {
  getActiveProfiles(): Promise<ContextProfile[]>;
}
```

DB Adapter는 `packages/db`, HTTP Adapter는 `apps/api`가 담당한다.

## Consequences

장점:

- 빠른 Unit Test
- Deterministic Replay
- Framework 교체와 무관한 Core 진화
- 알고리즘 변경 영향 범위 축소

비용:

- Adapter/Mapping 코드가 일부 추가된다.

이 비용은 Core 실험 가능성을 위해 감수한다.
