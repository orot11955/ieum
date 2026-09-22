# Core Lab Experiment & Implementation Plan

## 1. 목표

이 계획서는 ieum 전체 제품을 구현하기 위한 로드맵이 아니다.

첫 번째 목표는 **Judgement Core의 가능성 검증**이다.

성공 여부가 확인되기 전까지 다음 제품 기능으로 확장하지 않는다.

---

## 2. 첫 구현 범위

최초 Codex 작업 범위:

```text
Phase 0
+
Phase 1
```

완성해야 하는 것:

- pnpm workspace
- TypeScript strict 설정
- PostgreSQL 개발 환경
- Drizzle schema / migration
- Capture
- ThoughtUnit
- Context
- ContextMembership
- ThoughtRelation
- 최소 API
- 최소 Lab UI
- Text Normalizer
- FeatureExtractor
- ContextProfile
- CandidateFinder
- Replay CLI
- Sanitized Sample Gold Dataset
- Candidate Recall Metric

아직 구현하지 않는 것:

- Evaluator 고도화
- Aggregator
- Proposal
- Feedback 학습
- Split/Merge
- Derivation
- Synthesis
- AI
- Embedding
- Blog
- Task/Calendar

---

## 3. 구현 순서

### Step 1. Repository Foundation

구성:

```text
apps/
  api/
  lab-web/
  replay-cli/

packages/
  core/
  contracts/
  db/
  testkit/

configs/judgement/
datasets/sample/
datasets/private/
docs/
```

Root scripts:

- dev
- build
- lint
- typecheck
- test
- test:integration
- replay

완료 조건:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

성공.

---

### Step 2. PostgreSQL / Drizzle

Compose에서는 DB만 필수로 실행한다.

DB:

- PostgreSQL 18
- uuidv7 PK
- timestamptz
- pg_trgm 활성화

초기 Table:

- capture
- thought_unit
- context
- context_membership
- thought_relation
- context_profile

판단 관련 테이블은 Phase 2에서 추가 가능.

제약:

- ThoughtUnit당 PRIMARY Context 최대 하나
- FK 명시
- 삭제 정책 명시
- Context Profile은 재생성 가능

---

### Step 3. Pure Core Domain

`packages/core` 구현.

금지 import:

- Fastify
- Drizzle
- pg
- React
- Axios

Domain 생성 시 Framework 타입을 노출하지 않는다.

테스트 우선.

---

### Step 4. Persistence Port / Adapter

Core에 Port 정의.

예:

```ts
interface ContextProfileReader {
  getActiveProfiles(): Promise<ContextProfile[]>;
}
```

`packages/db`에서 Drizzle Adapter 구현.

목적:

DB 교체가 아니라 **Core 실험을 DB 구현과 독립적으로 수행하기 위해서**다.

---

### Step 5. Minimal API

Fastify.

필수 Endpoint:

- POST /api/captures
- POST /api/captures/:id/thought-units
- GET /api/contexts
- POST /api/contexts
- POST /api/thought-units/:id/context-memberships
- POST /api/thought-units/:id/candidates

Swagger는 개발 보조 용도.

---

### Step 6. Minimal Lab UI

제품 UI를 만들지 않는다.

#### Capture Lab

- 원문 입력
- ThoughtUnit 수동 분리
- Role 지정
- Certainty 지정

#### Candidate Inspector

- ThoughtUnit 표시
- Candidate Top N
- Candidate별 Cheap Score 근거
- Gold Expected Context가 있다면 비교

#### Context Inspector

- name
- purpose
- kind
- member count
- recent members
- profile terms

UI polish는 후순위.

---

## 4. Candidate Finder 구현

### 목표

Candidate Finder는 정답을 결정하지 않는다.

> 전체 Context 중 정답 가능성이 있는 작은 후보 집합을 만드는 것.

따라서 Recall 최우선.

### 후보 Source

1. Context name/purpose similarity
2. Context profile corpus similarity
3. Session continuity
4. Relation-linked Context
5. Recent active Context
6. Explicit Context

각 Source에서 후보를 모아서 Union.

중복 제거.

최대 25개 평가.

