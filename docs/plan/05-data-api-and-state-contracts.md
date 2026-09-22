# 05 · 데이터·API·상태 계약

상태: 구현할 계약. 아래 타입·테이블·endpoint가 현재 저장소에 모두 구현되어 있다는 뜻이 아니다. 기능을 만드는 단계에만 schema와 route를 추가한다.

## 1. 서로 섞으면 안 되는 다섯 종류

| 구분 | 정본 | 변경 방식 | 해서는 안 되는 일 |
|---|---|---|---|
| 원본 | CaptureRevision/rawBody, 외부 자료 metadata revision | 새 revision 추가 | 정제한 글로 원문 덮어쓰기 |
| 해석 단위/맥락 | ThoughtUnitRevision, Membership, Relation | 사용자 명령 또는 승인된 Proposal | 점수만으로 저장 상태 변경 |
| 관리 항목 | Task, Event, Wiki의 독립 lifecycle | 명시적 업무 command | 원문 수정으로 완료한 Task 재개 |
| 작성 문서 | mutable Draft + immutable DocumentRevision + ClaimMap | autosave와 seal을 구분 | 과거 revision 또는 출처 anchor 조용히 변경 |
| 공개본 | PublicationRevision/public projection | 검토한 version 발행·개정·철회 | 내부 draft/원문을 Delivery에서 즉석 join |

검색 index, embedding, ContextProfile은 재생성 가능한 파생 cache다. cache가 원본의 삭제·권한·revision을 앞서 결정하지 않는다. 판단 run과 source pack은 생성 당시의 manifest를 보관한다. 사용자가 원본을 purge하면 과거 replay가 불가능해질 수 있으며, 이때는 자료 삭제로 재현 불가임을 표시한다. 보존을 이유로 삭제 요구를 무시하지 않는다.

## 2. 핵심 관계와 revision

```text
Workspace
 ├─ Capture ── CaptureRevision ── ThoughtUnitRevision
 │                                  ├─ Membership ── Context/ContextRevision
 │                                  ├─ ThoughtRelation
 │                                  └─ OriginLink ── Task/Event/ActivityResult
 ├─ Document ── Draft
 │             └─ DocumentRevision ── Claim/SourceReference
 ├─ EvidencePackRevision ── 고정된 Unit/Document/Source revision
 ├─ JudgementRun ── SnapshotManifest ── Proposal ── Exposure/Feedback
 ├─ StructureMutation ── before/after mapping ── inverse command
 └─ Publication ── PublicationRevision ── 공개 허용 Source/Asset projection
```

이는 관계 설명이며 하나의 거대한 polymorphic JSON 테이블을 뜻하지 않는다. typed source link는 대상별 FK 테이블 또는 제한된 discriminated schema+검증된 FK 매핑을 사용한다. 단순 `resourceType/resourceId` 문자열만 보관하고 존재를 검증하지 않는 범용 관계 저장소는 사용하지 않는다.

`id`는 identity, `revision/version`은 해당 대상의 변경 번호다. context identity revision과 membership set revision을 구분한다. profile에는 context revision, membership revision, 포함 unit revisions, model/config hash와 watermark가 들어간다. membership이 바뀌었는데 이름 revision만 비교하여 proposal을 유효하다고 판단하지 않는다.

업무 row의 `(workspace_id,id)`와 revision row의 `(workspace_id,entity_id,revision)`을 unique key로 두고 참조도 같은 소유 범위를 포함한다. active membership pair는 하나, active primary는 unit당 최대 하나다. 관계 종류·방향·상태는 DB와 application 양쪽에서 검증한다.

### 원문을 고쳤을 때 Unit은 어떻게 되는가

처음 원본 r1을 저장하면 전체 원문을 가리키는 기본 unit의 r1을 만든다. 전체 원문형 기본 unit은 원문 r2 저장 시 새 unit revision을 만들 수 있지만, 기존 unit revision을 수정하지 않는다. membership은 unit identity에 연결하고 판단과 인용은 정확한 unit revision에 고정한다. 내용이 바뀌면 profile을 무효화하고 기존 연결의 재검토가 필요할 수 있음을 표시한다. 과거 연결을 자동으로 새 내용의 검증된 정답으로 삼지 않는다.

