> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# 후보 검색 · 점수 · 정책

- 개정: 2026-09-22
- 상태: 비교 실험용 알고리즘 계약. 가중치·임계값은 최적값으로 검증되지 않았다.

## 1. 문제를 네 단계로 나눈다

`후보를 놓치지 않기 → 후보 안에서 정렬하기 → 제안/보류하기 → 대표 맥락을 선택하기`는 서로 다른 문제다. 앞 단계의 누락을 뒤 단계의 가중치 조정으로 해결할 수 없다. 연결은 다중 라벨이며 primary만 단일 선택이다.

## 2. 텍스트 표현

원문, 검색용 정규화 텍스트, identifier/literal 토큰을 분리한다. 검색용으로만 NFKC, 영문 case-folding, 공백 정규화를 적용한다. 한국어 문자 2/3-gram과 영어 word/identifier 토큰을 lexical baseline으로 사용한다. `Intl.Segmenter`는 비교 가능한 보조 전략이지 한국어 형태소 분석기라고 가정하지 않는다. [Unicode text segmentation](https://unicode.org/reports/tr29/)

`사용한다/사용하지 않는다`, `C++/C#`, 버전 번호, 파일 경로, CLI 옵션을 무조건 같은 문자열로 뭉개지 않는 테스트가 필요하다. 부정문은 관련성은 높을 수 있지만 지지 관계는 다르다. normalize 결과로 원문 span을 계산하지 않는다.

Lexical baseline은 고정 snapshot에서 계산한 TF-IDF cosine으로 시작한다. IDF corpus에 query와 미래 자료를 넣지 않는다. 빈 벡터끼리의 cosine을 1로 처리하지 않는다. tokenization, IDF, 정규화, stopword 목록을 버전 관리한다.

DB 단계의 pg_trgm/FTS는 별도 retrieval adapter다. 앱의 문자 n-gram과 pg_trgm의 word padding·기호 제외 규칙이 동일하다고 가정하지 않는다. PostgreSQL 기본 `ts_rank`/`ts_rank_cd`를 BM25라고 이름 붙이지 않는다. [pg_trgm](https://www.postgresql.org/docs/18/pgtrgm.html) · [FTS ranking](https://www.postgresql.org/docs/18/textsearch-controls.html)

## 3. CandidateFinder

검색 범위는 권한, recordedAt, Context 상태로 먼저 확정한다. 기본은 제안 가능한 맥락이며, 보관 맥락을 포함한 재검색은 별도 옵션으로 노출한다. 필터로 제외된 맥락은 eligible set에 포함하지 않는다.

후보 source는 identity 검색, member 검색, 선택적 semantic 검색, 사용자 명시 관계, session, 최근 활동이다. recent/session만으로 내용을 이해했다고 판단하지 않는다. source별 결과를 합치되 출처와 원래 순위를 남긴다.

첫 후보 예산은 실험값 `K=32`로 두고 `16/32/64`를 비교한다. 예산은 제품 불변 상수가 아니다. 맥락 수가 작으면 전수 평가를 대조군으로 둔다. 명시적 사용자 지시는 추천 union에서 잘려 나가는 대상이 아니라 별도 검증 명령이다.

Identity 검색과 member 검색의 중복 결과를 단순히 두 배 증거로 세지 않는다. 하나의 원본 계열에서 수십 개 member가 나와 후보를 독점하지 않도록 origin별 중복 제거와 Context별 결과 제한을 둔다. 모든 source가 실패하면 `NO_CANDIDATES`와 실패 경로를 반환한다.

### 초기 비교군

| ID | 후보/정렬 방식 | 알아내려는 것 |
| --- | --- | --- |
| B0 | lexical만 | 단어·identifier로 충분한 범위 |
| B1 | embedding exact search만 | 바꿔 말하기와 한영 혼용의 개선 |
| B2 | lexical + semantic rank fusion | 두 표현의 보완 효과 |
| B3 | B2 + 제한된 관계/session 보조 | 메타데이터가 실제 추가 가치를 주는가 |

B0 성공을 B1 실행 조건으로 두지 않는다. B0를 측정하고 같은 snapshot/query에서 비교하는 것이 조건이다.

B2의 후보 통합은 raw cosine과 FTS 점수를 바로 더하는 대신 rank fusion으로 시작한다. 예시로 `RRF(c)=Σ 1/(k0+rank_s(c))`, rank는 1부터, 해당 source에 없으면 0이다. `k0=60`은 비교 실험 초기값일 뿐 정답이 아니다. source 가중치는 처음에는 같게 두고 동일 family 결과의 중복 가산을 제한한다. RRF는 순위 결합 도구이며 no-match 확률을 제공하지 않는다. [pgvector의 hybrid search 안내](https://github.com/pgvector/pgvector#hybrid-search)

## 4. Context 내용 신호

Identity는 name/purpose/scope의 선언적 설명이고 Corpus는 현재 승인된 member의 실제 내용이다. 두 신호는 서로 상관되어 있을 수 있다. 독립성이나 정답률을 가정하지 않는다.

각 modality에서 다음 두 값을 trace로 남긴다.

- identity similarity: query와 맥락 설명의 유사도.
- member support: 현재 query 계열을 제외한 서로 다른 원본의 상위 3개 member 유사도 평균. 3개 미만이면 가용 개수와 그 수를 기록한다.

초기 modality score는 두 값 중 가용한 최댓값으로 시작한다. 이는 이름이 아직 좁거나 설명이 부정확한 맥락도 찾기 위한 가설이다. outlier 하나의 과대 영향 여부를 `max` 대 `mean` ablation으로 검증한다. 상위 member 자체와 원문 발췌를 사용자에게 보여준다.

Embedding centroid는 다봉성 맥락을 지워 버릴 수 있으므로 첫 필수 신호로 쓰지 않는다. 대표 member와의 직접 비교를 먼저 사용한다. centroid/medoid/cache 최적화는 exact reference 대비 품질 저하를 측정한 뒤 추가한다.

## 5. 점수의 이름과 의미

| 값 | 의미 | 의미하지 않는 것 |
| --- | --- | --- |
| raw similarity | 특정 검색 표현의 거리/유사도 | 정답 확률 |
| rankScore | 설정 버전 내 후보 정렬 점수 | 다른 모델과 직접 비교 가능한 신뢰도 |
| contentScore | 내용 feature의 가중 기여 합 | 사실 확인 정도 |
| evidenceCoverage | 설정된 내용 feature 중 가용 비중 | 독립 근거의 양·정확성 |
| matchProbability | 라벨로 보정·검증된 적합 확률 추정 | 승인률·진실성 |
| primaryMargin | 대표 후보 1·2위 차이 | 다중 연결이 불가능하다는 증거 |

기존 `agreement`나 가중 분산은 진단 그래프에는 사용할 수 있으나 confidence 확률로 노출하지 않는다. 같은 단어를 본 두 evaluator가 함께 틀리는 경우를 막아 주지 못한다.

## 6. 비교용 scorer

순위 fusion과 제안 policy는 분리한다. 제안 policy를 비교할 때만 아래 단순 scorer를 사용한다. 여러 숫자를 늘리기 전에 이 baseline보다 나은지 확인한다.

내용 feature는 `L=lexical`, `E=semantic` 두 family로 시작한다. lexical은 0~1 cosine 범위를 사용한다. embedding raw cosine의 분포는 다르므로 별도의 monotonic transform `g(s)`를 개발 구간에서 정하고 hash를 남긴다. 예를 들어 `clip((s-lo)/(hi-lo),0,1)`을 사용할 수 있지만 lo/hi는 고정 개발 데이터에서 정해야 하며 이것도 확률 보정이 아니다. `hi<=lo`면 해당 설정을 거부한다.

```text
프로필              wL     wE
lexical-v0         1.0    0.0
semantic-v0        0.0    1.0
hybrid-v0          0.5    0.5

a_i = feature가 유효하게 측정되었으면 1, 아니면 0
coverage = Σ(w_i × a_i)
contentScore = Σ(w_i × a_i × transformedScore_i)
```

가중치 합은 1이며 음수/NaN을 허용하지 않는다. **후보마다 missing feature를 빼고 나머지 가중치를 재정규화하지 않는다.** `observedMean=contentScore/coverage`는 별도 진단값일 뿐 contentScore를 대체하지 않는다. coverage가 0이면 점수 null과 ABSTAIN을 반환한다. 낮은 coverage는 부적합의 증명이 아니라 판단 보류의 이유다.

실험용 보조 boost의 상한은 0.10이다. 한 초기 preset은 `0.05×graph + 0.03×session + 0.02×recency`이며, 기본 B0/B1/B2에서는 모두 0으로 끈다. 이 숫자는 기존 가중치를 대체하는 검증된 최적값이 아니라 ablation 대상이다.

`rankScore=clip(contentScore+boost,0,1)`로 계산하더라도 content gate 미달을 boost로 통과시킬 수 없다. Feedback 가중치는 초기 0이다.

### 계산 예시

L=0.90, E=0.70, 각각 w=0.5이면 contentScore=0.80, coverage=1이다. graph=0.8, session=0.6, recency=0.5인 위 preset의 boost는 0.068, rankScore는 0.868이다. **86.8% 정확하다는 뜻이 아니다.**

동일 후보에서 E가 missing이면 contentScore=0.45, coverage=0.5다. observedMean=0.90만 보고 강한 추천으로 승격하면 안 된다. 내용 feature가 전부 없고 recency만 높으면 ABSTAIN이다.

semantic provider 전체가 실패했을 때는 후보별 임의 재정규화 대신 실행 전체를 별도 `lexical-degraded` 프로필로 전환한다. fallback 사실과 다른 threshold 버전을 기록하고, 더 낮은 신뢰 수준의 후보로 표시한다.

## 7. 실제 가중치 선택 기준

처음부터 여섯 신호의 세부 소수점을 최적화하지 않는다. B0/B1/B2를 비교하고, hybrid에서 lexical 비중 `{0.25,0.5,0.75}` 정도의 제한된 후보만 개발 구간에서 시험한다. semantic transform과 후보 예산도 함께 버전 관리한다.

선택 기준은 평균 Top1보다 `Recall@K`, 제안 정밀도, 제안 coverage, 한국어/바꿔 말하기/no-match slice, 실제 사용자 선택 시간, p95 비용이다. 차이가 오차 범위에서 불분명하면 단순한 설정을 유지한다. 최종 holdout의 결과를 보고 가중치를 재선택하지 않는다.

같은 원본의 lexical/semantic 점수는 두 종류 표현이지 독립 관측 두 건이 아니다. confidence를 높이기 위해 중복 evaluator를 추가하지 않는다.

## 8. PolicyResolver

초기 설정은 `mode=observe`, suggestion thresholds는 null이다. 후보와 이유를 보여주고 직접 선택받는다. 이 상태에서도 정책의 보류 경계는 테스트한다.

`mode=suggest`는 validation에서 정한 다음 값을 함께 저장해야 한다: content floor, 최소 content coverage, suggestion score threshold, 허용 input/profile 상태, 최대 노출 개수, primary margin. 설정이 불완전하면 실행을 거부한다. 서로 다른 profile의 threshold를 공유하지 않는다.

정책 순서:

1. 입력·숫자·snapshot·접근 범위를 검증한다.
2. 내용 근거가 없거나 오류/결측 정책을 위반하면 ABSTAIN이다.
3. observe 모드이거나 threshold 미달이면 CANDIDATE다.
4. content floor와 coverage gate와 score threshold를 모두 통과한 후보만 SUGGEST다.
5. primary를 요청한 경우에만 유효 후보 간 margin을 확인한다. 후보가 하나뿐이라는 이유로 margin을 1로 만들지 않는다.

no-match, 새로운 맥락 필요, 입력 부족은 다른 상태다. 낮은 점수 하나로 새 Context를 자동 생성하지 않는다. 다중 후보가 모두 기준을 통과하면 모두 유효할 수 있다. UI 노출 제한으로 감춘 후보를 음성 라벨로 취급하지 않는다.

## 9. Graph / Session / Recency

Graph는 처음에 승인된 직접 관계만 사용한다. 확장 실험은 최대 2-hop, 방문 node 예산, cycle detection, 중복 origin 제거를 갖는다. type/direction별 의미를 확인하고 `RELATED_TO`를 무제한 전파하지 않는다. 큰 hub의 인기도를 맥락 적합성과 혼동하지 않는다.

Session은 사용자가 제공한 session ID와 당시 대화 이력으로만 구성한다. 짧은 지시어를 이해하는 데 도움은 되지만 주제 전환을 덮어쓰는 강제 규칙이 아니다. 현재 query를 이용해 과거 session label을 수정하지 않는다.

시간 신호의 예시는 `exp(-Δt/τ)`이며 τ는 config에 둔다. Δt는 음수를 허용하지 않는다. 활동 시각은 실제 사용자 활동 기준이며 자동 profile 재생성이나 시스템 추천 때문에 갱신하지 않는다. session과 recency가 같은 활동을 중복 반영할 수 있으므로 둘의 boost 총량을 제한한다.

## 10. Feedback과 학습

`exposure`, `accept`, `reject_relevance`, `change_primary`, `dismiss`, `no_response`를 분리한다. CORRECT를 무조건 `이전 Context 음성 + 새 Context 양성`으로 변환하지 않는다. 실제로 관련 없다고 명시한 대상만 음성이고, primary만 바꾼 경우 기존 secondary 적합성은 unknown이다.

초기에는 feedback을 저장만 한다. 나중에 Beta prior를 사용한 `(accept+α)/(accept+reject+α+β)`를 계산하더라도 그것은 특정 노출 조건의 수락 빈도 추정이다. 의미 적합성 확률이 아니며 같은 대화/반복 클릭을 독립 표본처럼 세지 않는다. 표본 수 `n/(n+k)`도 정확성 보증이 아니다.

학습은 명시적으로 검토한 query-context pair와 missing mask, source, 후보 노출 조건을 사용한다. L2 정규화 logistic regression 같은 작은 모델부터 비교할 수 있다. train/validation/test 시점과 group을 분리하고, 보정 데이터는 모델 fitting 데이터와 구분한다. 추천된 pair만 학습하는 선택 편향과 unseen context의 cold start를 별도 보고한다.

확률을 노출하려면 reliability diagram, Brier score와 판별 성능, 표본 수를 함께 검토한다. Brier 하나만 좋아졌다고 calibration 개선으로 결론 내리지 않는다. [Calibration 공식 문서](https://scikit-learn.org/stable/modules/calibration.html) · [Guo et al., 2017](https://arxiv.org/abs/1706.04599)

## 11. 실패 코드와 필수 테스트

주요 reason code: `NO_CONTENT_EVIDENCE`, `LOW_COVERAGE`, `NO_CANDIDATES`, `INSUFFICIENT_INPUT`, `STALE_PROFILE`, `PROVIDER_TIMEOUT`, `INVALID_SCORE`, `PRIMARY_AMBIGUOUS`, `EXPLICIT_USER_COMMAND`.

빈 입력, 모두 missing, measured zero, NaN/Infinity, 같은 점수, 단일 후보, 둘 다 유효한 맥락, 부정문, 오랜 맥락, 거대 hub, 원본 중복, 자기 자신 누수, provider fallback, primary 변경 피드백을 table-driven test로 고정한다. 메트릭 정의와 평가 분할은 [Core Lab 계획](../plan/02-core-plan.md)을 따른다.
