# ADR 0002 · 순수 TypeScript 계산 코어

- Status: Accepted, revised
- 최초 결정/개정: 2026-09-22

## Context

판단식을 UI·DB·모델 호출과 묶으면 실패 원인과 연산 비용을 분리하기 어렵다. 기존 `evaluate(): Promise` 방식은 evaluator별 조회와 N+1을 유발할 수 있다. 단순히 프레임워크를 import하지 않는 것만으로 실행이 순수해지는 것은 아니다.

## Decision

`packages/core`는 도메인 타입과 동기적 계산 함수 중심으로 구성한다. 애플리케이션 계층이 파일/DB/모델 I/O를 수행하고 immutable snapshot과 feature를 넘긴다. Core는 점수, policy, 구조화된 trace를 반환한다.

Core에서 HTTP, DB driver, ORM, React, 모델 SDK, 파일 저장, 전역 clock, 비고정 random을 직접 사용하지 않는다. clock/seed/snapshot을 명시적 입력으로 받는다. 학습기나 모델 runtime을 TypeScript로 재구현해야 한다는 뜻은 아니다. 외부 도구가 생성한 고정 artifact도 어댑터로 사용할 수 있다.

interface를 위해 추상화를 만들지 않는다. 실제 구현이 하나뿐이면 작은 함수와 명시적인 타입으로 시작한다. framework·ORM 타입이 Core 공개 계약에 새어 나오지 않게 한다.

## Consequences

pure compute를 따로 측정할 수 있지만 이를 end-to-end 속도로 발표해서는 안 된다. 비동기 orchestration과 snapshot mapping의 비용이 생기며, 이는 실험의 관측 가능성과 재현성을 위해 감수한다.

기준 계약: [Core 구조](../architecture/judgement-core.md) · [점수](../architecture/retrieval-and-scoring.md)
