> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# 도메인·데이터 모델

- 개정: 2026-09-22
- 상태: 목표 계약. M0/M1은 파일 표현, M3에서 DB 제약으로 구현한다.

## 1. 원본과 파생물

| 개념 | 최소 필드 | 불변식 |
| --- | --- | --- |
| Capture | id, revision, rawBody, sourceType, sourceKey, recordedAt, occurredAt? | 원문 revision 불변 |
| ThoughtUnit | id, revision, captureId/revision, text, sourceSpans, role | 사용한 원본 revision을 고정 |
| Context | id, revision, name, purpose, scope, status | 함께 보는 이유가 필요 |
| Membership | unitId, contextId, role, validFrom, endedAt? | active primary 최대 하나 |
| ThoughtRelation | from/to unit revision, type, origin, evidenceRefs | 의미 관계와 출처를 구분 |
| ContextProfile | contextId/revision, asOf, inputHash, features | 재생성 가능한 cache |
| JudgementRun | input/snapshot/config/model refs, trace | 당시 판단 재현 가능 |
| Proposal | baseRevisions, operations, runId, status | 승인 전에는 구조 변경 없음 |
| Feedback | exposureId?, targetPair?, action, reason, recordedAt | 미응답과 명시 거절 분리 |
| MutationLog | commandId, before/after refs, actor, time | 승인·취소를 추적 |
| ArtifactRevision | kind, body, sourceRefs, claimMap, provenance | 결과물도 revision 불변 |

표는 논리 모델이다. M1에 모든 DB table과 CRUD를 구현하라는 뜻이 아니다.

## 2. Capture와 ThoughtUnit

기본은 Capture 하나에 ThoughtUnit 하나다. 자동 의미 분할은 초기 범위 밖이다. 사용자가 분리하면 새 ThoughtUnit들을 만들고 원본과 원래 단위의 이력을 유지한다. 문장 자동 분할을 사고 단위의 정답이라고 가정하지 않는다.

`sourceSpans`는 `{captureId, captureRevision, start, end, encoding:'utf16'}`이며 범위는 `[start,end)`다. JS 문자열 offset임을 명시하고 `rawBody.slice(start,end)`와 저장 발췌가 일치하는지 확인한다. NFKC·공백 정규화 이후의 offset을 원문에 그대로 적용하지 않는다. 발췌 일치 검사를 통과하지 못하면 원본 전체 참조 또는 명시적 mapping을 사용한다.

`text`가 재서술이면 원문 발췌로 위장하지 않고 `transform: 'paraphrase'`와 원래 span을 보존한다. 원문의 잘못된 맞춤법이나 잠정적 표현도 rawBody에는 남긴다.

role은 사용자가 지정한 observation/question/claim/decision/action/result/resource/unknown 정도로 시작한다. AI가 role을 제안하더라도 관찰을 확인된 사실로 승격하지 않는다. 사실 확인 상태와 문장 역할은 별도다.

`sourceKey` 기반 중복 수집은 같은 외부 revision의 재수집을 idempotent하게 처리하기 위한 것이다. 내용이 같다는 이유만으로 서로 다른 사용자 입력을 삭제하지 않는다.

## 3. Context와 소속

Context는 제목만 있는 폴더가 아니라 목적과 범위가 있는 묶음이다. `purpose`와 간단한 `scope`를 유지하되 초기 생성의 부담을 줄이기 위해 사용자가 짧게 작성할 수 있게 한다. 이름 변경이 ID 변경을 의미하지 않는다.

Topic/Flow/Project/Collection은 초기에는 선택적 종류 또는 facet이며 별도 상속 계층이 아니다. 프로젝트 완료와 검색 제외를 동일한 상태로 처리하지 않는다. ACTIVE, ARCHIVED, SUPERSEDED 상태의 검색·제안 가능 여부를 명시한다.

Membership의 역할은 primary/secondary/background로 시작할 수 있다. `evidence`는 의미 관계일 수도 있으므로 단순 소속과 `SUPPORTS`를 혼동하지 않는다. 다중 연결이 기본이며 primary는 없어도 된다.

DB 단계의 예시 제약:

```sql
CREATE UNIQUE INDEX one_active_primary_per_unit
ON context_membership (unit_id)
WHERE role = 'primary' AND ended_at IS NULL;

CREATE UNIQUE INDEX one_active_membership_per_pair
ON context_membership (unit_id, context_id)
WHERE ended_at IS NULL;
```

이는 전체 migration이 아니다. FK, 동일 소유 범위, revision 존재, 시간 범위, 승인 트랜잭션 검증을 함께 구현해야 한다. 다중 사용자 범위를 도입하면 소유 범위를 포함한 키와 참조 제약을 추가한다.

## 4. 관계와 근거의 출처

`SUPPORTS`, `CONTRADICTS`, `REFINES`, `RESULT_OF`, `RELATED_TO`는 생각 사이의 의미 관계다. 문서 생성의 출처인 `DERIVED_FROM`은 Artifact provenance로도 별도 표현한다. 모든 관계를 같은 hop 점수로 전파하지 않는다.

