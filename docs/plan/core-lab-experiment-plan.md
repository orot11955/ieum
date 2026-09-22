# Core Lab · 실험 및 구현 계획

- 개정: 2026-09-22
- 상태: 구현 전 계획. 이 문서의 명령과 산출물은 아직 존재하지 않는다.
- 처음 읽기: [제품 목적](../product/vision-and-scope.md) · [Core 구조](../architecture/judgement-core.md)

## 1. 검증할 가설

| 가설 | 비교 | 실패했을 때 |
| --- | --- | --- |
| H1: 관련 맥락을 다시 찾을 수 있다 | lexical / semantic / hybrid / 전수 대조 | 후보 누락·언어 표현·scope를 분해 |
| H2: 불확실할 때 보류할 수 있다 | precision–coverage, no-match 오제안 | 임계값·데이터·점수 정의 수정 |
| H3: 사용자 수고가 줄어든다 | 직접 검색 vs 후보·근거 활용 | 노출 빈도·흐름·제품 가설 재검토 |
| H4: 근거를 잃지 않고 정리할 수 있다 | 수동 정리 vs source pack | provenance·자료 선택·정제 흐름 수정 |

H1만 통과했다고 전체 제품이 검증된 것은 아니다. H1의 lexical baseline 실패만으로 의미 검색을 금지하거나 전체 프로젝트를 실패로 판단하지 않는다.

## 2. 단계와 투자 경계

### M0 — 평가 계약과 최소 저장소

구현: pnpm workspace, strict TS/ESM, `packages/core`, `apps/lab-cli`, fixture/config/report 디렉터리, Vitest, JSONL schema 검증, ID/revision/source span 계약.

다음 구조만 출발점으로 사용한다. 미래 API·DB·UI package는 아직 만들지 않는다.

```text
apps/lab-cli/
packages/core/
configs/experiments/
datasets/sample/
docs/
```

private 데이터와 결과물은 저장소 밖의 경로를 기본으로 사용한다. 저장소 내부 `datasets/private`, `artifacts/private`, `.cache`, `.env`를 쓰게 되면 gitignore와 검사 규칙을 함께 만든다.

완료 조건: 빈/잘못된 입력, revision 부재, span 불일치, 미래 자료 포함, 중복 origin을 검출하는 테스트. 실행 코드가 없는 현재 문서를 테스트 통과 결과로 취급하지 않는다.

### M1 — 모델 없는 작은 수직 흐름

구현: lexical features, Context identity/member 검색, 후보 union, 단순 scorer, observe/abstain 정책, explain trace, 파일 Replay, 수동 선택/피드백 기록, 선택한 기록의 evidence pack Markdown 출력.

파일 상태는 입력 fixture를 덮어쓰지 않고 run별 새 snapshot/artifact로 출력한다. 단일 프로세스 모드의 원자적 파일 교체와 command ID를 사용하고 DB 수준의 동시성 보장을 주장하지 않는다. evidence pack은 템플릿으로 작성하며 새로운 사실을 생성하지 않는다.

JSONL의 명시적 선택과 피드백은 이력으로 남기되 가중치를 자동 학습하지 않는다. primary 변경과 관련성 거절을 구분한다.

완료 조건: 데이터 준비에서 후보와 근거 확인, 수동 선택, source pack까지 CLI로 한 번 수행 가능. 실험 manifest와 실패 사례 출력. 기본 observe 모드에서 사용자가 직접 선택하는 것을 자동 추천 성공으로 집계하지 않는다.

### M2 — 의미 검색과 hybrid 비교

조건: M1 baseline의 결과가 기록되어 있어야 한다. 특정 정확도 통과는 조건이 아니다.

구현: 고정 embedding artifact reader, 모델/prefix/tokenizer 검증, exact vector retrieval, B1/B2/B3 비교, score transform/config 버전, fallback trace. live embedding adapter는 필요할 때만 구현한다. 생성형 LLM은 필수 의존성이 아니다.

완료 조건: 같은 입력·시점·eligible Context에서 비교 결과, 한국어/바꿔 말하기/부정/identifier/no-match slice, 품질–비용 차이를 보고한다. 모델이 실패하면 원문과 lexical 흐름이 유지되어야 한다.

### M3 — 영속 저장과 실제 승인 흐름

조건: 후보·근거가 사용자에게 도움이 된다는 실험 근거 또는 명시적인 제품화 결정.

