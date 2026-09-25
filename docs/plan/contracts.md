# BASE-03 · 최소 계약과 생성 경로

상태: 작은 실행 예제. 여기의 Capture 생성·Delivery 조회는 DTO와 client 경계를 검증하는 계약이며 실제 HTTP 서버·DB·발행 기능은 아직 없다.

## 책임과 매핑

| 경계 | 현재 소스 | 규칙 |
| --- | --- | --- |
| Core snapshot | `packages/core/src/snapshot.ts` | 원문과 revision/span을 순수 값으로 받는다. span은 원문 JS 문자열의 UTF-16 code unit `[start,end)`이며 범위 검사는 `sliceRawSpan`이 한다. |
| 관리 HTTP | `packages/contracts/src/management.ts` | `POST /api/v1/workspaces/{wid}/captures`의 요청/201 응답을 strict Zod schema로 검증한다. 요청의 actor/workspace/idempotency는 body에서 받지 않고 신뢰된 호출 문맥에서 command에 더한다. |
| 업무·저장 입력 | `toCreateCaptureCommand` → `toCapturePersistenceInput`, `toCoreCaptureSnapshot` | HTTP DTO, 업무 명령, 저장 입력, Core 입력의 모양을 각각 명시한다. 아직 DB schema가 없으므로 저장 입력은 ORM row가 아니다. 실제 Drizzle row mapper는 BE-07에서 추가한다. |
| Delivery | `packages/contracts/src/delivery.ts` | `GET /delivery/v1/publications/{id}`의 허용 필드만 별도 strict schema로 정의한다. 관리 DTO와 내부 원문을 Delivery에서 import하지 않는다. |
| 편집기 | `packages/contracts/src/editor.ts`, [FE-02 저장 계약](editor-schema.md) | `schemaVersion: 1`의 허용 node·block ID·source ref·변경 재검토를 검증한다. Capture 원문 UTF-16 offset은 다른 계약이다. |

API의 정본은 Zod schema다. `pnpm contracts:generate`는 그 schema에서 OpenAPI 3.0.3 JSON과 `openapi-typescript` client types를 생성한다. `pnpm contracts:check`는 생성물 drift와 import 경계를 실패로 검출한다. `openapi-fetch`는 생성 타입을 소비하는 테스트 client이며 서버 인증·권한 검사를 대신하지 않는다. 생성된 `packages/contracts/openapi/*.json`과 `packages/contracts/generated/*.ts`를 직접 수정하지 않는다.

`scripts/contracts/check-boundaries.mjs`는 Core가 외부 package/DB/HTTP를 import하는 경로, web의 backend/DB 직접 import, Delivery의 management/core/backend import를 검사한다. `scripts/contracts/check-boundaries.test.mjs`는 실제 금지 import fixture가 실패하는지 확인한다. 이 규칙은 현재 작은 경계를 보호하며, QA-01에서 전체 import graph·계약 drift·CI 차단으로 확장한다.

## 다음 카드에 남기는 결정

- BE-07은 실제 `(workspace_id,id)` 키와 revision schema를 정한 뒤 저장 입력→ORM row를 명시적으로 매핑하고, 현재 actor 권한·transaction·receipt를 검증한다.
- FE-02는 editor node/block ID 유지·조합 중 직렬화 보류·serialize/deserialize와 기존 Markdown 손실 범위를 고정했다. 합성 조합 이벤트는 실제 입력기 검증과 구분한다. BE-11은 서버 권한·출처·baseVersion 검증을 붙인다.
- BE-20은 Delivery의 실제 공개 projection·credential·철회 정책을 구현한다. 현재 계약 예제의 공개 응답 통과가 공개 안전성 검증은 아니다.