사용자가 이미 span으로 분할한 unit은 원문 수정 시 offset을 추측해 새 revision으로 옮기지 않는다. 이전 capture revision을 계속 참조하면서 ‘현재 원문과 다름’을 표시하고, 사용자가 새 원문의 범위를 선택하여 unit revision을 만들거나 새 분할안을 승인한다. 이 과정에서도 과거 문서·판단·완료한 task의 origin은 이전 revision을 보존한다. 자료 수정, 해석 수정, 업무 상태 변경은 각각 별도 명령이다.

### 단계별 schema 추가

| 단계 | 이 단계에서 필요한 저장 구조 | 아직 만들지 않는 것 |
|---|---|---|
| P0/P1 | 파일 fixture/config/run artifact, auth spike 임시 DB | 전체 제품 66개 엔터티 일괄 migration |
| P2 | 확정 auth schema, workspace/membership, audit, command receipt | 협업 ACL·과금·공유 조직 모델 |
| P3 | capture/unit revisions, context/membership/relation, task/event/result, document/draft/revision/links | 생성 모델별 범용 workflow 엔진 |
| P4 | outbox/queue, profile/embedding metadata, run/snapshot/proposal/exposure/feedback/extraction | global vector database·자동 구조 확정 |
| P5 | structure analysis/mutation/inverse mapping | 전체 event-sourcing 재구축 |
| P6 | evidence pack/claim/source mapping, generation artifact, asset/usage/verified derivative | 임의 파일 자동 실행/크롤러 |
| P7 | review manifest, publication/public revision/alias/public assets, Delivery client/credential | 내부 private 데이터 공유 API |
| P8 | import/export/staging/삭제계획/backup manifest | 원본과 중복된 제2의 정본 |

## 3. 원문 span과 문서 anchor

Capture span은 JS 문자열의 UTF-16 code unit 기준 `[start,end)`이며 `rawBody.slice(start,end)`로 발췌를 검증한다. PostgreSQL 문자열 위치 함수나 사용자에게 보이는 글자 수와 같다고 가정하지 않는다. 검색 정규화 텍스트의 offset을 원문에 재사용하지 않는다.

문서 편집 anchor는 `documentRevision + blockId + claimId + textHash`를 기준으로 한다. Tiptap position은 편집 중 transaction mapping에 쓸 수 있지만 영구 출처 식별자를 대체하지 않는다. block을 복사하면 새 ID, 일부 split/merge이면 변경 영향 claim의 재검토, 기존 본문 hash가 바뀌면 이전 supported 상태를 그대로 보존하지 않는다. sealed revision 렌더링에서는 ID를 자동으로 추가/수정하지 않는다.

source reference는 아래 정보를 포함한다.

```ts
// 계약 예시. 현재 제공되는 SDK가 아니다.
type SourceRef = Readonly<{
  sourceKind: 'unit' | 'document_revision' | 'external_excerpt';
  sourceId: string;
  sourceRevision: number;
  originKey: string;
  sourceHash: string;
  span?: Readonly<{ start: number; end: number; encoding: 'utf16' }>;
}>;

type ClaimReview = Readonly<{
  blockId: string;
  claimId: string;
  textHash: string;
  transform: 'quote' | 'paraphrase' | 'synthesis' | 'author_added';
  refs: readonly SourceRef[];
  referenceValidity: 'valid' | 'stale' | 'unresolved' | 'invalid';
  semanticReview: 'unreviewed' | 'supported' | 'disputed' | 'author_asserted';
}>;
```

직접 인용의 정확 일치와 재서술의 의미 타당성은 다른 검사다. source ID가 존재한다고 해당 주장이 사실인 것은 아니다. 작성자 자신의 경험/판단을 외부 저자의 발언처럼 표시하지 않는다.

## 4. 시점·snapshot·재현성

