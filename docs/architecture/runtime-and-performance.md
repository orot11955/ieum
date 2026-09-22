> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# 런타임 · 성능 · 운영 경계

- 개정: 2026-09-22
- 상태: 스택 선택과 측정 계획. 아래 ms 수치는 실측값이 아니다.

## 1. 기술 선택과 도입 시점

| 구성 | 선택 | 도입 시점과 이유 |
| --- | --- | --- |
| Runtime | Node.js 24 LTS 계열 | M0; CLI와 서버의 같은 TS 코드 사용 |
| Language | TypeScript 6 계열, strict, ESM | M0; 버전은 최초 설치 시 호환성 확인 후 고정 |
| Workspace | pnpm workspace | M0; core와 CLI 정도로 시작 |
| Test | Vitest | M0; 순수 계산과 fixture 검증 |
| 데이터 | JSONL + immutable snapshot/artifact | M0/M1; DB 없이 가설 검증 |
| DB | PostgreSQL 18 | M3; revision, FK, unique, 승인 트랜잭션 |
| SQL 접근 | Drizzle + node-postgres | M3; Core 바깥 어댑터 |
| 검색 확장 | pg_trgm, 필요 시 pgvector | M3 이후; 먼저 exact reference와 비교 |
| HTTP | Fastify | M3; 승인 API가 필요할 때 |
| Lab UI | React + Vite | M3; 후보/근거/승인 inspector만 |
| 통합 검사 | Testcontainers, 필요한 E2E에 Playwright | DB/UI 도입 시 |

Node/TS/PostgreSQL 계열은 공식 문서를 확인한 설계 선택이다. 표는 모든 조합의 설치 검증 완료를 의미하지 않는다. React/Fastify/ORM의 구체 버전은 bootstrap 시 peer dependency와 테스트로 확인해 lockfile에 고정한다. `latest` tag를 재현 가능한 실험의 버전으로 사용하지 않는다.

