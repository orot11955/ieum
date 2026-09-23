# CORE-05 · 점수·가용성·보류·설명 엔진

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux CI 성공; 사용자 ACCEPTED 전.
- 선행: CORE-04 VERIFIED. 작업 기준 main `40807c796f7979c6ae2fed7d40b25001faca54e0`.
- 기능 커밋: `f8fb26d2986c38cb6cd6d682a8e3b48f9e1ffee3`; [GitHub Actions 실행](https://github.com/orot11955/ieum/actions/runs/35853513391) `completed success` (Linux).
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 입력은 합성 fixture이며 사용자 자료가 아니다.

## 구현·계약

Core의 `evaluateCandidate` → `scoreCandidate` → `resolvePolicy` → `explainCandidate`를 독립 단계로 구현하고 `runObserveJudgement`에서 조립한다. Lab의 `runExactObserve`는 CORE-04 전수 lexical 검색과 후보별 측정을 연결한다. 검색 hit가 없다는 사실만으로 0을 만들지 않는다. Lab은 실제로 계산한 0, 빈 query/member 벡터, 맥락에 member 없음, source/feature 오류를 서로 다른 가용성으로 전달한다.

Identity와 member는 각각 측정 상태·값·사유를 남긴다. Member support는 검증된 Unit revision에서 origin별 최고 측정값을 택한 뒤 상위 3개 origin의 평균이다. Lexical 내용 신호는 측정 가능한 identity/member 중 최댓값이다. 점수는 고정 가중치의 `contentScore`, 실제 측정된 가중치의 `coverage`, 진단용 `observedMean`, 후보 정렬용 `rankScore`를 구분한다. 결측 feature의 가중치는 재분배하지 않는다. 최종 후보는 `rankScore` 내림차순·Context ID 동점 규칙으로 정렬하고 기존 검색 순위도 보존한다.

활성 실행 프로필은 `lexical-v0`, 정책은 `observe-v1`이다. Graph/session/recency boost는 0으로 고정하고, semantic provider가 없는 상태에서 semantic 측정값이나 hybrid 실행 프로필을 받지 않는다. 점수 함수의 혼합 가중치 계산은 결측 반례로만 검증했다. `coverage=0`은 ABSTAIN, 측정된 0은 수동 검토용 CANDIDATE와 `MEASURED_ZERO` 이유를 반환한다. Observe에서는 SUGGEST·자동 변경·primary 선택을 반환하지 않으며 `matchProbability`는 null이다. 설명은 측정 상태·값·원본별 Unit ID/revision·source rank/오류·설정 버전에서만 만든다. 낮은 점수로 사실성이나 새 맥락 필요 여부를 판단하지 않는다.

## 실제 로컬 명령

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `npm run prep:check` | 0 | 시작 시 계획·디자인 검사 통과 |
| `pnpm --filter @ieum/core test` | 0 | Core 35개 통과. 0/결측·상태 4종·origin별 상위 3개·부분 coverage·recency 단독·두 맥락·정렬/동점·NaN/Infinity·설정 거부·근거 없는 참조 거부 포함 |
| `pnpm --filter @ieum/core typecheck`, `pnpm lint`, `pnpm format:check` | 각각 0 | Core 타입·lint·포맷 통과 |
| `pnpm install --frozen-lockfile --offline` | 0 | 고정 의존성 설치 상태 확인 |
| `pnpm test:unit` | 0 | Core 35개, contracts 3개, Lab 5개 통과. Lab에서 측정된 0·빈 query 보류·불완전 source 거부·반복 실행 일치 확인 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 경계·workspace 타입·빌드·기존 smoke 통과 |
| `git diff --check` | 0 | 공백 오류 없음 |

점수순 정렬 추가 직후 첫 Core 타입 검사는 중간 결과에 최종 `rank`가 아직 없다는 TS2741로 exit 2였다. 중간 결과 타입을 분리하고 재실행해 exit 0을 확인했다.

## 한계·데이터 영향

Lexical similarity와 수동 후보 노출의 계산 계약을 합성 입력으로 확인했다. 제안 threshold, semantic provider, 실제 사용자 적합성·품질, 권한·DB·HTTP·브라우저는 구현하거나 검증하지 않았다. Lab adapter는 테스트에서 호출되며 replay/inspect CLI와 불변 run artifact는 CORE-06 범위다. 원문·스키마·운영 데이터는 변경하지 않았다.