구현: PostgreSQL/Drizzle migration, revision/unique/FK, 승인·취소 트랜잭션, 최소 Fastify API, 필요 시 React/Vite inspector. profile invalidation, stale Proposal, idempotency, privacy/logging 검사.

UI는 Capture, 후보/근거, 승인/거절/primary 변경, Context의 목적과 member 확인으로 제한한다. DB 도입 시 Testcontainers, UI 도입 시 필요한 Playwright 검사를 추가한다. 달력·블로그 편집기는 만들지 않는다.

### M4 — 구조·파생의 제한된 실험

구현: 작은 dirty Context의 구조 진단과 변경 미리보기, bridge member, 병합/분리 역변경, ArtifactRevision과 claim map. 먼저 하나의 source pack을 실제 정리본으로 만드는 흐름을 완성한다.

생성 모델 도입은 출처 검증과 수동 정리 기준선 이후 선택 사항이다. 자동 Split/Merge, 자동 공개 발행, 범용 지식 그래프는 범위 밖이다.

## 3. 평가 데이터 계약

feature 입력과 gold label 파일을 분리한다. runner는 입력 schema에서 gold 필드를 거부한다. 정답 파일을 ContextProfile builder에 넘기지 않는다.

예시 query와 label은 다음과 같다. 내용과 ID는 합성 예시다.

```json
{
  "queryId": "q-001",
  "unitId": "u-101",
  "unitRevision": 1,
  "asOfRecordedAt": "2026-01-15T09:00:00Z",
  "groupId": "source-family-17",
  "eligibleContextIds": ["ctx-a", "ctx-b", "ctx-c"]
}
```

```json
{
  "queryId": "q-001",
  "labelStatus": "match",
  "relevantContextIds": ["ctx-a", "ctx-b"],
  "irrelevantContextIds": ["ctx-c"],
  "primaryLabel": {"status": "no_preference", "contextId": null},
  "rationale": "두 맥락에서 모두 활용 가능",
  "labelRevision": 1
}
```

`labelStatus`는 match/no_match/insufficient/ambiguous를 구분한다. 검토하지 않은 pair는 unknown이며 음성으로 채우지 않는다. no_match는 해당 eligible set을 검토하여 적합 맥락이 없다고 확인한 경우만 사용한다. primaryLabel은 selected/no_preference/unreviewed로 나누며 selected일 때만 단일 ID가 있다.

라벨에는 사용자가 판단한 기준과 당시 조회 가능한 Context를 남긴다. 반복 평가 시 라벨이 바뀌면 임의로 예측에 맞추지 말고 변경 이유와 revision을 기록한다. 맥락의 경계 자체가 모호하면 ambiguous로 유지한다.

## 4. fixture와 실제 데이터

합성 fixture는 계약과 실패 상황을 검증한다. 초기 비자명한 검색 fixture는 Context 40개 이상, query 60개 이상을 목표로 만들고 다중 관련/no-match/어휘가 다른 유사 문장/주제 전환을 포함한다. 이름만 다른 Context를 기계적으로 늘려 난이도를 가장하지 않는다.

실제 검증은 사용자가 사용을 허용한 기록 100~300개로 탐색하고 더 넓은 기간으로 확장한다. 합성 예제를 실제 승인률·성능으로 보고하지 않는다. 현재 문서 재작성 작업에서는 실제 기록을 가져오거나 평가하지 않았다.

필수 slice: 한국어 조사·띄어쓰기, 한영 혼용, 동의적 재서술, 같은 단어지만 다른 목적, 부정/반론, 매우 짧은 지시어, 장문/복합 주제, 다중 소속, cold Context, 오래된 맥락, no-match, 중복 원본, 구조 변화.

Context 수 C가 K 이하이면 Recall@K는 탐색 성공 gate로 쓰지 않는다. 실제 개인 Context가 적으면 K를 줄이고 C/K와 전수·무작위 참고선을 보고한다. 사용하지 않는 가짜 맥락을 실제 데이터에 추가해 지표를 조작하지 않는다.

## 5. 시점·그룹 분할과 누수 방지

최초 비교는 시간순 development/validation/final holdout으로 나눈다. 예시 비율 60/20/20은 시작점이며 데이터 수와 group 크기에 따라 조정하고 실제 건수를 공개한다. threshold와 score transform은 development/validation에서만 정한다. 학습 모델의 확률 보정이 필요하면 fitting과 별도의 calibration 구간 또는 적절한 교차 검증을 사용한다.