공식 근거: [Node releases](https://nodejs.org/en/about/previous-releases) · [TypeScript 6](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) · [PostgreSQL 18](https://www.postgresql.org/docs/18/) · [Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/)

SQLite도 첫 단일 사용자 저장에 충분한 대안이다. 다만 운영 단계의 다중 제약·수정 트랜잭션·관계 조회와 선택적 vector 실험을 같은 저장소에서 수행하기 위해 PostgreSQL을 채택한다. 첫 Replay에 PostgreSQL을 강제하는 이유는 없다. Elasticsearch, 별도 vector DB, Neo4j, Redis queue는 기본 의존성이 아니다.

## 2. 임베딩 실험

첫 비교 후보는 `intfloat/multilingual-e5-small` 계열이다. 원 제작자 model card는 384차원, 최대 512 token, retrieval용 `query:`/`passage:` prefix 사용을 설명한다. 이것이 IEUM의 한국어 기록에서 최고 성능이라는 뜻은 아니다. [원 model card](https://huggingface.co/intfloat/multilingual-e5-small/raw/main/README.md)

M2는 artifact를 미리 생성해 읽는 adapter부터 구현한다. 선택적으로 Node의 Transformers.js/ONNX Runtime 경로를 시험할 수 있으나, 원 모델을 그대로 Node에서 로드할 수 있다고 가정하지 않는다. ONNX artifact, tokenizer, pooling, prefix, 양자화 설정의 호환성을 확인하고 reference 구현과 출력/순위 비교를 수행한다. [Transformers.js](https://huggingface.co/docs/transformers.js/en/index) · [Node ONNX backend](https://huggingface.co/docs/transformers.js/v3.8.1/en/api/backends/onnx)

모델 runtime은 Core 외부다. 변환 호환성 검증이 오래 걸리면 로컬 별도 runtime이 만든 고정 artifact로 실험을 계속할 수 있다. 생성형 모델을 embedding 모델 대신 사용하거나 수십 B 파라미터 모델의 생성 속도로 embedding latency를 추정하지 않는다.

Token 제한은 글자 수가 아니다. 초과 입력을 조용히 잘라내지 말고 token count, truncation/chunk 정책, 겹침 범위, 원문 mapping을 기록한다. query와 corpus가 같은 모델·tokenizer·정규화 규칙을 사용해야 한다. 모델 교체 시 기존 vector를 혼합하지 않는다.

Cache key에는 원문 revision hash, 모델 revision, tokenizer, prefix, pooling, dtype, feature 정책을 포함한다. 임베딩은 원본 파생 개인 데이터로 취급하여 공개 저장소에 넣지 않는다. 네트워크 provider는 사용자가 명시적으로 허용한 범위에서만 사용한다.

## 3. 계산량을 나눠 본다

입력 unit 수를 N, Context 수를 C, 후보 수를 K, embedding 차원을 d라 한다.

- score aggregation 자체는 feature 수가 고정되면 O(K)다.
- 모든 Context 벡터의 exact 비교는 O(Cd)다.
- 모든 member 벡터에서 exact 검색하면 O(Nd)다.
- Context 전체 pairwise clustering은 member 수 m에 대해 O(m²) 거리 계산이 필요할 수 있다.

따라서 `후보 32개 × evaluator 6개`가 작다는 사실만으로 전체 판단이 수 ms라고 말할 수 없다. embedding 생성, corpus 검색, profile 조회, 네트워크, queue, disk가 별도로 존재한다.

단순 크기 예시: N=10,000, d=384, float32인 vector payload는 `10,000×384×4=15,360,000 bytes`다. DB row, index, metadata, 모델 메모리는 포함하지 않았다. exact 비교에는 384만 개 차원 항의 계산이 필요하지만 이것을 특정 ms로 환산하지 않는다.

## 4. exact 먼저, ANN은 측정 후

초기에는 전수 검색을 기준 구현으로 둔다. pgvector는 exact/approximate 검색을 지원하며 ANN에서 필터가 적용되는 방식 때문에 충분한 후보를 얻지 못할 수 있다. HNSW를 켰다는 사실만으로 recall을 보장하지 않는다. [pgvector 공식 문서](https://github.com/pgvector/pgvector)

ANN 도입 시 exact Top-K 대비 검색 recall, 필터 적용 후 eligible 결과 수, 후보 정렬, 메모리와 build time을 함께 측정한다. ANN 수치와 의미 정답 recall은 다른 지표다. PostgreSQL 버전, extension 버전, index 옵션, planner/쿼리 계획을 남긴다.

Graph traversal은 최대 hop, 방문 수, timeout, query 수 예산을 갖는다. 과도한 query는 batched reads로 줄인다. evaluator 하나마다 별도 SQL을 보내는 N+1 구조를 금지한다.

## 5. 지연 측정의 경계

| Metric | 시작 → 끝 | 포함/제외 |
| --- | --- | --- |
| captureAck | 수신 → 원문 영속 저장 완료 | validation, 저장 I/O 포함; 모델 제외 |
| coreCompute | 준비된 snapshot 입력 → 점수/정책/설명 출력 | pure 계산만; embedding/DB/retrieval 제외 |
| retrieval | 검색 요청 → 후보·근거 snapshot 준비 | DB/검색/feature read 포함 |
| cachedSuggestion | query 요청 → 제안 결과 | queue·retrieval·core 포함; query vector cache hit |
| uncachedSuggestion | query 요청 → 의미 검색 포함 결과 | query embedding 생성과 실패 포함 |
| structureJob | queue 등록 → 변경안 완료 | queue, snapshot load, 분석 모두 |
| derivation | 요청 → 검토 가능한 evidence pack/초안 | 모델 사용 여부와 token 양 별도 |

p95 stage들을 더해서 전체 p95라고 보고하지 않는다. 전체 request histogram과 각 stage histogram을 둘 다 측정한다. timeout을 빠른 요청에서 제외해 평균을 좋게 만들지 않는다. 실패율·timeout율·취소율을 함께 보고한다.

## 6. 초기 latency budget

다음은 **개발 우선순위를 정하기 위한 잠정 예산**이다. 실측 예상치나 SLA가 아니다. 기준 workload는 unit 10,000개, Context 200개, K=32, warm process, 동시성 1이며 실제 hardware/모델/입력 길이를 run에 추가해야 한다.

| 경로 | 잠정 목표 | 미달 시 대응 |
| --- | --- | --- |
| captureAck | p95 150ms 이하 | 저장·검증과 모델 작업 분리 확인 |
| coreCompute | p95 20ms 이하 | 계산·할당·중복 작업 profiling |
| cachedSuggestion | p95 200ms 이하 | retrieval·I/O·queue를 먼저 분해 |
| 첫 lexical 후보 표시 | p95 300ms 이하 | semantic 기다리지 않는 점진 응답 검토 |
| uncached semantic 완료 | 아직 수치 확정하지 않음 | 모델별 cold/warm 측정 후 budget 설정 |
| Structure / generation | 별도 job budget | 입력 규모와 알고리즘별 측정; 전체 서비스 지연과 분리 |

기존 대화의 `5~15ms 전체 Core`, `embedding 5~50ms`, `LLM 1~4초` 등을 모든 입력·장비에 적용하지 않는다. 모델 load와 cache miss, 긴 한국어 입력, 동시 실행이 포함되면 조건이 달라진다.

## 7. Benchmark 절차

질 평가셋과 부하 평가셋을 분리한다. 합성 데이터를 복제해 N을 늘린 결과는 속도 테스트이지 의미 정확도 검증이 아니다.

규모는 예를 들어 `(units,contexts)=(500,40),(10,000,200),(100,000,2,000)`로 바꾸고 K, token 길이, 관계 밀도, 중복 비율을 기록한다. 데이터 생성 seed를 고정한다.

각 조건에서 warmup과 측정 구간을 분리하고 warm 요청은 충분한 반복(초기 예: 1,000회)을 수집한다. cold start는 독립 process 재시작 조건으로 별도 측정하며 표본이 적으면 p95를 안정적 추정치로 주장하지 않는다. 동시성 1/4/8을 비교하고 event-loop lag, RSS, CPU, DB query count, cache hit, provider queue를 남긴다.

보고서는 p50/p95/p99, 표본 수, 실패율, dataset/config/model/runtime/hardware manifest를 포함한다. p99에 필요한 꼬리 표본이 부족하면 그 한계를 표시한다. 한 번의 평균 측정만으로 목표 달성을 선언하지 않는다.

## 8. 재현성 수준

동일 저장 feature·후보 목록·snapshot·설정에서 pure score/policy 결과를 재생하는 것은 결정적으로 만든다. stable ID tie-break와 수치 처리 규칙을 고정한다.

모델을 다시 추론하거나 ANN index를 다시 만들 때 bit-identical 결과를 보장하지 않는다. 모델 artifact와 계산된 vector·후보를 보존하고 `decision replay`와 `retrieval/model rerun`을 구분한다. cluster 난수는 seeded PRNG를 사용할 수 있으며 seed를 저장한다. 단순한 Random 전면 금지만으로 재현성을 해결하지 않는다.

## 9. 운영과 개인정보

M0/M1은 단일 프로세스 로컬 CLI다. M3 HTTP 서버는 기본 loopback에 bind하며 LAN/공개 bind는 인증·권한 검토 없이 허용하지 않는다. 내부망이라는 이유로 인증이 필요 없다고 보지 않는다. 로컬 브라우저 접근도 origin 검증, 요청 인증/CSRF 방어와 안전한 렌더링을 고려한다.

모델/외부 source의 출력은 untrusted text다. Markdown/HTML 렌더링과 검색 highlight를 안전하게 처리한다. 임의 URL fetch, shell 명령 실행, credential 접근을 모델에 위임하지 않는다.

본문·source pack·vector·토큰은 일반 로그에 남기지 않는다. 로그에는 request/run ID, 단계, 오류 코드와 필요한 집계만 남긴다. private dataset, cache, benchmark 원문, export는 gitignore와 commit 전 검사를 모두 적용한다. 키는 환경변수 또는 로컬 비밀 저장소에 두고 fixture에 넣지 않는다.

추론 worker가 추가되면 bounded concurrency, 취소, idempotent job, retry 상한, revision freshness를 구현한다. 생성 모델이 routing이나 원문 저장 자원을 독점하지 않도록 분리한다. 별도 서버/브로커/분산 하네스는 실제 병목이 확인된 뒤 검토한다.
