# CORE-12 · 맥락의 구조 진단

- 상태: **IMPLEMENTED**. 로컬 검증 완료, 원격 Linux CI 대기; 사용자 ACCEPTED 전.
- 선행: CORE-09 VERIFIED. 작업 기준 main `9e053d3`.
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 사용자 기록·실제 embedding/provider는 사용하지 않았다.

## 구현·계약

`diagnoseContextStructure`는 이미 범위가 검증된 snapshot에서 `dirty=true`인 지정 Context의 현재 membership revision을 확인한다. 호출자가 승인된 멤버에 맞춰 제공한 목적·입장·고정 모델 벡터의 ID/revision 집합은 Context 멤버와 정확히 같아야 한다. 모델 namespace와 실제 멤버 신호에서 주입된 hash 함수로 계산한 signal hash를 run key에 묶어 같은 입력의 반복 실행이 같은 진단으로 남도록 한다. 승인 여부와 실제 artifact 진위, 암호학적 hash 함수 공급은 제품 경계의 책임이며 Core가 임의로 provider를 호출하지 않는다.

최대 64명 멤버의 pairwise cosine을 전수 계산한다. 같은 목적의 충분한 유사도는 진단 graph edge가 될 수 있으나 같은 단어라도 목적이 다르면 edge로 묶지 않고 목적 충돌 수로 드러낸다. 본론·반론 관계는 `opposedStance`로 표시하고 자동 outlier/삭제 결정으로 만들지 않는다. 원본 계열 수는 원문에서 파생한 여러 Unit을 한 번만 센다. graph articulation 또는 다중 Context 소속 멤버를 bridge로, 연결 없는 멤버를 outlier로 표시한다. 대표 항목은 원문 span에서 추출한 텍스트와 출처를 함께 제공하며 고정 seed로 선택한다. 소규모/원본 다양성 부족은 `insufficient`이고 모든 결과의 `action`은 `none`이다. 수치만으로 분리/병합 명령을 생성하지 않는다.

이 결과는 CORE-13 변경안의 참고 입력이며 사람의 목적 판단이나 실제 semantic 모델 품질을 보증하지 않는다. 같은 snapshot을 세 번 돌려도 독립 근거 수가 증가하지 않는다.

## 반례와 검증

- 같은 벡터지만 다른 목적의 pair는 graph edge가 되지 않고 목적 충돌로 기록됐다.
- 본론/반론 pair, articulation hub, 다중 Context 멤버, 떨어진 outlier, 한 origin에서 파생한 여러 Unit, 작은/단일 origin 표본을 검증했다.
- stale membership, 누락·scope 밖 멤버, zero vector, 유효하지 않은 hash 함수 결과와 변경된 벡터의 run key, 64명 예산 초과를 거부했다.
- 같은 입력 세 번 실행의 결과와 run key가 완전히 일치했다.
- 첫 테스트는 `StructureDiagnosticConfig`가 상수 리터럴 타입으로 좁혀져 예산 반례 설정의 TypeScript 검사가 실패했다. 숫자 설정을 명시적인 config 타입으로 분리한 후 타입 검사와 테스트가 통과했다.
- 첫 원격 CI [실행 35866702115](https://github.com/orot11955/ieum/actions/runs/35866702115)은 최종 `signalHash` 이름 변경 후 테스트 파일 한 줄의 Prettier 형식 차이로 실패했다. 해당 줄을 정리하고 `pnpm format:check` exit 0을 다시 확인했다.

| 실제 명령 | exit | 결과 |
| --- | ---: | --- |
| `pnpm test:unit` | 0 | Core 57개, contracts 3개, Lab 25개 통과 |
| `pnpm lint`, `pnpm format:check`, `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 정적 검사·계약 경계·빌드·smoke 통과 |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획 75개·링크·디자인과 공백 검사 통과 |

실제 사용자 자료와 모델 벡터, 승인 메타데이터 공급 경계, 구조 제안의 사용자 효용은 미검증이다. DB·HTTP·운영 설정을 변경하지 않았다.
