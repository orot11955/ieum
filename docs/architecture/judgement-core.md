> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# Judgement Core · 전체 구조

- 개정: 2026-09-22
- 상태: 구현 계약. 아직 구현·성능 검증하지 않았다.
- 제품 기준: [목적과 범위](../product/vision-and-scope.md)

## 1. 책임

Core는 현재 이용 가능한 근거를 사용하여 기록과 맥락의 연결 후보를 만들고, 판단을 보류할 수 있으며, 사용자가 검토할 변경안을 반환한다. Core가 개인의 사고를 대신 확정하거나 기록의 진실성을 판정하지 않는다.

서로 다른 작업을 구분한다.

| 작업 | 출력 | 실행 성격 |
| --- | --- | --- |
| Retrieval | 후보 집합과 검색 경로 | 읽기 |
| Routing | 후보별 점수·근거·보류 이유 | 읽기 |
| Primary selection | 대표 맥락 후보 또는 선택 보류 | 읽기 |
| Structure analysis | 유지/분리/병합/상위 맥락 변경안 | 비동기 읽기 |
| Derivation | 출처가 있는 정리 재료/초안 | 새 파생물 작성안 |
| Apply command | 승인된 변경과 감사 이력 | 트랜잭션 쓰기 |

초기 Core는 Retrieval과 Routing을 중심으로 구현한다. Structure/Derivation의 독립성을 확보하되 미래 서비스의 빈 구현을 미리 만들지 않는다.

## 2. 실행 경로

```text
Capture 저장 명령 ───────────────────────────────→ 저장 완료
       │
       └→ 판단 요청
            ↓
      입력 revision / asOf / 권한 범위 확정
            ↓
      텍스트 feature 준비 + 선택적 embedding 준비
            ↓
      CandidateFinder: lexical / semantic / asserted links
            ↓
      후보별 근거를 배치 조회하고 immutable snapshot 구성
            ↓
      Pure Evaluators → Scorer → Policy → Explain trace
            ↓
      Candidate / Proposal / Abstention
            ↓
      사용자 명령 또는 승인
            ↓
      revision 검증 + 원자적 적용 + Feedback / MutationLog
```

저장 완료 응답을 의미 판단 완료와 묶지 않는다. 임베딩·생성 모델의 지연이나 실패 때문에 원본 저장이 실패해서는 안 된다. 초기 CLI에서는 순차 실행해도 명령과 출력 상태를 구분한다.

## 3. 코드 경계

```text
apps/lab-cli
  ├─ application orchestration
  ├─ JSONL / artifact adapters
  └─ packages/core (pure calculations)

후속 단계:
apps/api / apps/lab-web
  └─ application orchestration
       ├─ packages/core
       ├─ DB adapter
       └─ embedding / generation adapter
```

Core에 Fastify, React, Drizzle, pg, fetch, 모델 SDK를 import하지 않는다. Core의 evaluator는 DB를 직접 조회하지 않는다. 애플리케이션 계층이 필요한 데이터를 배치 준비한 뒤 동기적 계산 함수를 호출한다. 모듈 분리는 책임의 분리이지 microservice 분리가 아니다.

첫 구현의 실제 폴더 수는 [계획서](../plan/02-core-plan.md)를 따른다. ORM 모델을 Core 타입으로 노출하지 않는다.

## 4. 공통 계약

아래 코드는 타입 계약 예시이며 현재 배포된 SDK가 아니다.

```ts
type Availability = 'available' | 'missing' | 'not_applicable' | 'error';
type Family = 'content' | 'graph' | 'continuity' | 'feedback';

type EvidenceRef = Readonly<{
  entityType: 'capture' | 'unit' | 'context' | 'relation' | 'feedback';
  id: string;
  revision: number;
  originKey: string; // 동일 원본에서 파생된 중복 근거를 추적
}>;

type Evaluation = Readonly<{
  key: string;
  family: Family;
  availability: Availability;
  value: number | null; // available이면 finite number
  scoreTransformVersion: string;
  reasonCodes: readonly string[];
  sources: readonly EvidenceRef[];
}>;

type CandidateJudgement = Readonly<{
  contextId: string;
  contextRevision: number;
  rankScore: number | null;
  contentScore: number | null;
  evidenceCoverage: number;
  matchProbability: number | null; // 검증된 calibrator가 없으면 null
  policy: 'ABSTAIN' | 'CANDIDATE' | 'SUGGEST';
  reasonCodes: readonly string[];
  evaluations: readonly Evaluation[];
}>;
```