`occurredAt`은 사건 시각, `recordedAt`은 시스템이 자료를 기록한 시각이다. 뒤늦게 적은 옛 사건은 그 이전 판단의 근거에 들어가면 안 된다. asOf는 source·context·membership·relation·feedback 모두에 적용한다.

제품 snapshot builder는 일관된 읽기 transaction에서 revision 집합을 조회하여 **실제로 읽은 ID/revision manifest**를 고정한다. timestamp 조건만으로 모든 동시성 상황의 과거 가시성을 완벽히 재현한다고 주장하지 않는다. manifest가 해당 판단의 최종 입력 근거다. 긴 feature 계산/모델 요청은 이 snapshot을 얻은 뒤 transaction 밖에서 수행한다.

run manifest 최소 항목은 query revision/hash, asOfRecordedAt, eligible IDs/revisions, source-family 제외 규칙, source별 후보/원래 순위/truncation, config/profile/membership/feature/normalizer/engine/model 버전, input/artifact hash, fallback과 stage별 지연이다. DB credential·원문 전체를 일반 로그로 보내지 않는다.

decision replay는 저장 feature와 policy에서 **결정 payload**가 일치하는지 비교한다. 새 runId·timestamp·latency 같은 실행 metadata까지 byte-identical하다고 요구하지 않는다. embedding 재추론이나 ANN 재구축은 replay가 아니라 rerun이다. score 정밀도·tie-break·runtime/locale 차이를 명시한다.

## 5. 명령·트랜잭션 표준

### 기록 저장

1. HTTP session과 입력 schema를 확인한다.
2. application에서 현재 account/workspace/action을 확인한다.
3. transaction에서 권한 상태와 baseVersion을 다시 확인하고 receipt key를 검사한다.
4. 원본 revision/현재 pointer/unit 관련 변경/감사/receipt와 필요한 outbox를 기록한다.
5. commit 후 저장 성공을 반환한다. 판단은 별도 job 상태다.

### 제안 승인

1. 사용자에게 노출한 정확한 Proposal ID와 operations hash를 받는다.
2. permission, source/unit/context/membership/profile 전제 중 변경에 영향을 주는 revision을 확인한다.
3. lock 순서를 정해 필요한 row를 잠근다. 하나라도 stale이면 409이며 적용하지 않는다.
4. 소속/관계 또는 업무 항목, feedback, mutation log, receipt, profile invalidation과 outbox를 같은 transaction에 기록한다.
5. 이전에 같은 command가 완료되었으면 현재 권한 확인 후 그 receipt를 반환한다.

### 멱등성

key는 새 사용자 의도마다 생성하고 재시도에만 재사용한다. 같은 key와 다른 payload는 충돌이다. `workspace+actor+command kind+key` 범위와 payload hash, 결과 resource/revision, 상태를 보관한다. autosave는 save sequence마다 별도 key이며 다음 수정에 이전 key를 재사용하지 않는다. 취소된/중단된 transaction의 receipt가 성공으로 남아서는 안 된다.

권한 철회와 command가 경쟁하면 transaction 경계를 기준으로 직렬화 가능한 허용 결과를 정의하고 시험한다. 단순히 request 시작 때 본 role을 끝까지 신뢰하지 않는다. 현재 membership/account 상태를 commit 전 검증하는 정책을 적용한다.

### Undo

Undo는 해당 mutation의 inverse plan이다. 변경 직후 revision과 현재가 같으면 inverse를 적용하고, 후속 변경이 있으면 preview를 다시 요구한다. 병합/분리 뒤 생긴 자료를 지우거나 전체 DB를 과거 snapshot으로 돌리지 않는다.

## 6. HTTP와 오류 계약

관리 경로 예시는 `/api/v1/workspaces/{wid}` 아래로 둔다. 인증 vendor endpoint는 `/api/auth/*`의 검증된 allowlist에만 등록한다. 브라우저는 같은 origin의 session cookie를 사용하고 long-lived credential을 localStorage에 두지 않는다.

