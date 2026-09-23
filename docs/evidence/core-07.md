# CORE-07 · 평가 데이터·라벨·메트릭·반례

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux CI 성공; 사용자 ACCEPTED 전.
- 선행: CORE-06 VERIFIED. 작업 기준 main `dab1faafe63178738a2e1274797efb598e55b308`.
- 기능 커밋: `d29d7fb296f246290f2b187a6012a964b0ca74da`; [GitHub Actions 실행](https://github.com/orot11955/ieum/actions/runs/35858084895) `completed success` (Linux).
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 사용자 자료는 읽거나 평가하지 않았다.

## 구현·계약

`datasets/sample/core-07-b0.json`에 서로 다른 목적의 40개 Context와 60개 질의를 합성으로 작성했다. 질의는 development 36개, validation 12개, holdout 12개이며 query origin family가 split을 넘지 않고 recordedAt 구간이 시간순으로 분리된다. `match`, `no_match`, `ambiguous`, `insufficient`를 구분하며 관련 Context가 둘인 질의와 미검토 pair를 포함한다. 이 크기와 구성은 평가 도구 검증용이고 실제 품질 표본이 아니다.

Lab의 `evaluate <dataset.json> [--out <directory>]`는 라벨·피드백 필드를 feature 입력 경계에서 거부하고, 각 질의의 Core snapshot을 합성 데이터만으로 만든다. B0 lexical observe 판단에서 검색 상위 K의 관련 맥락 Recall@K와 Hit@K, 검토된 제안 pair precision, query coverage, no-match false suggestion rate를 각각 분자·분모·값으로 반환한다. 분모가 0이면 값은 null(N/A)이다. split·slice별 결과와 실패 질의 ID를 별도로 남긴다. 기본 출력은 저장소 밖 `~/.local/share/ieum-lab/evaluations/`이며, 원본 데이터 사본과 metrics·failures·report·hash manifest를 새 디렉터리에 기록한다. 이 단계의 observe 모드는 제안이 없어서 제안 precision은 N/A다.

## 실제 합성 B0 실행

`node apps/lab-cli/dist/main.js evaluate datasets/sample/core-07-b0.json --out /tmp/ieum-core07-b0.zkWR87/run`은 exit 0이었다. 생성 경로는 임시 로컬 경로이며 공개 저장소에 private artifact를 체크인하지 않았다.

| 범위 | 관련 질의 | Recall@10 | Hit@10 | 제안 coverage | no-match 오제안 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 전체 합성 | 50 | 49/50 = 0.98 | 49/50 = 0.98 | 0/54 | 0/4 |
| development | 30 | 30/30 | 30/30 | 0/32 | 0/2 |
| validation | 10 | 10/10 | 10/10 | 0/11 | 0/1 |
| holdout | 10 | 9/10 | 9/10 | 0/11 | 0/1 |

실패 목록: `cycling-3`(holdout, `hard`/`cycling`)에서 `cycling-safety`를 Top10에 포함하지 못했다. 미검토 pair는 1개다. 제안 precision은 0/0으로 N/A다. Observe가 제안을 만들지 않으므로 제안 coverage 0과 오제안 0은 추천 품질을 입증하지 않는다. 이 합성 수치로 threshold를 선택하거나 실제 품질·full V1 성공을 주장하지 않는다.

## 실제 로컬 명령

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `npm run prep:check` | 0 | 시작 시 계획·디자인 검사 통과 |
| `pnpm --filter @ieum/lab-cli build`, `pnpm --filter @ieum/lab-cli test` | 각각 0 | Lab 17개. 40/60 데이터, multi-label Recall@1, 빈 분모, gold/미래 feedback 누수, origin·시간 split 충돌, CLI artifact를 포함 |
| `pnpm install --frozen-lockfile --offline` | 0 | 의존성 추가 없이 고정 lockfile 설치 상태 확인 |
| `pnpm test:unit` | 0 | Core 35개, contracts 3개, Lab 17개 통과 |
| `pnpm lint`, `pnpm format:check` | 모두 0 | 소스 lint·형식 검사 통과 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 경계·타입·빌드·smoke 검사 통과 |
| `git diff --check` | 0 | 공백 오류 없음 |

첫 Lab 타입 검사에서 검증된 pair status가 넓은 string으로 추론되어 TS2322, observe 상태를 `suggest`와 비교해 TS2367이 발생했다. pair status를 검증 뒤 좁은 타입으로 기록하고 B0의 제안 목록을 빈 배열로 명시한 뒤 typecheck와 테스트가 통과했다.

## 한계·데이터 영향

실제 허용 데이터, 독립 라벨러, 사용자 선택 시간·효용, 신뢰 구간, 활성 추천 정책은 아직 없다. 합성 holdout은 코드 회귀용이며 실제 최종 holdout을 대체하지 않는다. 파일 평가기는 단일 프로세스 실험 도구이고 제품 DB·HTTP·운영 자료를 변경하지 않았다. B0 품질 수치는 CORE-09/10의 비교 입력일 뿐 semantic 실험이나 수동 제품 개발의 차단 조건이 아니다.