최종 Replay는 Recall@5, Recall@10 측정.

---

## 5. Korean Text Baseline

초기에는 외부 NLP 모델을 쓰지 않는다.

Normalizer:

- NFKC
- lower case
- whitespace normalize
- punctuation normalize

Tokenizer:

- Intl.Segmenter ko
- 영문 word token
- character 2-gram / 3-gram

Similarity 실험 후보:

- Jaccard
- Cosine
- TF-IDF

각 구현은 전략 객체로 격리한다.

복잡한 추상화 Framework는 만들지 않는다.

---

## 6. Sample Dataset

Public Sample은 Sanitized 데이터.

최소 Context:

- AI Coding
- Worker 모델 선택
- Codex 설정 공유
- Knowledge System
- Web Architecture
- Linux Environment
- MES CI/CD
- Personal Management System

쉬운 케이스와 Ambiguous 케이스를 같이 만든다.

예:

```text
"Subagent 설정을 중앙에서 공유하면
모델 설정도 같이 관리할 수 있을 것 같다."
```

가능 후보:

- Codex 설정 공유
- Agent Architecture

No-match 케이스도 포함한다.

---

## 7. Private Gold Dataset

실사용 검증은 사용자의 실제 기록 100개 이상으로 수행한다.

위치:

```text
datasets/private/
```

.gitignore 필수.

구조:

```text
personal-v1/
  calibration.jsonl
  holdout.jsonl
```

대략 70/30 분리.

---

## 8. Phase 1 Success Gate

Candidate Finder 성공 기준:

```text
Recall@10 >= 95%
```

가능하면 함께 측정:

- Recall@5
- MRR
- 후보 평균 개수
- No-match Candidate Noise

이 기준을 만족하지 못하면 Evaluator/Aggregator 단계로 넘어가지 않는다.

후보 탐색부터 수정한다.

---

## 9. Phase 2 — Judgement Engine

Phase 1 성공 후 구현.

Evaluator:

1. ContextIdentityEvaluator
2. ContextCorpusEvaluator
3. RelationEvaluator
4. SessionContinuityEvaluator
5. RecencyEvaluator
6. FeedbackAffinityEvaluator

각 Evaluator 출력:

- applicable
- score
- reliability
- structured Evidence

Aggregator:

- configuredWeight
- reliability
- evidenceMass
- agreement
- relevance
- confidence
- margin

Policy:

- IGNORE
- CANDIDATE
- SUGGEST
- STRONG_SUGGEST

의미 판단 AUTO 금지.

---

## 10. Phase 3 — Proposal / Feedback

Proposal:

- ATTACH_CONTEXT
- MOVE_PRIMARY_CONTEXT

Feedback:

- ACCEPT
- REJECT
- CORRECT
- DISMISS

CORRECT 시:

- 추천 대상 Negative
- 실제 선택 대상 Positive

FeedbackAffinityEvaluator는 충분한 Sample이 쌓이기 전에는 비활성.

최소 20건을 기본값으로 시작.

---

## 11. Phase 4 — Context Health

Core 추천이 실제 사용에서 유효함을 확인한 뒤 진행.

분석 항목:

- member count
- relation density
- lexical cohesion
- activity distribution
- role distribution
- question/decision dispersion

목적:

> Context가 너무 커졌거나 독립 흐름이 생겼는지를 감지.

자동 변경 없음.

---

## 12. Phase 5 — Split / Merge

Proposal Type 확장:

- SPLIT_CONTEXT
- MERGE_CONTEXT
- CREATE_PARENT_CONTEXT
- DETACH_CONTEXT

Split은 단순 Cluster Detection만으로 제안하지 않는다.

필요 조건:

```text
Graph/lexical cluster
+
cluster 사이 낮은 연결
+
각 cluster의 충분한 크기
+
독립 Question 또는 Decision
```

항상 Preview 제공.

---

## 13. Phase 6 — Derivation Readiness

Context의 성숙 단계:

- RAW
- FORMING
- EVALUATING
- DECIDED
- OBSERVED
- SYNTHESIZABLE

목표:

> 자동 글 작성이 아니라 정리할 가치가 생긴 흐름을 찾는 것.

