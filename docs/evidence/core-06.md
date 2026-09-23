# CORE-06 · 파일 Replay·실행 이력·수동 피드백

- 상태: **IMPLEMENTED**. 로컬 검증 완료; 원격 Linux CI 검증 전.
- 선행: CORE-05 VERIFIED. 작업 기준 main `9d5e8b6c480c7b1cc371f60f9323b2aef30478d3`.
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 입력과 피드백은 테스트에서 만든 합성 fixture이며 실제 사용자 자료가 아니다.

## 구현·계약

`node apps/lab-cli/dist/main.js run <snapshot.json> [--out <directory>] [--feedback <events.json>] [--budget 16|32|64|all]`은 Core의 lexical observe 판단을 실행한다. 기본 출력은 저장소 밖의 `~/.local/share/ieum-lab/runs/<runId>`이다. 명시한 출력 디렉터리가 이미 있으면 덮어쓰지 않는다. 같은 부모의 임시 디렉터리에 제한된 권한으로 쓴 뒤 디렉터리 이름을 바꿔 완성본을 게시한다. 남아 있는 미완료 임시 디렉터리를 완성된 run으로 읽지 않는다.

완성본에는 `manifest.json`, `input.json`, `features.json`, `judgements.jsonl`, `failures.jsonl`, `feedback.jsonl`, `metrics.json`, `report.md`가 있다. 원본 fixture는 읽기만 하고 정확한 입력 바이트를 `input.json`에 보관한다. Manifest는 파일별 SHA-256, snapshot 입력/대상 revision manifest, 입력·feature·결정 hash, config/빌드된 Core·Lab 엔진 hash, profile/정책/검색 예산, 단계별 실행 시간과 fallback 정보를 담는다. 성공한 단일 query run의 `failures.jsonl`은 빈 파일이다. 사용자 원문이 들어갈 수 있는 `input.json`과 artifact 전체는 private로 취급한다. 파일 hash는 우발적 변조 감지이며 서명이나 외부 진본성 보증이 아니다.

`replay <run-directory>`는 저장된 입력과 검색 결과·측정 feature로 결정만 다시 계산하고 저장된 결정 payload와 비교한다. 현재 엔진 또는 설정 hash가 다르면 replay라고 주장하지 않고 거부한다. 모델을 재실행하지 않으며 runId·실행 시간을 byte 동일성 대상으로 삼지 않는다. `inspect`는 저장 파일 hash와 manifest 일관성을 확인한 뒤 원문 없이 요약을 출력한다. `compare <run-a> <run-b>`는 입력·엔진·설정·feature·결정의 동일 여부를 각각 반환한다. 새 `run`은 feature를 다시 계산하는 fresh 실행이다.

선택적 피드백 입력은 `[{"commandId":"e1","kind":"exposure","contextId":"c1"}, ...]` 형태다. `exposure`, `direct_selection`, `relevance_rejection`, `primary_change`를 별도 사건으로 기록한다. 응답 사건은 기존 `exposureId`와 동일 Context를 참조해야 하며 command ID와 exposure 응답은 중복될 수 없다. 응답이 없는 노출은 미응답으로 세고 음성 라벨로 바꾸지 않는다. 수동 피드백은 현재 판단 feature로 사용하지 않으며 품질 지표도 계산하지 않는다.

## 실제 로컬 명령

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `npm run prep:check` | 0 | 시작 시 계획·디자인 검사 통과 |
| `pnpm --filter @ieum/lab-cli build`, `pnpm --filter @ieum/lab-cli test` | 각각 0 | Lab 11개 통과. 실제 CLI run/replay/inspect/compare, 입력 사본 독립성, 반복 결정 일치, 변조, 임시 디렉터리, 중복 명령, 피드백 구분, 미응답, 엔진 불일치, private 오류 문구 검증 |
| `pnpm install --frozen-lockfile --offline` | 0 | 기존 고정 lockfile로 설치 상태 확인; 새 의존성 없음 |
| `pnpm lint`, `pnpm format:check` | 각각 0 | 현재 소스 검사 통과 |
| `pnpm test:unit` | 0 | Core 35개, contracts 3개, Lab 11개 통과 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 경계·workspace 타입·빌드·기존 smoke 통과 |
| `git diff --check` | 0 | 공백 오류 없음 |

첫 Lab 타입 검사에서 CLI 예산의 임의 숫자가 Core의 `16 | 32 | 64 | "all"` 계약과 맞지 않아 TS2322가 발생했다. 허용 값으로 제한했다. 다음 타입 검사에서 optional 필드에 `undefined`를 명시 전달해 TS2379가 발생했다. 필드가 있을 때만 전달하도록 수정한 뒤 typecheck와 테스트가 통과했다.

## 한계·데이터 영향

파일 run은 한 query와 lexical observe 경로만 다룬다. 성공한 run을 새 디렉터리로만 게시하며, 파일 시스템 crash 후 fsync 내구성·다중 프로세스 경쟁 제어·DB 트랜잭션 수준 불변성을 보장하지 않는다. 임시 디렉터리가 남으면 자동 삭제하지 않는다. `inspect`의 hash 확인은 같은 run manifest를 신뢰하는 범위이며 외부 서명 검증이 아니다. 실제 품질 지표·평가 라벨·데이터 split은 CORE-07, 모델·semantic 재실행은 후속 카드다. 제품 DB·HTTP·운영 데이터는 변경하지 않았다.
