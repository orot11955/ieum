# Judgement Core Architecture

## 1. 목적

ieum의 핵심 가설은 다음과 같다.

> 생각, 관찰, 질문, 결정, 행동, 결과를 각각 독립된 앱 기능으로 관리하는 대신,
> 하나의 기록 풀에 보존하고 맥락(Context)과 파생 관계(Derivation)로 연결하면
> 개인의 사고 흐름을 장기적으로 추적하고 다시 활용할 수 있다.

현재 단계에서는 전체 개인 관리 웹을 만들지 않는다.
먼저 **Judgement Core**가 실제로 쓸 만한 판단을 만들 수 있는지 검증한다.

검증 질문은 하나다.

> 새로운 ThoughtUnit이 들어왔을 때, Core가 기존 Context 중 관련 가능성이 높은 후보를
> 충분히 정확하고 설명 가능하게 제안할 수 있는가?

---

## 2. 제품 개념

최종 제품의 사용자 관점 개념은 단순하다.

- 한 번 기록한다.
- 관련된 생각과 흐름을 연결한다.
- 시간이 지나면 결정, 프로젝트, 정리본, 글감, 글로 발전시킨다.
- 모든 결과물은 원본으로 거슬러 올라갈 수 있다.

일정과 할 일은 시스템의 중심이 아니다.
블로그도 별도의 섬이 아니다.

모든 것은 기록 풀에서 파생되는 하나의 View 또는 Artifact다.

```text
Capture
  ↓
ThoughtUnit
  ↓
Context
  ↓
Relation / Evidence
  ↓
Synthesis
  ↓
Artifact

Artifact:
- Decision
- Task
- Project
- Wiki
- Blog
- Review
- Guide
```

---

## 3. Core의 책임

Judgement Core가 담당한다.

1. 기록의 의미 단위를 표현한다.
2. 관련 가능성이 있는 Context 후보를 찾는다.
3. 여러 독립 Evidence를 평가한다.
4. 관련성, 신뢰도, 후보 간 차이를 계산한다.
5. 판단 근거를 구조화해서 반환한다.
6. 의미 구조를 직접 변경하지 않고 Proposal을 생성한다.
7. 사용자의 Accept / Reject / Correct 이력을 축적할 수 있게 한다.
8. 같은 Engine / Config / Dataset 조합을 Replay할 수 있게 한다.

Core가 담당하지 않는다.

- 인증
- 일정 UI
- Task Dashboard
- Blog Editor
- Markdown 편집
- 알림
- 외부 발행
- Obsidian 연동
- LLM 호출
- Embedding
- Vector DB
- 자동 Knowledge Graph 생성

---

## 4. 핵심 불변 원칙

### 4.1 Capture는 원본이다

사용자가 입력한 원문은 판단 결과와 분리한다.

정제된 문장이나 요약이 원본을 덮어쓰면 안 된다.

```text
Capture
"Luna가 생각보다 루프를 많이 도는데 사용량은 적네.
Worker로는 괜찮을지도 모르겠다. 다음 repo에서 다시 보자."

↓ 수동 ThoughtUnit 분리

Observation
"Luna는 반복 횟수가 많다."

Observation
"사용량은 상대적으로 적다."

Hypothesis
"Worker 역할에는 적합할 수 있다."

Action
"다음 repository에서 다시 검증한다."
```

V1에서는 ThoughtUnit 자동 분리를 구현하지 않는다.

---

### 4.2 Context는 Folder가 아니다

Context의 정의:

> 여러 ThoughtUnit을 왜 같이 보고 있는지를 설명하는 살아 있는 맥락.

Context 종류:

- TOPIC: 장기 관심사
- FLOW: 하나의 질문/판단 흐름
- PROJECT: 끝이 있는 실행 결과
- COLLECTION: 의도적으로 묶은 자료

예:

```text
AI Coding                   TOPIC
Worker 모델 선택            FLOW
Codex 설정 통합             PROJECT 또는 FLOW
```

하나의 ThoughtUnit은 여러 Context와 연결될 수 있다.

단, 사용자가 길을 잃지 않게 Primary Context는 최대 하나만 둔다.

---

### 4.3 Relation은 의미가 있어야 한다

단순 RELATED_TO만 남발하지 않는다.

초기 Relation:

- SUPPORTS
- CONTRADICTS
- DERIVED_FROM
- RESULT_OF
- CAUSES
- REFINES
- IMPLEMENTS
- RELATED_TO

사용자 UI에서는 자연어로 보여준다.

예:

- 이 생각의 근거
- 이 생각을 반박함
- 여기서 나온 결정
- 이 작업의 결과
- 여기서 발전한 생각

---

### 4.4 정제는 덮어쓰기가 아니라 파생이다

