# CORE-09 · 고정 embedding과 exact semantic 검색

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux CI 성공; 사용자 ACCEPTED 전.
- 선행: CORE-07 VERIFIED. 작업 기준 main `bd94e33`.
- 기능 커밋: `fbc1823`; [GitHub Actions 실행](https://github.com/orot11955/ieum/actions/runs/35860749821) `completed success` (Linux).
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 사용자 embedding이나 live provider를 사용하지 않았다.

## 구현·계약

Core의 `rankSemanticSnapshot`은 이미 권한·시점 범위가 정해진 snapshot의 query/Context identity/Unit 벡터를 받아 전수 cosine을 계산한다. 벡터 차원·finite 값·zero vector·중복·누락·scope 밖 항목을 거부한다. Context마다 identity와 member의 최고 유사도를 분리해 보존하고 안정적인 ID 동점 순서로 정렬한다. 유사도는 확률이나 의미 일치 보증이 아니다. Core에는 모델 SDK·파일·네트워크 접근이 없다.

Lab의 embedding artifact reader는 모델 ID/revision, 차원, tokenizer, query/passage prefix, pooling, precision에서 계산한 namespace를 확인한다. query/identity/Unit마다 원문 text hash와 revision을 검증한 뒤 snapshot에 필요한 벡터만 Core에 넘긴다. 다른 모델 메타데이터로 namespace만 재사용하면 실패한다. artifact 파일이 없거나 일부 벡터가 누락되면 실패를 드러내며 0 점수로 대체하지 않는다. `semantic <snapshot.json> <artifact.json>`은 한 snapshot을 검색하고 `compare-semantic <dataset.json> <artifact.json> [--out <directory>]`은 같은 eligible snapshot의 B0/B1 Top10 품질·분할·slice·실패 목록과 단일 프로세스 시간/heap 변화량을 private 경로에 기록한다. 두 모드 모두 observe이며 추천하지 않는다.

공개 fixture `datasets/sample/core-09-synthetic-embeddings.json`은 `scripts/experiments/generate-synthetic-embeddings.mjs`로 40개 Context의 identity/member와 60개 query 텍스트만 사용해 만든 32차원 **합성 토큰 해시 투영** 140개다. gold/review는 벡터 계산에 사용하지 않는다. 이 투영은 실제 다국어 semantic 모델이 아니다. 실제 모델의 revision/공간을 고정해 별도 artifact로 공급해야 품질 실험을 할 수 있다.

## 실제 합성 비교

`node apps/lab-cli/dist/main.js compare-semantic datasets/sample/core-07-b0.json datasets/sample/core-09-synthetic-embeddings.json --out /tmp/ieum-core09-synthetic-compare-2`는 exit 0이었다. artifact SHA-256은 `c85e4272477f8661a088cfb5ff8664a549458199d3f76007be744efb6ab4ce65`이다.

| 합성 40 Context/60 query, K=10 | B0 lexical | B1 합성 고정 벡터 |
| --- | ---: | ---: |
| Recall@10, 관련 질의 | 49/50 = 0.98 | 37/50 = 0.74 |
| Hit@10, 관련 질의 | 49/50 = 0.98 | 40/50 = 0.80 |
| 실패 질의 | 1 | 16 |
| holdout Recall@10 | 9/10 = 0.90 | 8.5/10 = 0.85 |
| 단일 프로세스 전체 실행 시간 | 235.9ms | 38.9ms |
| 프로세스 heap 변화량 | +3,554,256 bytes | +2,956,264 bytes |

시간에는 각 snapshot 생성과 B1 artifact 로딩이 포함된다. 실행 순서는 B0 뒤 B1이고 heap 변화량은 peak memory가 아니다. 따라서 이 한 번의 측정으로 제품 지연·메모리 우위를 주장하지 않는다. B1 결과는 합성 투영에서 B0보다 낮으며 활성 추천 정책의 근거가 아니다. 두 모드 모두 제안 0건이라 검토된 pair precision은 0/0=N/A다. 수동 벡터 반례는 한영 재서술이 높은 cosine으로 잡힐 수 있음을, C++ 식별자 반례는 B1이 lexical hit를 잃을 수 있음을 확인한다. 실제 모델 품질과 사용자 효용은 미측정이다.

## 실제 로컬 명령·반례

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `node scripts/experiments/generate-synthetic-embeddings.mjs` | 0 | 라벨을 쓰지 않고 합성 벡터 140개 생성 |
| `pnpm test:unit` | 0 | Core 39개, contracts 3개, Lab 21개. 차원/공간/zero/누락/원문 변경/provider 파일 없음/한영 수동 벡터/C++ 회귀/합성 60개 비교 포함 |
| `pnpm lint`, `pnpm format:check` | 모두 0 | 소스 lint·형식 검사 통과 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 경계·타입·빌드·smoke 통과 |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획·디자인·공백 검사 통과 |

첫 Lab 테스트는 차원 오류에 대한 구체적 메시지를 기대했지만 reader가 zero/차원 오류를 같은 메시지로 반환해 실패했다. reader의 오류를 분리한 뒤 재실행한 테스트가 통과했다. 제품 DB/HTTP/worker·실제 사용자 자료는 변경하지 않았다.
