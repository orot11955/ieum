# ADR 0003 — 의미 판단은 자동 실행하지 않는다

- Status: Accepted
- Date: 2026-09-22

## Context

ieum은 기록을 Context에 연결하고 이후 Split, Merge, Derivation까지 제안하게 된다.

잘못된 의미 연결이 자동으로 누적되면 데이터 구조 자체가 오염된다.

특히 개인 지식 시스템에서는:

- 연결되지 않은 기록 몇 개
보다
- 잘못 연결된 기록 수십 개

가 더 위험하다.

## Decision

기계적으로 확정 가능한 변화와 의미 변화 정책을 구분한다.

자동 처리 가능:

- 사용자가 직접 지정한 값
- deterministic 날짜 parsing 결과
- 명시적 Relation 저장
- 재생성 가능한 Profile/Index

자동 처리 금지:

- Context Attach/Move
- Context Split
- Context Merge
- Parent Context 생성
- Synthesis/Artifact 승격

의미 변화는 항상:

```text
Judgement
→ Proposal
→ User Feedback
→ Mutation
```

순서를 따른다.

Policy는 초기에는:

- IGNORE
- CANDIDATE
- SUGGEST
- STRONG_SUGGEST

까지만 허용한다.

Semantic AUTO_EXECUTE는 만들지 않는다.

## Consequences

장점:

- 데이터 오염 방지
- 사용자 사고 구조에 대한 최종 통제권 유지
- Feedback을 고품질 학습 신호로 사용할 수 있음
- 잘못된 판단의 원인 추적 가능

비용:

- 사용자의 승인 동작이 필요하다.

따라서 Core는 Suggestion Precision과 Noise Rate를 중요한 지표로 관리한다.
