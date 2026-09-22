# ADR 0005 · V1 AI 일괄 배제 — 대체됨

- Status: Superseded
- 최초 결정: 2026-09-22
- 대체 결정: [ADR 0006](0006-early-semantic-experiments.md), 2026-09-22

## 당시 결정

기존 설계는 Core Lab V1에서 생성형 LLM, embedding, vector DB, 자동 분할/요약/글쓰기 등을 함께 배제했다. lexical·관계·session baseline을 먼저 검증하고, 이후 AI를 evaluator 하나로 추가하려는 취지였다.

이전 문서의 원문은 Git 이력 `2d14454cc587b9faf5d8fd8b8f42513bdb0f5b38`에서 확인할 수 있다. 이 파일은 기존 결정을 없었던 것으로 만드는 대신 상태와 변경 이유를 보존한다.

## 대체 이유

바꿔 말하기, 한영 혼용, 기록과 Context 설명의 어휘 차이는 핵심 불확실성이다. lexical 목표를 통과해야만 semantic 실험을 허용하면 바로 그 불확실성을 시험하지 못할 수 있다. embedding은 생성형 모델의 자유로운 판단·DB 쓰기와도 구분해야 한다.

## 계속 유지되는 부분

모델 없는 baseline을 먼저 측정한다. 생성형 LLM을 routing의 필수 동기 의존성으로 두지 않는다. 모델 출력이 의미 구조를 직접 변경하거나 외부 발행하지 못하게 한다. 모델 도입 효과는 같은 평가 조건에서 비교한다.

## 더 이상 적용하지 않는 부분

`V1이므로 embedding 자체 금지`, `lexical 정확도 gate 통과 전 semantic 실험 금지`, `AI는 최종 evaluator에만 추가 가능`은 현재 규칙이 아니다. embedding은 retrieval 단계에서도 사용 가능하다. 최신 범위는 [ADR 0006](0006-early-semantic-experiments.md)과 [계획서](../plan/core-lab-experiment-plan.md)를 따른다.
