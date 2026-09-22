> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# ADR 0006 · 작은 baseline 뒤에 의미 검색을 조기 비교한다

- Status: Accepted
- Date: 2026-09-22
- Supersedes: [ADR 0005](0005-no-ai-in-v1.md)

## Context

이음은 동일 단어 검색만이 아니라 서로 다른 표현의 생각을 연결할 수 있는지를 검증해야 한다. 모델을 사용하지 않는다는 제약 자체가 제품 목적이 되어서는 안 된다. 동시에 모든 판단을 생성형 모델 호출에 의존하면 비용·지연·실패 원인을 분리하기 어렵다.

## Decision

M1에서 lexical baseline과 provenance/Replay 계약을 구현하고 측정한다. M2에서 embedding-only와 hybrid retrieval을 같은 데이터·시점·후보 범위로 비교한다. **M1 측정 완료가 선행 조건이며 특정 정확도 통과는 선행 조건이 아니다.**

첫 semantic 실험은 로컬에서 생성한 고정 embedding artifact와 exact search로 수행할 수 있다. vector DB나 live inference 서버는 필수 조건이 아니다. 모델/prefix/tokenizer/정밀도/원문 revision을 고정한다. 구체 모델 후보는 [런타임 문서](../architecture/runtime-and-performance.md)에 있으며 최적 모델이라는 주장은 하지 않는다.

생성형 LLM은 별도 선택적 어댑터다. 애매한 사례의 추가 evidence, 구조 설명 후보, 글의 outline/초안에 활용할 수 있으나 읽기·제안 경계를 지킨다. routing이 반드시 LLM을 기다려야 하는 구조를 기본값으로 하지 않는다. LLM이 존재한다는 이유로 유용한 결과까지 배제하는 원칙도 세우지 않는다.

## Adoption criteria

동일 held-out 조건에서 후보 recall, 제안 precision–coverage, no-match, 실패 slice, 사용자 선택 시간, p95/자원 비용을 비교한다. 특정 지표 1%p의 변화만으로 유지/폐기를 자동 결정하지 않는다. 표본과 불확실성을 보고 복잡성에 비해 유효한 개선인지 판단한다.

Semantic이 유효하지 않으면 제거 가능한 adapter로 남기고 단순 baseline을 유지한다. 유효하면 retrieval/평가의 선택적 신호로 채택하되 similarity를 probability나 truth로 해석하지 않는다.

## Consequences

초기에 모델 artifact 관리와 비교 실험이 추가되지만, 제품 핵심의 의미 표현 가능성을 뒤로 미루지 않는다. UI·DB·오케스트레이션 확대 대신 가장 작은 실험으로 도입 여부를 결정한다.

관련 계약: [검색·점수](../architecture/retrieval-and-scoring.md) · [실험 계획](../plan/02-core-plan.md)