| 사용자 의도 | 계약 예시 | 중요한 payload/응답 |
|---|---|---|
| 원본 생성 | POST `/captures` | title/rawBody/source, Idempotency-Key → id/revision |
| 원문 개정 | POST `/captures/{id}/revisions` | baseVersion/rawBody → 새 revision |
| 수동 단위 분할 | POST `/captures/{id}/units/split` | captureRevision/spans → 새 unit IDs/revisions |
| 맥락 연결 | POST `/units/{id}/memberships` | unitRevision/contextId/contextVersion/role |
| 할일 상태 | POST `/tasks/{id}/transition` | baseVersion/targetState, 낡은 전체 폼 재전송 금지 |
| 일정 저장/변경 | POST `/events`, PATCH `/events/{id}` | date-only 또는 instant+timezone의 구분된 schema |
| draft 저장 | PUT `/documents/{id}/draft` | baseVersion/schemaVersion/content/saveSequence |
| 문서 봉인 | POST `/documents/{id}/revisions` | 정확한 draftVersion → immutable revision |
| 판단 요청 | POST `/units/{id}/judgements` | unitRevision/config → 202/jobId |
| 제안 적용 | POST `/proposals/{id}/accept` | operationsHash + 명시한 편집/선택, receipt |
| 구조 미리보기 | POST `/contexts/{id}/structure-analysis` | snapshot 범위 → job/preview |
| 구조 승인/역변경 | POST `/structure-proposals/{id}/accept`, `/mutations/{id}/undo-preview` | 전체 precondition과 before/after |
| 자료 묶음 | POST `/evidence-packs` | 선택 source revision/purpose → pack revision |
| 정제 생성 | POST `/documents/{id}/generation-jobs` | draftVersion/packRevision/allowedOperation |
| 공개 검토 | POST `/document-revisions/{rid}/reviews` | content/source/publicAsset manifestHash |
| 발행 | POST `/publications` | reviewedRevisionId/reviewId/manifestHash/namespace/slug |
| 개정·철회 | POST `/publications/{id}/revisions`, `/withdraw` | 현재 publicVersion과 대상 review |
| 작업 조회 | GET `/jobs/{id}` | status/attempt/errorCode, 알려진 경우에만 progress |
| 검색 | GET `/search?q=...&type=...&cursor=...` | scope가 적용된 result/snippet/cursor |

요청 JSON을 domain entity나 ORM model로 그대로 전달하지 않는다. response schema도 검증하고 관리/Delivery contract를 서로 import하지 않는다. 날짜는 date-only 또는 ISO instant의 의미를 명시한다. enum의 알 수 없는 값과 추가 필드를 허용할지 endpoint별 schema에 결정한다.

오류 응답은 `application/problem+json` 형태로 `type,title,status,code,detail,requestId,fieldErrors?,currentVersion?,retryable?`을 제공한다. parsing 400, 입력 검증 422, session 401, 금지 action 403, scope 밖 resource는 일관된 404, stale/key 충돌 409, 제한 429, 필요한 provider/capability 불가 503을 구분한다. job 실패는 job 상태로 표시하며 이미 완료된 저장을 실패로 되돌리지 않는다. stack trace·원문·secret은 오류 응답에서 제외한다.

## 7. 업무 상태 전이

| 대상 | 상태와 전이 | 반드시 유지할 사실 |
|---|---|---|
| Capture | active↔archived, active/archived→trashed→restored/purged | 과거 raw revision은 정제 과정에서 불변 |
| Task | TODO↔IN_PROGRESS, ON_HOLD, DONE, CANCELED; 명시적 재개 | 원문 변경과 독립, completedAt/전이 이력 |
| Event | CONFIRMED↔CANCELED, 명시적 시간 변경 | timed/all-day 불변 계약, end>start |
| Context | ACTIVE/ARCHIVED/SUPERSEDED | rename≠새 ID, parent cycle 금지 |
| Draft | mutable, optimistic version | ACK 전 saved 표시 금지 |
| DocumentRevision | immutable, review가 별도 참조 | READY는 특정 revision에만 유효 |
| Proposal | pending→accepted/rejected/dismissed/expired/superseded | 승인 전 무변경, stale 재검토 |
| Asset | pending→verified/rejected→trashed | 검증 전 사용·공개 금지 |
| Job | queued→running→succeeded/failed/canceled | attempt/lease, 늦은 결과 적용 검사 |
| Publication | published→withdrawn, 명시적 개정 | draft와 독립, 현재 공개 pointer만 선택 이동 |

