# CORE-04 · 후보 검색·원본별 중복 제거·예산

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux CI가 통과했다.
- 선행: CORE-03 VERIFIED. 작업 기준 main `bfc4a49b93946bbea1fa43a628868869b75ae1f7`.
- 기능 커밋: `05f74311567610dc455dffa98d24dfb2a8339328`.
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 테스트 입력은 합성 fixture이며 사용자 자료가 아니다.

## 구현·계약

Core의 `retrieveCandidates`는 이미 시점·범위가 검증된 snapshot과 identity/member 검색 source 결과를 받는다. 각 hit의 맥락·member revision·origin·rank·cosine을 검증하고 source 오류를 안정적인 코드로 보고한다. Lab의 `findExactLexicalSources`는 고정 snapshot의 모든 허용 맥락 이름과 member를 순수 lexical 계산으로 전수 스캔하고, 양수 유사도 hit를 각 source에서 정렬해 전달한다. DB 검색이나 실제 권한 판정은 수행하지 않는다.

동일 맥락의 identity/member hit는 하나의 후보로 합치되 두 source의 순위와 원래 순위는 각각 남긴다. Member는 모두 비교한 후 맥락·origin별 최고 cosine을 대표로 선택하고, 맥락별 서로 다른 origin 최대 3개를 근거로 보존한다. 같은 origin에서 여러 Unit이 나온 횟수와 quota로 잘린 횟수를 분리한다. 맥락별 member 순위는 대표 선택 뒤 다시 매겨, 한 origin의 다수 hit가 다른 맥락을 독점하지 않게 한다. 전체 후보는 source별 최상위 순위와 맥락 ID의 안정적인 tie-break로 정렬한다. 자동 검색 예산은 기본 32, 비교값 16/32/64다. `all`은 source에서 찾지 못한 허용 맥락도 `exhaustive_only`로 포함하는 전수 대조군이다. 명시적 맥락 ID는 별도 `resolveExplicitContext`로 범위만 검증하며 자동 후보 예산에 끼워 넣지 않는다.

결과에는 허용 맥락 수, 검색 source로 찾은 수, 반환 수, source별 원래 순위·오류·입력 잘림·중복 제거·quota/global budget 잘림, 전체 `truncated`를 남긴다. 검색 source 오류와 후보 없음은 독립 상태다. 여기서의 cosine과 순위는 제안·승인·의미 일치 확률이 아니다.

## 실제 로컬 명령

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `npm run prep:check` | 0 | 계획·디자인 검사 통과 |
| `pnpm install --frozen-lockfile --offline` | 0 | 고정 의존성 설치 상태 확인 |
| `pnpm --filter @ieum/core test` | 0 | Core 29개 통과. member-only, source union, 대표 선택, 원본 독점, 16/32/64/all, 동점·shuffle, source 오류·빈 결과·명시적 맥락 반례 포함 |
| `pnpm --filter @ieum/lab-cli test` | 0 | Lab 2개 통과. exact finder의 identity/member 분리·전수 대조·원문 비출력 포함 |
| `pnpm test:unit` | 0 | Core 29개, contracts 3개, Lab 2개 통과 |
| `pnpm lint`, `pnpm format:check` | 각각 0 | lint·포맷 통과 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 경계·workspace 타입·빌드·기존 smoke 통과 |
| `git diff --check` | 0 | 공백 오류 없음 |
| [GitHub Actions run 35850330789](https://github.com/orot11955/ieum/actions/runs/35850330789) | success | Linux 준비 job과 Core/Lab workspace job 모두 성공 |

초기 Core 타입 검사는 `matchStatus` 리터럴 타입이 넓어져 exit 2였고, 초기 포맷 검사는 새 파일의 포맷 차이로 exit 1이었다. 반환 타입을 명시하고 포맷한 뒤 위 명령이 통과했다.

## 한계·데이터 영향

후보 검색의 재현성과 누락 경로를 합성 자료로 검증했다. 실제 사용자 데이터의 Candidate Recall@K, 다른 검색 provider, 권한 조회·DB 일관성, 검색 지연과 사용자 적합성은 검증하지 않았다. 이름 이외의 Context 설명 필드가 아직 없어 identity 검색은 이름만 사용한다. 원문·스키마·운영 데이터는 변경하지 않았다.
