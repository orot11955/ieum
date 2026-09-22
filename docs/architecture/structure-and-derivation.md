# 구조 변경과 글 정제

- 개정: 2026-09-22
- 상태: M4의 분석 계약. M1은 수동 선택 기반 evidence pack만 구현한다.

## 1. 같은 엔진으로 다 해결하지 않는다

연결 판단은 새 기록과 기존 맥락의 관련성을 찾는다. 구조 판단은 맥락 경계의 변경이 유용한지를 검토한다. 글 정제는 목적과 독자에 맞게 근거를 구성한다. 세 작업의 손실과 오류 비용이 다르므로 routing 가중치를 그대로 재사용하지 않는다.

## 2. 구조 분석의 입력

입력은 특정 시점의 Context 설명과 승인된 member/relation snapshot이다. 최근 변경된 맥락만 dirty set으로 분석한다. 새로운 기록이 들어올 때마다 전체 기록 풀을 다시 clustering하지 않는다.

확인할 진단값은 원본 계열 수, 내용 분포, 대표 질문/목적, 그래프 내부·교차 연결, 다중 소속, 최근 변화다. member count 하나나 centroid similarity 하나로 변경을 확정하지 않는다. 모델이 제안한 관계를 승인된 관계와 섞지 않는다.

원본 하나에서 분리한 10개 단위를 독립된 기록 10개로 세지 않는다. 선택한 알고리즘·표현·seed·표본 추출·제외 항목·revision을 분석 run에 남긴다.

## 3. Split 후보

탐색용 초기 알고리즘은 작은 Context 안의 exact pairwise 유사도 또는 k-nearest-neighbor 그래프를 만들고 분리 가능한 묶음을 찾는 정도로 시작한다. 연결 성분이나 clustering 결과 자체가 제품 의미의 정답은 아니다.

Split 제안은 다음 질문에 답해야 한다.

| 질문 | 필요한 근거 |
| --- | --- |
| 서로 다른 목적/질문이 형성되었는가? | 대표 원문과 목적 차이 |
| 내부 응집과 그룹 간 분리가 안정적인가? | 선택한 거리 기준의 before/after 값 |
| 소수 outlier만 떼어내는 것은 아닌가? | 원본 계열 수, outlier 목록 |
| 각 묶음이 독립적으로 활용될 수 있는가? | 각각의 질문·근거·후속 기록 |
| 공통 기록은 무엇인가? | 두 맥락에 남겨야 할 bridge member |

탐색 설정의 예로 원본 계열 6개 이상, 자식별 3개 이상을 둘 수 있다. 이는 작은 샘플의 잦은 분리를 막는 시작 조건일 뿐 의미적 독립성의 증명이 아니다. 데이터가 적으면 진단만 표시한다.

낮은 교차 연결 비율은 분리 근거일 수 있다. `graph cut이 클수록 분리해야 한다`처럼 정의 없이 방향을 정하지 않는다. normalized cut 등 어떤 값을 사용하는지와 좋은 방향을 명시한다.

분리는 기본적으로 hard partition이 아니다. bridge 기록은 양쪽에 남을 수 있고 일부 기록은 원래 Context에 남을 수 있다. 부정문/반론을 별도 주제로 오인해 그룹을 나누지 않는다.

## 4. Merge보다 먼저 검토할 대안

두 맥락의 표현이 비슷하더라도 목적·범위·보존 이유가 다를 수 있다. 예를 들어 운영 원칙과 실제 장애 대응은 같은 단어를 많이 사용해도 동일한 맥락은 아닐 수 있다.

분석 결과는 `KEEP`, `LINK_CONTEXTS`, `CREATE_PARENT`, `MERGE` 중 대안을 비교한다. Merge에는 identity, 교차 member, 중복 소속, 목적 차이, 사용자 유지 의도를 제시한다. 부모-자식 관계를 중복 Context로 착각하지 않는다.

초기부터 weighted mergeScore 하나에 보편적인 임계값을 부여하지 않는다. 명확한 중복 예제와 유사하지만 목적이 다른 반례를 만들고, 사용자가 변경안을 선택하는 결과로 별도 평가한다.

## 5. 지속성·히스테리시스

동일 snapshot에서 같은 점수가 세 번 나와도 새로운 관측 세 건이 아니다. 새로운 원본 계열의 유입, 실제 기간을 두고 확인된 변화, 사용자의 경계 판단처럼 근거가 달라진 경우만 지속성에 반영한다.

한 번 기각한 동일 변경안은 관련 revision이 바뀌거나 새 근거가 생기기 전까지 반복 노출하지 않는다. 진입 기준과 해제 기준을 분리할 수 있지만 수치는 구조 라벨로 튜닝한다. 구조 안정성을 위해 cooldown과 표시 예산을 둔다.

## 6. 변경 미리보기와 적용