동일 대화·원본·근접 복제·그 파생물은 같은 group으로 관리한다. 경계를 걸친 group은 뒤쪽 평가에서 purge하거나 별도의 recurrence slice로 분리한다. 미래 group member를 과거 training 구간에 옮겨 넣어 시간 분리를 깨뜨리지 않는다.

각 query의 profile, relation, membership, IDF, session, feedback은 당시 recordedAt까지의 정보만 사용한다. query 자체와 같은 원본의 파생물을 검색 근거에서 제외한다. 자기 자신이 포함된 설정은 누수 테스트가 실패해야 한다.

독립 offline 평가에서는 현재 query의 gold 정답을 profile에 적용하지 않는다. 역사적 온라인 Replay에서 이전 사용자 승인이 다음 query에 반영되는 것은 허용할 수 있으나, 실제로 그 시점에 관측된 승인만 사용하고 별도 프로토콜로 표시한다. 최종 상태의 전체 Context를 과거 query 모두에 재사용하지 않는다.

## 6. 메트릭 정의

query q의 검토된 관련 집합을 Gq, 검색 상위 K 집합을 CqK, 제안 집합을 Pq라 한다.

| 지표 | 정의·분모 |
| --- | --- |
| Candidate Recall@K | Gq가 비지 않은 query의 `|Gq∩CqK|/|Gq|` macro 평균 |
| Hit@K | 위 query 중 상위 K에 정답이 하나 이상 있는 비율 |
| Primary accuracy / MRR | 단일 primary가 명시 라벨된 query에서만 계산 |
| Suggestion precision | 제안한 pair 중 검토된 pair의 적합 비율; unknown 수 별도 |
| Suggestion coverage | 평가 가능한 전체 query 중 제안이 하나 이상인 query 비율 |
| No-match false suggestion rate | no_match query 중 제안이 하나 이상인 비율 |
| Abstention rate | 전체 query 중 ABSTAIN 비율, 이유별 집계 |
| Human correction rate | 노출된 추천 중 명시 수정된 비율; 관련성/primary 구분 |
| Acceptance rate | 노출·응답 조건을 명시한 행동 지표; 정답률 아님 |
| Evidence validity | 존재하는 revision/span 참조 비율; 사실 정확성과 별도 |

Hit@3와 다중 라벨 Recall@3를 둘 다 `Top3 accuracy`라고 부르지 않는다. 제안이 0건이면 precision은 N/A이지 100%가 아니다. 모든 eligible pair를 검토하지 못했다면 판단된 subset과 미검토 비율을 표시한다.