관계마다 사용자 명시인지, 가져온 원문 주장인지, 모델 제안인지 기록한다. 모델 제안 edge는 승인된 edge와 같은 것으로 처리하지 않는다. 추천 결과가 만든 edge를 다시 추천의 강한 근거로 사용해 순환 강화하지 않는다.

`A supports B`, `B supports C`에서 `A supports C`를 자동 확정하지 않는다. `CONTRADICTS`도 같은 주제의 강한 관련 근거일 수 있다. 내용의 입장과 맥락 적합성은 다른 차원이다.

동일 Capture에서 분리한 여러 단위나 그 요약은 `originKey`를 공유한다. 이들은 독립된 근거 다섯 개가 아니라 같은 원본에서 온 근거로 계산한다.

## 5. Profile과 자기 누수 방지

Profile은 당시 승인되어 있던 member들의 파생 데이터다. 사용한 member/revision 목록 또는 재구성 가능한 manifest와 hash를 남긴다. 새 기록의 판단이 끝나기 전에 그 기록을 후보 ContextProfile에 넣지 않는다.

기본 평가에서는 현재 query, 동일 Capture의 다른 단위, 현재 query에서 파생된 요약/문서를 근거에서 제외한다. 실제 연속 사용에서 같은 원본을 다시 보는 상황을 시험하려면 별도 recurrence slice로 보고한다.

삭제·분리·소속 수정·모델 변경 시 profile과 embedding을 무효화한다. `membershipRevision`이 profile watermark보다 새로우면 오래된 profile 사용 여부를 run에 명시하며 강한 정책을 허용하지 않는다.

## 6. 시점 모델

`occurredAt`은 사용자가 말하는 사건 시각, `recordedAt`은 시스템이 그 자료를 알게 된 시각이다. Replay의 접근 가능성은 후자를 따른다. 수정과 사용자 승인도 recordedAt을 갖는다.

초기에는 revision과 operation log + snapshot manifest만 사용한다. 전체 Event Sourcing 엔진이나 범용 EAV를 도입하지 않는다. 과거 상태를 재구성하는 데 필요한 최소 사실만 남긴다.

## 7. Proposal 적용

Proposal 상태는 pending/accepted/rejected/dismissed/expired/superseded로 구분한다. pending 생성은 데이터 구조를 변경하지 않는다. UI에 표시한 exposure와 사용자가 응답한 feedback은 별도 이력이다.

M3의 적용 절차:

1. commandId/idempotencyKey와 실행 권한을 확인한다.
2. 영향받는 unit/context를 안정적인 순서로 잠그고 base revision을 비교한다.
3. 이미 동일 command가 적용되었으면 기존 결과를 반환한다.
4. 불일치하면 `STALE_PROPOSAL` 충돌로 반환하고 일부만 적용하지 않는다.
5. 소속/관계 변경, feedback, mutation log, profile 무효화를 한 트랜잭션으로 기록한다.
6. commit 이후 재생성 job을 수행한다. 필요하면 DB outbox를 사용하며 초기부터 별도 브로커를 요구하지 않는다.

primary 이동은 기존 primary 종료와 새 primary 생성이 원자적이어야 한다. 사용자 명시 명령도 같은 제약을 통과한다.

## 8. 취소와 동시 변경

Undo는 과거 DB snapshot으로 전체 시스템을 되감는 기능이 아니다. 해당 명령이 바꾼 범위에 대한 반대 변경안을 생성한다. 현재 revision이 적용 직후와 같으면 원자적으로 반영하고, 다른 변경이 누적되었으면 충돌과 재검토가 필요하다.

병합/분리 후 생긴 새 기록을 되돌리기 위해 지우지 않는다. 원래 Context ID와 이전 Artifact의 출처는 유지한다. 구조 변경의 구체적 영향은 [구조·파생 문서](structure-and-derivation.md)를 따른다.

## 9. Artifact와 정리본

ArtifactRevision은 source unit의 최신 상태가 아니라 **작성 당시 revision**을 참조한다. claimMap은 문장 또는 문단과 sourceRefs, transform, 확인 상태를 연결한다. 나중에 근거가 수정되면 결과물에 stale 경고를 붙이고 자동으로 과거 글을 덮어쓰지 않는다.

임의 출처 ID, 존재하지 않는 인용, 누락된 반론을 검증할 수 있어야 한다. 출처가 있다는 사실만으로 문장의 참을 보증하지 않는다. 자세한 글 정제 흐름은 [구조·파생](structure-and-derivation.md)에 정의한다.

## 10. 보존과 사용자 삭제

원본 보존은 일상적인 정제 과정에서 덮어쓰지 않는다는 뜻이다. 사용자의 명시적 삭제 요구를 막는다는 뜻이 아니다. 삭제 시 원문·관련 cache·embedding·export·backup의 잔존 범위를 관리하고, 출처를 잃은 결과물에는 unresolved source를 표시한다. 자동 삭제나 영구 복구 가능성을 약속하지 않는다.

공개 테스트 fixture에는 가공한 실제 개인정보보다 처음부터 만든 합성 사례를 우선한다. 파일 기반 실험에서도 privacy 규칙을 동일하게 적용한다.
