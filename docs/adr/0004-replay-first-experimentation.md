# ADR 0004 — 모든 판단 알고리즘은 Replay 가능해야 한다

- Status: Accepted
- Date: 2026-09-22

## Context

판단 Core는 가중치, Feature, Candidate Search, Evaluator가 반복적으로 변경된다.

실제 개선인지 감각적으로 판단하면 다음 문제가 생긴다.

- 최근 몇 사례에만 최적화
- Weight 변경에 의한 Regression 파악 불가
- AI/Embedding 추가 효과 측정 불가
- 과거 판단 재현 불가

## Decision

Replay를 제품 부가기능이 아니라 Core 개발의 1급 기능으로 둔다.

모든 Judgement는 다음 버전을 추적한다.

- engineVersion
- configVersion
- configHash
- featureExtractorVersion

Replay 입력은 Gold Dataset으로 관리한다.

Private Dataset:

```text
datasets/private/
```

Git에 포함하지 않는다.

Sanitized Sample:

```text
datasets/sample/
```

측정 Metric:

- Candidate Recall@5
- Candidate Recall@10
- Top-1 Accuracy
- Top-3 Accuracy
- MRR
- Strong Suggestion Precision
- Correction Rate
- No-match Accuracy
- Noise Rate

Gold Dataset은 Calibration / Holdout으로 분리한다.

같은 Dataset + Engine + Config는 항상 같은 결과를 내야 한다.

따라서:

- Random 금지
- Clock 주입
- deterministic tie-break

를 적용한다.

## Consequences

장점:

- Core 개선 여부를 수치로 확인
- Regression 즉시 발견
- AI/Embedding의 실제 가치 검증
- 판단 실패 원인 Trace 가능

비용:

- Gold Dataset을 사람이 지속적으로 관리해야 한다.

이 비용 자체를 Core 품질 검증의 필수 비용으로 간주한다.