정밀도만 보고하지 않고 precision–coverage를 함께 그린다. 보류를 포함한 selective prediction의 기본 trade-off는 [Geifman & El-Yaniv, 2017](https://arxiv.org/abs/1705.08500)을 참고하되, 그 논문의 성능이나 보증을 IEUM에 그대로 적용하지 않는다.

## 7. 잠정 의사결정 gate

다음 값은 성공 실적이 아니라 validation 전에 선언할 실험 목표다. 데이터가 작으면 건수와 불확실성을 보고하고 통과를 확정하지 않는다.

- 의미 있는 C/K 조건에서 Candidate Recall@10 0.90 이상을 우선 목표로 한다. C가 작으면 더 작은 K와 전수 대비 이득을 사용한다.
- suggest 모드를 켤 때 검토된 suggestion pair precision 0.90 이상과 query coverage 0.30 이상을 함께 목표로 한다. no-match false suggestion rate는 0.10 이하를 목표로 한다.
- 작은 데이터에서 위 수치 미달은 곧 제품 실패가 아니다. baseline 대비 차이와 실패 slice를 보고 retrieval/정책을 수정한다. B0 미달 상태에서도 M2를 진행할 수 있다.
- 강한 추천 모드는 초기 범위 밖이다. 후속 검토 시 최소 50개 검토된 제안, 정밀도 점추정 0.95 이상, Wilson 95% 하한 0.85 이상과 유의미한 coverage를 참고 조건으로 삼을 수 있다. group 의존성이 있으면 group bootstrap 등으로 한계를 추가 보고한다.

성능 개선 비교는 query가 아니라 원본/대화 group 단위의 paired bootstrap 등을 사용하고, 작은 표본의 구간을 보장처럼 해석하지 않는다. threshold를 test에 맞춘 뒤 같은 test를 최종 검증이라고 부르지 않는다.

사용자 효용은 직접 검색/수동 정리와 후보/근거 활용을 비교한다. 예를 들어 서로 유사한 난도의 20개 이상 과제에서 순서를 번갈아 배치하고 선택 시간, 정리 시간, 수정량, 체감 부담을 기록한다. 같은 문제를 연속 수행한 기억 효과를 개선 효과로 오인하지 않는다. 개인 실험 결과를 일반 사용자 전체로 일반화하지 않는다.

## 8. 재현성과 보고서

계획된 CLI 계약:

```bash
pnpm lab replay --dataset <path> --config <path> --out <run-dir>
pnpm lab compare --runs <run-a> <run-b> --out <comparison-dir>
pnpm lab inspect --run <run-dir> --query <query-id>
pnpm lab evidence-pack --snapshot <path> --units <ids> --out <file>
```

구현 전이므로 현재 실행 가능한 명령으로 소개하지 않는다. M1에서 구현한 명령만 README의 실행 안내에 추가한다.

run 산출물은 `manifest.json`, `metrics.json`, `judgements.jsonl`, `failures.jsonl`, `report.md`를 기본으로 한다. 입력 원문이 필요한 private trace와 공유 가능한 집계 보고서를 분리한다. engine commit, config/input/snapshot hash, runtime, seed, candidate 결과, profile/model/transform 버전, fallback, latency 범위를 manifest에 남긴다.

같은 저장 feature에서 decision replay는 동일 결과여야 한다. 모델 재추론/ANN 재생성은 별도 rerun으로 평가한다. 순위 동점 처리와 허용 수치 오차를 선언한다.

## 9. 필수 반례 테스트

- 2개 맥락이 모두 정답이고 점수가 비슷해도 attachment를 막지 않는다.
- 내용 근거 없이 recency만 높으면 ABSTAIN이다.
- missing과 measured zero를 구분하고 NaN/Infinity/분모 0을 거부한다.
- primary만 바꾸면 이전 secondary를 음성으로 기록하지 않는다.
- 같은 원본의 복제와 현재 query를 profile에 넣으면 누수 검사에 걸린다.
- 미래에 생성한 Context/relation/feedback은 과거 snapshot에서 조회되지 않는다.
- 무관한 후보 추가만으로 기존 absolute score가 부풀지 않는다. query별 min-max를 확률/절대 적합성처럼 사용하지 않는다.
- 같은 snapshot의 반복 구조 분석은 독립 증거 수를 증가시키지 않는다.
- stale Proposal, 중복 승인, 동시에 primary 변경, Undo 충돌을 단계에 맞게 검사한다.
- source span 불일치, 없는 source ID, 편집 후 stale claim map을 검출한다.

## 10. Codex 최초 작업 지시

이 절을 최초 구현 범위로 사용한다.

> README, AGENTS, 제품 목적, Core 구조, 도메인, retrieval/scoring, 이 계획서를 읽고 M0+M1만 구현하라. baseline은 lexical이고 mode는 observe다. Core에 DB/네트워크/모델 의존성을 넣지 말고, 파일 입력과 CLI로 capture revision → 후보·근거 → 수동 선택 이력 → evidence pack을 완성하라. 합성 fixture는 계약 검증용으로 표시하고 실제 사용자 품질을 주장하지 말라. 지원하지 않는 단계의 package/stub를 미리 만들지 말라. 가중치와 threshold를 하드코딩한 정답처럼 취급하지 말고 config hash를 남겨라. 실패 사례를 숨기지 말고 baseline을 측정한 다음 M2에서 시험할 가설을 보고하라.

M0/M1 완료 시 실제 구현한 lint/typecheck/test/build/replay 명령과 결과를 보고한다. DB가 없으므로 DB integration test를 성공했다고 쓰지 않는다. M3부터 migration/제약/트랜잭션 검사와 필요한 UI E2E를 추가한다.

## 11. 완료의 의미

문서 작성 완료, fixture 테스트 통과, 실제 품질 검증, 성능 목표 달성, 사용자 효용 확인은 서로 다른 상태다. 어느 상태인지 결과마다 명시한다. 이음의 다음 단계는 문서의 양이 아니라 가장 큰 불확실성을 줄인 실험 결과로 결정한다.