미리보기에는 영향을 받는 Context/ThoughtUnit ID와 revision, 이동·복제·유지되는 소속, primary 변경, 과거 Artifact 출처 영향, 이전 구조로 돌아갈 수 있는 범위를 포함한다.

Merge는 A/B를 물리 삭제하지 않고 새 목적을 갖는 C와 supersession 관계를 만든다. 승인된 mapping에 따라 현재 소속을 옮기되 이전 Context와 과거 결과물의 출처는 유지한다. Split도 자식 Context와 명시적인 membership mapping을 만든다.

실제 적용은 [도메인 모델](domain-model.md)의 revision 검증과 한 트랜잭션을 따른다. 승인 후 새 기록이 생겼다면 Undo는 그 기록을 삭제하지 않고 충돌을 표시하는 역변경안이다. 부분 실패 상태를 정상 완료로 보여주지 않는다.

## 7. 글 정제는 성숙도 한 줄이 아니다

`RAW → DECIDED → SYNTHESIZABLE`을 모든 글의 필수 경로로 강제하지 않는다. 질문 모음, 실패 기록, 실험 중간 보고도 결과물이 될 수 있다.

대신 artifact 목적별 readiness checklist를 사용한다. 결정 정리에는 선택지·판단 기준·근거·남은 위험이, 실험 노트에는 조건·시도·결과·한계가, 가이드에는 전제·재현 절차·검증 범위가 필요하다. 누락은 점수로 감추지 않고 목록으로 보여준다.

## 8. 파생 파이프라인

```text
사용자가 대상 맥락/기록과 글의 목적을 선택
  → source revision을 고정한 evidence pack
  → 주장 / 관찰 / 반론 / 결정 / 결과 / 열린 질문 분리
  → 독자와 목적에 맞춘 outline
  → 선택적 문장 정제 또는 초안 생성
  → claim-to-source mapping 검증
  → 사용자의 내용·개인정보 검토
  → 새 ArtifactRevision 저장
  → 별도 승인된 export (외부 자동 발행은 범위 밖)
```

첫 evidence pack은 생성 모델 없이 템플릿으로 만든다. 제목, 선택한 질문, 관련 원문, 반론, 알려진 결정, 미확인 항목을 나열한다. 내용이 없는 칸을 생성 모델이 그럴듯하게 채우지 않는다.

## 9. 문장별 출처 계약

각 claim 또는 문단은 다음을 가진다.

```text
artifactRevision
textRange 또는 안정적인 claimId
sourceRefs: unitId + revision + 원문 span
transform: quote | paraphrase | synthesis | author_added
status: supported | disputed | unverified | author_asserted
reviewedBy / reviewedAt (있을 때만)
```

`quote`는 원문 일치를 검증한다. `paraphrase`와 `synthesis`는 출처가 존재한다는 검사와 의미가 맞는지의 검토가 별도다. 출처 ID가 유효하다는 이유만으로 주장 검증이 끝난 것으로 표시하지 않는다. author_added에는 자동으로 출처를 만들어 붙이지 않는다.

사용자가 문장을 수정하면 이전 source mapping을 무조건 신뢰하지 않고 재검토 상태로 돌린다. source가 수정·삭제되면 관련 ArtifactRevision에 stale/unresolved 경고를 남긴다. 이전 글을 자동으로 바꾸지 않는다.

## 10. 모델의 허용 역할

모델은 paraphrase 후보, 질문/반론 추출 후보, outline, 초안과 claim map을 반환할 수 있다. 출력은 schema 검증, 존재하는 source ID 검사, 원문 발췌 검사, 금지된 외부 공개 검사 후 사용자가 검토한다. JSON이 유효하다는 사실은 내용 정확성의 보증이 아니다.

원본 문서와 웹 인용에 포함된 지시는 데이터로 취급한다. 모델은 임의 도구 실행·파일 읽기·네트워크 호출·DB 쓰기 권한을 갖지 않는다. 출처에 없는 모델 자체 지식은 별도 미확인 추가 내용으로 표시하거나 제외한다. 모델 실패 시 evidence pack을 그대로 유지한다.

## 11. 평가

Structure는 split/merge/parent 제안의 적절성, false merge, false split, 미리보기 이해도, Undo 성공률, 반복 노출을 측정한다. 손실이 다른 변경을 routing accuracy에 섞지 않는다.

Derivation은 누락된 주요 근거·반론, 잘못 연결된 출처, unsupported claim, 원문과 다른 확정 표현, 사용자의 수정량과 정리 시간을 측정한다. 출처 연결률은 필요조건이지만 사실 정확도의 충분조건은 아니다.

발행용 export는 공개 가능한 텍스트만 포함하고 비공개 source pack·내부 ID mapping은 별도 보존한다. 개인정보 검토 없는 전체 근거 묶음 공개를 기본 동작으로 만들지 않는다.