Task의 ON_HOLD는 기존 간단한 구현보다 보강한 상태다. 상태 추가가 enum만 바꾸는 작업이 되지 않도록 기존 검색·필터·전이·이력 tests까지 함께 작성한다.

## 8. 발행의 정확한 의미

문서 r7을 검토했다고 새 draft r8도 승인된 것은 아니다. **r7은 그대로 보존하고, r8은 새로 봉인·검토**한다. 사용자가 명시적으로 검토된 r7을 발행하는 선택은 가능하지만, 화면의 ‘최신 초안 발행’이 r7 승인으로 r8을 공개해서는 안 된다.

공개 manifest에는 선택 body/metadata/external source 표시/public asset hash/renderer 또는 content schema version/정책 version이 포함된다. 내부 source pack, unit ID, 개인 task/event, private original asset, 판단 trace는 allowlist에 없다. 어떤 source/asset의 공개 자격이나 존재 상태가 바뀌면 발행 시 다시 검사한다. 과거 revision 참조가 남아 있다는 사실과 현재 공개 자격은 다르다.

발행 transaction은 review/manifest 검증→public projection insert→current pointer 이동→audit/receipt 순서다. Delivery는 projection만 읽는다. private 원문을 요청 때마다 join해 즉석 공개 HTML을 만들지 않는다. 공개 HTML이나 AST도 서버 allowlist renderer로 검증하고 script/raw unsafe HTML을 통과시키지 않는다.

Delivery는 처음에는 외부 블로그 **서버**의 scoped credential을 사용한다. API key를 브라우저 코드에 넣지 않는다. 이 경로의 초기 cache 정책은 재검증 중심으로 설계하고, 익명 공개/CDN 공유 cache는 별도 활성화·테스트 후 사용한다. 상태와 credential을 확인한 다음에만 ETag/304를 처리하여 철회된 본문을 캐시로 우회하지 못하게 한다.

Publication 철회 시 alias·예전 public revision endpoint·그 공개본의 asset route까지 정책을 적용한다. 동일 파일 blob이 다른 공개본에서 독립 승인되어 쓰이는 경우를 구분한다. 이미 다운로드된 파일이나 통제하지 않는 외부 정적 사본의 완전 회수는 보장할 수 없다. test consumer의 재검증/재빌드·철회 반영 절차와 지연 범위를 문서화한다.

## 9. 보존·삭제·운영의 신뢰 경계

Operator는 서비스 상태를 관리하지만 애플리케이션 권한만으로 타인 원문을 열람하지 않는다. 이는 서버/DB 관리자에게 암호학적으로 비공개를 보장하는 E2EE 제품이라는 뜻은 아니다. 개인 원문·embedding·private export·credential은 공개 repository에 넣지 않는다.

모델 prompt와 source 본문은 지시가 아니라 데이터다. 모델의 output은 schema·source·예산·scope 검증을 거친 뒤 사용자가 채택한다. 원격 URL fetch는 기본 off다. 후속 활성화 시 redirect별 destination 검증, 사설/loopback/metadata 주소 차단, 크기·시간·content-type 예산, 브라우저 cookie 비전달을 별도 gate로 구현한다.

backup은 DB·assets·schema·필요 키를 일관된 시점으로 보존해야 한다. restore는 깨끗한 환경에서 hash/FK/샘플 조회를 확인하며, restore 이후 삭제·철회 tombstone이 되살아나지 않도록 reconciliation을 실행한다. 로그/backup의 보관 기간과 purge 범위를 설정으로 기록하고 ‘모든 사본의 즉시 완전 삭제’를 보장하지 않는다.