```text
원본 기록
  ↓
ThoughtUnit
  ↓
Context
  ↓
Synthesis
  ↓
Draft
  ↓
Publication
```

각 단계는 이전 단계를 보존한다.

블로그 문단이 만들어져도 원본 ThoughtUnit과의 계보를 유지할 수 있어야 한다.

---

## 5. 기술 스택

### Runtime

- Node.js 24 LTS
- TypeScript 6.x
- ESM only

TypeScript:

- strict
- noUncheckedIndexedAccess
- exactOptionalPropertyTypes
- useUnknownInCatchVariables
- noImplicitOverride

### Monorepo

- pnpm workspace
- Nx/Turborepo 미사용

예상 구조:

```text
ieum/
├─ apps/
│  ├─ api/
│  ├─ lab-web/
│  └─ replay-cli/
├─ packages/
│  ├─ core/
│  ├─ contracts/
│  ├─ db/
│  └─ testkit/
├─ configs/
│  └─ judgement/
├─ datasets/
│  ├─ sample/
│  └─ private/
└─ docs/
```

### API

- Fastify 5.x
- Zod
- Swagger는 개발 편의용

### Database

- PostgreSQL 18
- Drizzle ORM
- node-postgres
- pg_trgm extension

PostgreSQL을 선택하는 이유:

- 관계형 제약을 강하게 표현 가능
- JSONB Evidence 저장 가능
- Partial Unique Index 가능
- Full Text Search 확장 가능
- pg_trgm 사용 가능
- 이후 필요 시 pgvector 추가 가능
- 별도 Graph DB 불필요

Neo4j와 별도 Vector DB는 V1에서 사용하지 않는다.

### Lab UI

- React 19
- Vite
- TanStack Query
- Local UI state는 React state

### Test

- Vitest
- Testcontainers
- Playwright

---

## 6. Core 독립성

의존 방향:

```text
apps/api ───────→ packages/core
packages/db ────→ packages/core
apps/replay-cli → packages/core
```

`packages/core`는 다음을 import하지 않는다.

- Fastify
- React
- Drizzle
- pg
- Axios
- TanStack
- NestJS

가능한 한 Pure TypeScript로 유지한다.

---

## 7. Domain Model

### Capture

```ts
interface Capture {
  id: CaptureId;
  body: string;
  sourceType: "MANUAL" | "IMPORT" | "SYSTEM";
  sourceKey?: string;
  sessionKey?: string;
  occurredAt?: Date;
  createdAt: Date;
}
```

### ThoughtUnit

```ts
type ThoughtRole =
  | "OBSERVATION"
  | "CLAIM"
  | "HYPOTHESIS"
  | "QUESTION"
  | "DECISION"
  | "ACTION"
  | "RESULT"
  | "EVIDENCE"
  | "RESOURCE"
  | "UNKNOWN";

type Certainty =
  | "CONFIRMED"
  | "EXPERIENCE"
  | "INFERRED"
  | "TENTATIVE"
  | "DISPROVED"
  | "UNKNOWN";

interface ThoughtUnit {
  id: ThoughtUnitId;
  captureId: CaptureId;
  sequence: number;
  text: string;
  startOffset?: number;
  endOffset?: number;
  role: ThoughtRole;
  certainty: Certainty;
  createdAt: Date;
  updatedAt: Date;
}
```

### Context

```ts
type ContextKind = "TOPIC" | "FLOW" | "PROJECT" | "COLLECTION";

interface Context {
  id: ContextId;
  name: string;
  kind: ContextKind;
  purpose: string;
  status: "ACTIVE" | "CLOSED" | "SPLIT" | "MERGED";
  createdAt: Date;
  updatedAt: Date;
}
```

`purpose`는 필수다.

예:

```text
name:
Worker 모델 선택

purpose:
Main 모델의 품질을 유지하면서 반복 구현 비용을 줄일 Worker 모델을 결정한다.
```

### ContextMembership

```ts
type MembershipRole =
  | "PRIMARY"
  | "SECONDARY"
  | "EVIDENCE"
  | "BACKGROUND";
```

하나의 ThoughtUnit에 PRIMARY는 최대 하나.

### ThoughtRelation

```ts
type ThoughtRelationType =
  | "SUPPORTS"
  | "CONTRADICTS"
  | "DERIVED_FROM"
  | "RESULT_OF"
  | "CAUSES"
  | "REFINES"
  | "IMPLEMENTS"
  | "RELATED_TO";
```

---

## 8. 판단 Pipeline

```text
ThoughtUnit
   ↓
FeatureExtractor
   ↓
CandidateFinder
   ↓
Evaluator[]
   ↓
ScoreAggregator
   ↓
ConfidenceCalculator
   ↓
PolicyResolver
   ↓
Judgement
   ↓
Proposal
   ↓
Feedback
```

