# CORE-01 · 원본·단위·맥락·근거 타입과 불변식

- 상태: **IMPLEMENTED**. 로컬 검증 통과. 원격 Linux CI는 구현 커밋 push 후 확인한다.
- 기준: main `50604b94d64485358f583deb78af16759a6a3f8f`, macOS arm64, Node 24.18.0, pnpm 11.24.0. 선행 BASE-03은 VERIFIED.

## 구현과 완료 기준

`packages/core/src/model`에 원본 Capture revision, Unit revision, Context snapshot, EvidenceRef와 검증 함수를 추가했다. 시간은 호출자가 제공한 Unix epoch millisecond이며 `Date.now()`·ID 생성·저장소/네트워크 I/O가 없다. `recordedAt`과 선택적 `occurredAt`은 구분하고, Context의 identity revision과 membership revision도 별도 필드다. `originKey`는 Capture에서 Unit과 Evidence로 동일하게 전달한다.

기본 Unit 생성은 첫 Capture revision의 전체 원문을 정확한 UTF-16 span으로 가리킨다. 수동 분할은 서로 다른 Unit ID와 각 원문 span을 가진 revision 집합으로 검증한다. 입력 객체를 복사·동결하므로 호출자 객체를 나중에 수정해도 파싱된 원문은 바뀌지 않는다. 원문 정규화나 요약을 덮어쓰는 필드는 없다. 공백만 있는 원문도 BASE-03 관리 요청처럼 보존한다.

Unit과 Evidence의 `quote`는 해당 Capture revision의 `rawBody.slice(start,end)`와 정확히 같아야 한다. 바꿔 쓴 문장은 `paraphrase`로 표시한다. 근거 파싱은 Capture와 Unit을 다시 검증하고 workspace, ID/revision, origin, Unit 내부 span을 대조한다. 범위 초과와 UTF-16 대리쌍 중간 절단, 누락/불일치 revision, 중복 Unit ID, NaN/Infinity, 미래 Unit의 Context 참조를 거부한다. 한글·이모지·결합문자 span과 재서술 반례는 합성 fixture로 검증했다.

## 실제 명령

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `pnpm --filter @ieum/core test` | 0 | Core 9개 단위 테스트 통과 |
| `pnpm --filter @ieum/core typecheck`, `pnpm --filter @ieum/core build` | 모두 0 | Core 타입·빌드 통과 |
| `pnpm test:unit` | 0 | Core 9개와 contracts 3개 통과 |
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | 모두 0 | workspace 검사 통과 |
| `pnpm contracts:check` | 0 | 계약 생성물 drift와 import 경계 검사 통과 |
| `pnpm build`, `pnpm lab:smoke` | 모두 0 | workspace 빌드·기존 smoke 유지 |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획/디자인과 diff 검사 통과 |

## 미검증·데이터 영향

검증은 합성 Core 값만 사용했다. 실제 DB의 revision FK, 권한, 삭제·검색 snapshot, 원본 hash, 사용자 동시 편집, 판단 품질은 후속 카드에서 검증한다. Context의 `recordedAt`은 구성된 snapshot의 시점이며 CORE-02가 `asOfRecordedAt` manifest와 권한 내 자료 선택을 구현한다. 운영 데이터·DB migration·배포 변경은 없다.
