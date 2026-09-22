> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# ADR 0004 · 시점 기반 Replay와 검증 분리

- Status: Accepted, revised
- 최초 결정/개정: 2026-09-22

## Context

같은 dataset/engine/config라는 설명만으로 과거 판단을 재현할 수 없다. profile·membership·feedback·모델·후보 검색 결과가 달라질 수 있고, 최종 상태를 과거 입력에 사용하면 정보가 누수된다.

## Decision

Replay는 M0/M1부터 1급 기능이다. query 당시 recordedAt snapshot, 입력/source revision, eligible Context, profile manifest, candidate 목록, feature/model/config hash를 남긴다. 현재 query와 같은 원본의 파생물이 자기 검색 근거가 되는 것을 막는다.

정확히 같은 저장 feature와 후보에서 score/policy를 재생하는 `decision replay`와 모델/ANN을 다시 실행하는 `rerun`을 구분한다. 외부 모델의 bit-identical 재추론을 약속하지 않는다. 고정 seed를 가진 난수는 실험에 허용하며 stable tie-break와 clock을 명시한다.

시간과 원본/대화 group을 고려하여 development/validation/final holdout을 나눈다. weight/transform/threshold는 개발·검증 구간에서 결정한다. test를 보고 조정하면 새 holdout이 필요하다.

다중 라벨 Recall과 Hit, 제안 precision과 coverage, no-match 오제안, 사용자 행동, latency를 각각 정의한다. 합성 fixture 통과와 실제 품질 검증을 분리한다. 공개 저장소에는 합성 데이터와 검토한 집계만 둔다.

## Consequences

라벨·snapshot·artifact 관리가 필요하지만 이를 판단 엔진의 핵심 비용으로 인정한다. 평가셋이 작거나 label이 불완전하면 불확실성을 표시하고 정확도 하나로 다음 기능을 정당화하지 않는다.

기준 계약: [실험 계획](../plan/02-core-plan.md) · [성능 측정](../architecture/runtime-and-performance.md)