핵심 원칙:

> 하나의 거대한 판단 함수가 아니라 작은 Evaluator들이 독립 Evidence를 만들고,
> Aggregator와 Policy가 최종 행동을 정한다.

---

## 9. Feature Extraction

V1은 NLP/LLM 없이 동작한다.

Normalize:

- Unicode NFKC
- 영문 lower-case
- 공백 정규화
- 일반 punctuation 정리

한국어:

- Intl.Segmenter("ko", { granularity: "word" })
- 2-gram / 3-gram Character N-gram

FeatureExtractor는 버전 관리한다.

예:

```text
feature-v1
```

---

## 10. Context Profile

Context 전체 Member를 매번 읽지 않기 위해 재생성 가능한 Profile을 둔다.

```ts
interface ContextProfile {
  contextId: ContextId;
  normalizedText: string;
  topTerms: string[];
  memberCount: number;
  roleCounts: Partial<Record<ThoughtRole, number>>;
  lastActivityAt?: Date;
  version: number;
}
```

Source of Truth가 아니다.

---

## 11. Candidate Finder

목표는 정답 확정이 아니라 **정답을 후보 집합에서 놓치지 않는 것**이다.

따라서 Precision보다 Recall을 우선한다.

Candidate Source:

1. Context name/purpose lexical similarity
2. Context corpus similarity
3. 최근 활동 Context
4. 같은 session에서 사용된 Context
5. 연결된 ThoughtUnit이 속한 Context
6. 명시적으로 지정된 Context

초기에는 Active Context를 Memory에 올려 Cheap Similarity로 계산한다.

최대 Candidate:

```text
25
```

Context 수가 충분히 커진 뒤 pg_trgm / PostgreSQL FTS Adapter를 검토한다.

---

## 12. Evaluator 구조

Evaluator Interface:

```ts
interface Evaluator {
  readonly key: string;

  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}

interface EvaluationResult {
  evaluatorKey: string;
  applicable: boolean;
  score: number;
  reliability: number;
  reasons: Evidence[];
}
```

`score`와 `reliability`는 분리한다.

V1에서 계획하는 Evaluator:

1. ContextIdentityEvaluator
2. ContextCorpusEvaluator
3. RelationEvaluator
4. SessionContinuityEvaluator
5. RecencyEvaluator
6. FeedbackAffinityEvaluator

단, Phase 0+1에서는 Candidate Finder까지 구현하고 Evaluator 고도화는 다음 Phase다.

---

## 13. Weight와 Config

가중치는 코드에 하드코딩하지 않는다.

예:

```yaml
version: baseline-v1

evaluators:
  contextIdentity:
    enabled: true
    weight: 0.25

  contextCorpus:
    enabled: true
    weight: 0.25

  relation:
    enabled: true
    weight: 0.20

  sessionContinuity:
    enabled: true
    weight: 0.10

  recency:
    enabled: true
    weight: 0.08

  feedbackAffinity:
    enabled: true
    weight: 0.12
    minSamples: 20
```

판단 실행 시 반드시 저장한다.

- engineVersion
- configVersion
- configHash
- featureExtractorVersion

---

## 14. Relevance / Confidence / Margin

하나의 숫자만으로 판단하지 않는다.

### Relevance

얼마나 해당 Context와 관련 있어 보이는가.

### Confidence

사용 가능한 Evidence의 양과 Evaluator 간 합의가 충분한가.

### Margin

Top 1과 Top 2 차이.

```text
A 0.87
B 0.55
→ 비교적 명확

A 0.86
B 0.83
→ 의미적으로 애매
```

높은 Relevance라도 Margin이 낮으면 강한 Suggestion을 만들지 않는다.

---

## 15. Policy

V1 정책:

- IGNORE
- CANDIDATE
- SUGGEST
- STRONG_SUGGEST

AUTO는 의미 판단에 사용하지 않는다.

의미 구조 변경:

```text
Judgement
→ Proposal
→ User Feedback
→ Mutation
```

---

## 16. Proposal / Feedback

Proposal 초기 타입:

- ATTACH_CONTEXT
- MOVE_PRIMARY_CONTEXT

향후:

- DETACH_CONTEXT
- SPLIT_CONTEXT
- MERGE_CONTEXT
- CREATE_PARENT_CONTEXT
- PROMOTE_SYNTHESIS

Feedback:

- ACCEPT
- REJECT
- CORRECT
- DISMISS

CORRECT가 특히 중요하다.

예:

```text
Core:
모델 역할 전략?

User:
아니, Codex 설정 관리.
```

이때 잘못 추천된 Context에 Negative Evidence,
사용자가 선택한 Context에 Positive Evidence를 남길 수 있다.

