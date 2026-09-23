# CORE-10 · hybrid 결합·정책 보정·추천 게이트

- 상태: **IMPLEMENTED**. 로컬 검증 완료, 원격 Linux CI 대기; 사용자 ACCEPTED 전.
- 선행: CORE-05·CORE-09 VERIFIED. 작업 기준 main `f9884e2`.
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 사용자 자료나 live provider를 사용하지 않았다.

## 구현·계약

Core의 `fuseRankings`는 같은 eligible snapshot의 lexical·semantic 후보를 RRF(k0=60)로 결합한다. RRF는 순위 전용 수치이며 절대 신뢰도나 적합 확률로 표시하지 않는다. Semantic source가 전면 실패하거나 artifact가 일부라도 누락되면 **run 전체**를 `lexical-degraded-v0`로 전환하고 오류 코드를 남긴다. 부분 semantic 결과를 후보별로 섞지 않는다. 추가한 무관 후보가 기존 후보의 RRF 수치를 올리지 않는 반례와 동일 Unit이 두 Context에 속한 반례를 검사했다.

`rerankFusionWithAuxiliary`는 B2 후보에 제한된 graph(최대 0.05)·session(최대 0.03) 신호를 적용하는 **B3 순위 전용 실험**이다. 두 신호가 모두 없으면 값을 0으로 쓰되 누락을 별도 artifact 상태로 보고한다. 보조 신호는 내용 점수나 제안 허용 근거가 아니다. Lab의 auxiliary artifact는 dataset hash, query/context ID, 고유 evidence ID, query보다 이른 기록 시점, 숫자 범위를 확인한다. 테스트용 2개 신호는 실제 그래프나 사용자 세션이 아닌 합성 예시다.

제안 정책은 기존 `observe-v1`과 분리한 `selectValidationThresholds`/`assessSuggestionActivation`/`resolveSuggestionCandidates` 계약이다. content floor, 내용 coverage, rankScore threshold를 **validation 행만** 사용해 제한된 grid에서 선택하며 holdout 입력은 거부한다. 선택 설정의 hash와 validation 보고서의 hash·dataset hash·feature artifact hash·profile ID를 맞춘다. 허용된 실제 자료, 충분한 검토 pair/no-match query와 독립 origin family 20개 이상, pilot 품질 목표가 모두 충족될 때만 제안 후보를 반환한다. 내용 근거가 낮거나 결측인 후보는 높은 rank만으로 승격하지 않는다. primary 선택·자동 변경·확률 출력은 없다. 이 Core 함수의 보고서 출처 인증은 후속 제품 경계가 담당하며, Lab의 `authorized_private` 문자열만으로 제품 추천 모드를 켜지 않는다.

Lab `compare-hybrid <dataset.json> <embedding.json> [--aux <auxiliary.json>] [--out <directory>]`는 B2/B3의 split·slice·분모·실패 목록, validation 임계값 선택 결과, 제안 게이트 및 fallback profile을 저장소 밖 private 디렉터리에 기록한다. B0/B1 수치와 비교할 수 있도록 같은 CORE-07 dataset/snapshot을 사용한다. Lexical 내용 feature는 기존 origin별 중복 제거·상위 member 집계를 재사용하고, semantic cosine은 고정 `(s+1)/2` 단조 변환으로만 비교한다. 이것은 확률 보정이 아니다.

## 실제 합성 비교

`node apps/lab-cli/dist/main.js compare-hybrid datasets/sample/core-07-b0.json datasets/sample/core-09-synthetic-embeddings.json --aux datasets/sample/core-10-synthetic-auxiliary.json --out /tmp/ieum-core10-b2-b3-compare`는 exit 0이었다. 40 Context/60 query, K=10의 **합성** 결과다.

| 지표 | B0 lexical | B1 합성 벡터 | B2 RRF | B3 합성 보조 신호 |
| --- | ---: | ---: | ---: | ---: |
| Recall@10, 관련 질의 | 49/50 = 0.98 | 37/50 = 0.74 | 47.5/50 = 0.95 | 47.5/50 = 0.95 |
| Hit@10, 관련 질의 | 49/50 = 0.98 | 40/50 = 0.80 | 48/50 = 0.96 | 48/50 = 0.96 |
| 실패 질의 | 1 | 16 | 3 | 3 |

B3는 시점이 앞선 합성 신호 두 개를 사용했지만 Top10 지표에 변화가 없다. 이 수치로 graph/session 효용을 주장하지 않는다. B2/B3의 제안은 0건이며 reviewed-pair precision은 0/0=N/A다. Validation에서는 pilot 목표를 충족하는 설정이 선택되지 않아 `NO_VALIDATED_CONFIG`, `mode=observe`다. 실제 사용자 적합성·정책 효용은 미측정이다.

Embedding 파일이 없는 별도 실행 `compare-hybrid datasets/sample/core-07-b0.json /tmp/ieum-missing-embedding-artifact.json --out /tmp/ieum-core10-degraded-compare`도 exit 0이었고 run 전체가 `lexical-degraded-v0`, `mode=observe`로 기록됐다. 누락·오류 원인은 silent 0점으로 바뀌지 않는다.

## 실제 로컬 명령·반례

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `node scripts/experiments/generate-synthetic-auxiliary.mjs` | 0 | 정답 라벨을 사용하지 않은 합성 보조 신호 2개 생성 |
| `pnpm test:unit` | 0 | Core 49개, contracts 3개, Lab 25개. RRF·동점·무관 후보, 전체 fallback, 중복 소속, content gate, 보고서/hash·표본·holdout, 한국어/부정/no-match slice, B2/B3·CLI·시점 누수 반례 포함 |
| `pnpm lint`, `pnpm format:check` | 모두 0 | 소스 lint·형식 검사 통과 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 경계·타입·빌드·smoke 통과 |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획·디자인·공백 검사 통과 |

시험은 합성 ranking과 정책 계약에 한정된다. 실제 모델·관계·세션 신호의 출처 적합성, 제품 권한 경계, 사용자 선택 시간, 추천 precision 목표는 검증하지 않았다. 실제 데이터·DB·HTTP·운영 설정을 변경하지 않았다.
