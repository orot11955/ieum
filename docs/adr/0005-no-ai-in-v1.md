# ADR 0005 — V1은 AI 없이 검증한다

- Status: Accepted
- Date: 2026-09-22

## Context

ieum의 최종 형태에는 Semantic Search, 자동 정리, 글감 제안, 자연어 보조가 유용할 수 있다.

하지만 처음부터 LLM/Embedding을 넣으면 다음을 구분하기 어렵다.

- 데이터 모델이 좋은가?
- Context 개념이 유효한가?
- Relation 구조가 도움이 되는가?
- 단순 Lexical/Graph Signal만으로 충분한가?
- AI가 실제로 개선했는가?

## Decision

Core Lab V1에서는 다음을 사용하지 않는다.

- LLM
- Embedding
- Vector DB
- 자동 ThoughtUnit 분리
- 자동 요약
- 자동 글 작성
- 자동 Knowledge Graph 생성

먼저 다음으로 Baseline을 만든다.

- explicit relation
- lexical similarity
- Context purpose
- Context corpus
- session continuity
- recency
- feedback history

Core Baseline이 검증된 뒤 AI/Embedding은 **Evaluator 하나**로 추가한다.

```text
Rule / Relation Evaluators
+
Statistical Evaluator
+
Semantic Evaluator
        ↓
Aggregator
        ↓
Policy
```

AI가 최종 판단자나 DB 변경 주체가 되어서는 안 된다.

## Adoption Rule

AI 기능은 Holdout Replay에서 기존 Core 대비 의미 있는 개선이 확인될 때만 유지한다.

예:

```text
Base Top3       89%
Embedding       90%
→ 복잡성 대비 보류

Base Top3       89%
Embedding       96%
→ 채택 검토
```

## Consequences

장점:

- Core 자체의 가치 검증 가능
- AI 비용/모델 변화에 비의존
- Explainability 유지
- 향후 어떤 AI 모델도 Adapter/Evaluator로 교체 가능

비용:

- 초기 Semantic 이해력은 제한된다.

이 제한을 의도적인 실험 조건으로 받아들인다.