가용성은 의미적 신뢰도와 다르다. `available + value=0`은 실제 측정 결과이고 `missing + value=null`은 미측정이다. `error`를 조용히 0으로 바꾸지 않는다. 추천 이유는 저장된 근거의 템플릿 표현이어야 하며, 생성 모델이 근거 없이 추가한 설명으로 대체하지 않는다.

## 5. Snapshot과 실행 식별

판단 실행에는 다음을 남긴다.

- 입력 Capture/ThoughtUnit revision, query hash, snapshot ID, `asOfRecordedAt`.
- 해당 시점에 존재하고 조회가 허용된 Context 목록과 revision.
- candidate IDs/order, 각 검색 source의 결과, 검색기 설정과 truncation 여부.
- profile revision, 원본 계열 제외 규칙, feature/normalizer/ICU/runtime 버전.
- engine commit, config hash, score transform과 threshold 버전.
- embedding 모델 revision, tokenizer, pooling, prefix, 정밀도, artifact hash.
- 오류·fallback·timeout, stage별 시간, queue time, cache hit 여부.

Core가 실시간 시스템 시간을 내부에서 읽지 않는다. 조회 가능한 시점은 `recordedAt`을 기준으로 제한하고, 사용자가 입력한 `occurredAt`만으로 과거에 알려지지 않았던 자료를 과거 snapshot에 끼워 넣지 않는다.

## 6. 모드와 보류

`observe`가 첫 기본 모드다. 점수와 후보를 보여주지만 검증되지 않은 임계값으로 강한 추천을 만들지 않는다. 사용자는 후보를 직접 선택할 수 있다.

후속 `suggest` 모드는 검증된 설정이 있을 때만 켠다. 내용 근거 없음, 짧은 지시어만 있는 입력, source 오류, profile 지연, 예산 초과, 잘못된 숫자, 후보 없음은 이유가 있는 보류로 반환할 수 있다. `후보 없음`은 `세상에 관련 맥락이 없음`의 증거가 아니다.

`STRONG_SUGGEST`는 초기 enum에 넣지 않는다. 충분한 추천 건수와 정밀도/coverage 평가를 확보한 후 별도 정책 버전으로 추가한다. 보정되지 않은 confidence 임계값을 가져와 활성화하지 않는다.

## 7. 연결과 대표 맥락

Attachment는 다중 라벨 문제다. A/B 둘 다 관련 있으면 둘 다 제안한다. primary는 표시·탐색 편의를 위한 선택 사항이며, 정답 소속의 유일성을 의미하지 않는다. primary가 필요하다는 사용자 명령이 있을 때만 margin과 기존 선택을 고려한다.

명시적으로 사용자가 맥락 ID를 지정한 경우 그것은 분류 정답을 맞힌 것이 아니라 사용자 명령이다. 권한과 revision을 확인해 적용하고 자동 추천 지표에서는 분리한다.

## 8. 변경과 피드백

판단 결과와 영속 구조 변경을 분리한다. Proposal에는 대상 revision, 변경 operation, 근거 run ID, 예상 영향이 포함되어야 한다. 승인 당시 관련 revision이 달라졌으면 새 미리보기를 요구하는 충돌로 반환한다. 상세 원자성/취소 규칙은 [도메인 모델](domain-model.md)을 따른다.

사용자 미응답은 음성 라벨이 아니다. primary 변경과 맥락 관련성 거절은 다른 피드백이다. 사용자 승인률은 편의성 지표이고, 명시적으로 검토한 적합성 라벨만 평가 정답으로 사용한다.

## 9. 다음 문서의 책임

[도메인 모델](domain-model.md)은 보존/변경 불변식을, [후보 검색·점수](retrieval-and-scoring.md)는 실제 계산과 실험 설정을, [구조·파생](structure-and-derivation.md)은 느린 분석과 글 정제의 계약을 정의한다. 성능 수치는 [런타임 문서](runtime-and-performance.md), 성공 지표와 데이터 분할은 [계획서](../plan/02-core-plan.md)가 기준이다.