---

## 14. Phase 7 — Synthesis

SYNTHESIZABLE Context에서 다음 정보를 모은다.

- 중심 질문
- 현재 결정
- 주요 근거
- 반대 근거
- 실험
- 결과
- 열린 문제

사용자가 정리본을 작성한다.

정리본은 원본 기록을 대체하지 않는다.

---

## 15. Phase 8 — Semantic Experiment

Base Core 성능을 먼저 기록한다.

그 이후에만:

- Embedding Evaluator
- Statistical Evaluator
- LLM Semantic Evaluator

를 하나씩 추가하여 Holdout 비교한다.

기존 Rule/Relation Core를 제거하지 않는다.

AI 도입 기준은 느낌이 아니라 **Replay 개선 폭**이다.

---

## 16. Replay First

CLI 예:

```bash
pnpm replay   --dataset personal-v1   --config baseline-v1
```

Config 비교:

```bash
pnpm replay:compare   baseline-v1   lexical-v2   --dataset personal-v1
```

출력 Metric:

- Recall@5
- Recall@10
- Top1
- Top3
- MRR
- Suggestion Precision
- Correction Rate
- No-match Accuracy
- Noise Rate

틀린 Case에는 판단 Trace를 제공한다.

---

## 17. Test Strategy

### Unit

Vitest.

특히:

- Normalizer
- FeatureExtractor
- Similarity
- Candidate merge/rank
- deterministic tie-break

Table-driven test 권장.

### Integration

Testcontainers + PostgreSQL.

- migration
- FK/unique constraints
- Repository Adapter
- Context Profile rebuild

### E2E

Playwright 최소 범위.

- Capture 생성
- ThoughtUnit 생성
- Context 생성
- Candidate 실행
- Inspector 표시

---

## 18. Logging

Core 자체는 Logging하지 않는다.

Adapter가 Pino 사용.

필수 ID:

- requestId
- judgementRunId
- configVersion
- engineVersion

개인 기록 본문 전체를 일반 Log에 남기지 않는다.

---

## 19. Privacy

초기 Deployment는 Local First.

- localhost
- 개인 내부망

인증은 V1 범위 밖이지만 외부 공개 금지.

Private Dataset은 절대 Git Commit하지 않는다.

---

## 20. Codex 구현 규칙

우선순위:

```text
Correctness
>
Explainability
>
Testability
>
Simplicity
>
Performance
>
UI Polish
```

금지:

- Phase 선행 구현
- 미래 Service Stub 대량 생성
- AI Service 미리 만들기
- SplitAnalyzer 미리 만들기
- BlogService 미리 만들기
- Generic EAV
- Full Event Sourcing
- Microservice 분리
- ORM 타입 Core 노출
- Snapshot만으로 판단 로직 테스트

---

## 21. Phase 0+1 Definition of Done

Functional:

- Capture 등록
- ThoughtUnit 수동 생성
- Context 생성
- Membership 생성
- Relation 생성
- Context Profile 재생성
- Candidate Top N 조회
- Replay CLI
- Sample Gold Dataset
- Recall Metric

Quality:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

모두 성공.

Architecture:

`packages/core`에 Framework / ORM import 없음.

Experimental:

Sample Dataset Replay 결과를 README 또는 실행 결과에 명시.

---

## 22. Codex 최초 작업 지시

Codex는 이 계획서와 Architecture 문서를 먼저 읽는다.

첫 구현 범위:

```text
Phase 0 + Phase 1 only
```

추가 확인 질문 없이 합리적인 기본값을 선택한다.

단, ADR과 Architecture의 "금지" 규칙을 위반해서는 안 된다.

작업 완료 시 반드시 보고:

- 생성한 구조
- 주요 Architecture 결정
- Migration 목록
- 구현한 Domain
- Candidate Finder 방식
- Test 결과
- Replay 결과
- 아직 구현하지 않은 항목
- 다음 Phase

Candidate Finder가 기준을 만족하지 못하면 실패 사실과 원인을 숨기지 않는다.

다음 Phase를 임의로 구현해서 실패를 덮지 않는다.