---

## 17. Explainability

모든 판단 근거는 구조화한다.

예:

```json
{
  "evaluator": "relation",
  "score": 0.88,
  "reliability": 0.90,
  "reasonCode": "RELATED_UNIT_IN_CONTEXT",
  "evidence": {
    "relatedThoughtUnitIds": ["..."],
    "matchingContextId": "..."
  }
}
```

문장만 저장하지 않는다.

UI가 구조화 Evidence를 사람이 읽을 수 있는 문장으로 표현한다.

---

## 18. Replay

Replay는 1급 기능이다.

```bash
pnpm replay   --dataset personal-v1   --config baseline-v1
```

필수 Metric:

- Candidate Recall@5
- Candidate Recall@10
- Top-1 Accuracy
- Top-3 Accuracy
- MRR
- Strong Suggestion Precision
- Correction Rate
- No-match Accuracy
- Noise Rate

같은 Dataset / Engine / Config는 항상 같은 결과를 내야 한다.

Random 사용 금지.

Clock 주입.

Tie-break는 deterministic하게 처리한다.

---

## 19. Gold Dataset

실제 개인 기록으로 Gold Set을 만든다.

Private:

```text
datasets/private
```

Git에 포함하지 않는다.

Public/Sanitized:

```text
datasets/sample
```

Gold Dataset은 Calibration / Holdout으로 분리한다.

권장:

- Calibration 70%
- Holdout 30%

Weight 수정은 Calibration 기준.
Holdout은 최종 확인에만 사용한다.

---

## 20. 첫 성공 Gate

초기 참고 기준:

```text
Candidate Recall@10 >= 95%
Top-3 Accuracy >= 85%
Strong Suggestion Precision >= 85%
Noise Rate <= 10%
```

Core 성공의 진짜 기준은 숫자만이 아니다.

100개 이상의 실제 기록을 사용한 뒤:

- 추천을 계속 받고 싶은가?
- Context를 직접 찾는 것보다 Top 3에서 선택하는 편이 쉬운가?
- 추천 이유를 이해할 수 있는가?
- 틀렸을 때 왜 틀렸는지 추적 가능한가?

이 질문에 Yes여야 한다.

---

## 21. 이후 확장

Core V1 성공 후에만 순서대로 확장한다.

### Context Health

- Member count
- Relation density
- Lexical cohesion
- Role distribution
- Activity distribution

### Split / Merge Proposal

자동 실행 금지.

```text
Cluster 발견
+
의미적 독립성
+
충분한 기록량
→ Split Proposal
```

Merge 외에도 CREATE_PARENT_CONTEXT를 지원한다.

### Derivation Readiness

숫자 점수보다 Stage를 우선한다.

- RAW
- FORMING
- EVALUATING
- DECIDED
- OBSERVED
- SYNTHESIZABLE

### Synthesis

Context가 SYNTHESIZABLE이 되면 다음 구조를 모아준다.

- 중심 질문
- 현재 결정
- 주요 근거
- 반대 근거
- 실험
- 결과
- 열린 문제

자동 글 작성은 이 단계에서도 하지 않는다.

---

## 22. AI 도입 원칙

AI는 Core가 아니다.

향후 AI가 추가되어도:

```text
Rule Evaluators
+
Statistical Evaluator
+
Semantic/LLM Evaluator
      ↓
Aggregator
      ↓
Policy
```

구조를 유지한다.

AI가 최종 의미 구조를 직접 수정해서는 안 된다.

도입 여부는 Replay Holdout 개선 폭으로 판단한다.

예:

```text
Base Top3        89%
Embedding Top3   90%
→ 복잡성 대비 가치 낮음

Base Top3        89%
Embedding Top3   96%
→ 채택 검토
```

---

## 23. 금지 사항

V1에서 금지:

- Microservices
- Full Event Sourcing
- Generic EAV
- 자체 LLM 학습
- 별도 Vector DB
- Neo4j
- 자동 Knowledge Graph
- 모든 관계 자동 생성
- 자동 ThoughtUnit 분리
- 자동 Split/Merge 실행
- Blog Editor
- Task Dashboard
- AI-first 구조
- 필요 이상의 Generic Framework

---

## 24. 최종 제품으로의 연결

Core가 유효하다고 검증되면 외부 기능은 Adapter처럼 붙인다.

```text
                 Judgement Core
                      │
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
      Today         Project       Knowledge
        ↓             ↓             ↓
      Task          Decision      Synthesis
                                      ↓
                                   Artifact
                              ┌───────┼───────┐
                              ↓       ↓       ↓
                            Blog     Wiki    Review
```

ieum의 중심은 일정이나 블로그가 아니라,
**생각이 연결되고 정제되어 결과물로 발전하는 흐름**이다.
