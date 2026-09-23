# CORE-02 · 시점·권한 범위가 고정된 snapshot

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux CI가 통과했다.
- 기준: main `ac9400bde0d5624fed576492e0a2b77a46b56a01`, macOS arm64, Node 24.18.0, pnpm 11.24.0. 선행 CORE-01은 VERIFIED.

## 구현·계약 결정

Core의 `validateSnapshot`은 한 workspace의 Capture/Unit/Context/Relation/삭제 상태/profile watermark **revision 이력**과 고정된 query Unit revision, `asOfRecordedAt`, 입력 SHA-256을 받아 순수하게 검증·선택한다. 다른 workspace 자료가 섞이면 입력 전체를 거부한다. 실제 사용자 권한 판정은 이 함수의 책임이 아니며 BE-12의 백엔드 조회 전에 수행해야 한다.

선택은 `recordedAt <= asOfRecordedAt`과 revision 이력으로 한다. `occurredAt`이 오래됐어도 나중에 기록된 자료는 이전 snapshot에 들어가지 않는다. Query 자신과 같은 `originKey`의 Unit, asOf 시점에 삭제된 Capture/Unit/Context, 유효 후보가 아닌 관계 endpoint를 제외한다. Context의 membership revision은 이력에서 고르되 소속은 Unit ID에 유지하고, 출력에서는 asOf 시점의 Unit revision으로 해석한다. 관계는 정확히 기록된 endpoint revision에 고정한다. Capture/Unit origin 또는 Relation endpoint가 후속 revision에서 바뀌는 입력은 거부한다.

Manifest는 입력 hash, query ID/revision/origin, profile watermark, 선택한 Capture/Unit/Context/Relation revision, 정렬 규칙과 제외 이유를 기록한다. 배열 순서와 객체 key 순서가 바뀌어도 같은 파일 입력 hash·manifest를 얻는다. Core에는 파일·crypto·DB·network import가 없다. Lab 어댑터만 JSON 파일을 읽고 Node SHA-256을 계산한다. `ieum-lab --snapshot <file>`은 **manifest만** 출력하며 원문은 출력하지 않는다. JSON fixture는 합성 값으로 테스트했고 사용자 자료는 저장소에 넣지 않았다.

## 실제 명령

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `npm run prep:check` | 0 | 계획·디자인 검사 |
| `pnpm install --frozen-lockfile --offline` | 0 | 고정 의존성 설치 상태 확인 |
| `pnpm --filter @ieum/core test` | 0 | Core 15개 테스트 통과 |
| `pnpm test:unit` | 0 | Core 15개, contracts 3개, Lab 파일/CLI 1개 통과 |
| `pnpm format:check` | 0 | 포맷 검사 통과 |
| `pnpm lint` | 0 | 사용하지 않은 type import 제거 후 통과 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 생성물·경계, workspace 타입·빌드, 기존 smoke 유지 |
| `git diff --check` | 0 | 공백 오류 없음 |
| [GitHub Actions run 35847173662](https://github.com/orot11955/ieum/actions/runs/35847173662), commit `7c250077e77d61eb87434f53000320a7f66843d8` | success | Linux 준비 job과 workspace job 모두 성공. frozen install, lint, 계약 검사, format, typecheck, unit, build, smoke, tracked diff 포함 |

첫 전체 lint는 `CaptureRevision`의 사용하지 않은 type import 때문에 exit 1이었다. 해당 import를 제거하고 재실행해 exit 0을 확인했다.

## 미검증·데이터 영향

파일 이력이 완전하고 단일 workspace에서 왔다는 전제가 필요하다. 누락된 과거 삭제/권한 이벤트를 Core가 추측해 복원하지 않는다. timestamp만으로 실제 DB 동시성의 과거 가시성을 보장하지 않으며, BE-12는 일관된 읽기 transaction과 실제 읽은 revision manifest를 만들어야 한다. 실제 인증·RLS·사용자 데이터·검색 품질·운영 DB/배포는 다루지 않았다.
