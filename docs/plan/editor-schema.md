# FE-02 편집 저장 계약 · schemaVersion 1

이 문서는 FE-02 spike에서 BE-11 문서 저장 경계로 넘기는 계약이다. 구현 정본은 `packages/contracts/src/editor.ts`의 `EditorEnvelopeSchema`다. 현재 운영 문서 DB나 기존 Markdown 자료를 이 형식으로 자동 변환하지 않는다.

## 저장 형식과 변경 판정

- 편집 정본은 `{schemaVersion:1, content:{type:'doc', content:[...]}}`의 JSON이다. 허용 블록은 `paragraph`, 1–3단계 `heading`이며 각 블록은 UUID `blockId`를 가진다. 허용 inline은 일반 text와 bold/italic mark, `hardBreak`, `sourceReference`다. 알 수 없는 node/mark/attr, 누락·중복 ID, 유효하지 않은 UTF-16 span과 다른 schemaVersion은 저장 전에 거부한다. 빈 `doc`은 계약상 허용하며 편집기는 빈 paragraph로 표시할 수 있다.
- `blockId`는 편집 중 유지한다. 문단 split의 새 블록·복사된 블록은 새 ID가 필요하다. merge의 남는 블록 ID는 유지하고 사라진 ID는 제거 기록으로 남긴다. `compareEditorBlocks`는 추가/본문·서식·출처 변경 블록을 `recheckBlockIds`, 삭제 블록을 `removedBlockIds`로 반환한다. 이는 **재검토 요청**이며 출처의 사실성 판정이 아니다. JSON key 순서 차이도 보수적으로 재검토될 수 있다.
- `sourceReference`는 `sourceKind/sourceId/sourceRevision/originKey/sourceHash`와 선택적 UTF-16 `[start,end)` span 및 화면 label을 담는다. UI가 이 값을 보관해도 출처의 존재·현재 권한·revision·hash·span의 원문 일치는 BE-11 및 후속 승인 경계에서 다시 검증해야 한다. 출처 label은 유효성 증거가 아니다. 출처가 바뀌면 해당 블록의 이전 claim `supported` 판정을 재사용하지 않는다.
- 영속 편집 JSON의 문자열에는 NUL과 짝이 없는 UTF-16 surrogate를 허용하지 않는다. `unit` 출처의 `sourceHash`는 해당 불변 unit revision의 `content_text`를 UTF-8로 SHA-256 해시한 값이고, 선택적 span은 그 텍스트의 UTF-16 범위다. `document_revision` 출처의 `sourceHash`는 스키마 검증 후 정규화한 editor JSON의 UTF-8 SHA-256 값이고 `originKey`는 `document:<id>`다. 이 출처의 선택적 span은 불변 revision을 블록별 줄바꿈으로 연결하고 inline text·hardBreak의 줄바꿈·sourceReference의 화면 label을 순서대로 이어 만든 **파생 평문**의 UTF-16 범위다. 이 범위는 영구 block/claim ID를 대신하지 않으며 문장 의미의 지지를 보증하지 않는다. 외부 발췌는 BE-16의 영속 출처 검증 전까지 저장하지 않는다.
- 영속 claim anchor는 `documentRevision + blockId + claimId + textHash`다. FE-02는 `blockId`와 블록 변경 집합을 고정한다. claim ID/textHash 및 승인 전제·원자 저장은 BE-11 이후 카드가 문서/판단 경계에서 구현한다. Tiptap position은 영속 ID가 아니다.
- 편집기의 한글 조합 동안 JSON 변경 callback을 보류하고 composition 종료 후 한 번 검증한다. BE-11 autosave는 이 callback을 기반으로 `baseVersion`과 응답 순서를 별도 검사해야 한다. 서버에서 다른 revision을 내려받아도 열린 미저장 draft를 자동 `setContent`로 덮지 않는다.

## 이전 Markdown의 변환·export 손실

| Markdown 요소 | FE-02 편집 subset으로 가져올 때 | Markdown으로 내보낼 때 |
| --- | --- | --- |
| 일반 문단, 제목 1–3단계, bold/italic, 단순 줄바꿈 | 명시적 변환 구현 후 표현 가능. 기존 원문과 변환 전 hash를 보존해야 한다. | 본문 모양은 표현 가능하지만 `blockId`, schemaVersion, revision은 사라진다. |
| 제목 4–6단계, 목록, 인용 블록, 링크, 코드·코드블록, 표, 이미지, HTML, 임의 확장 | 현재 schema에 없음. 조용히 평문으로 바꾸거나 노드를 버리지 않고 변환을 중단하고 손실 목록을 제시한다. | 이 spike는 생성하지 않는다. 미래 확장 시 별도 round-trip 검사 전까지 손실 가능으로 취급한다. |
| 출처 참조, origin/hash/span, claim 검토 상태 | Markdown만으로 신뢰 가능한 원본 ID/revision을 재구성할 수 없다. 새 연결은 사용자 검토가 필요하다. | 화면 label만 텍스트로 표현 가능하며 anchor/권한/검토 상태는 유실된다. JSON manifest 없이는 재import 불가다. |
| 불변 revision·미저장 draft·공개본 | Markdown 파일 하나에 합치지 않는다. 각각의 수명과 권한을 보존한다. | 본문 export는 backup/restore나 공개 manifest가 아니다. |

따라서 기존 Markdown을 **자동 일괄 변환하지 않는다**. 변환 기능은 원본을 그대로 보관하고 지원·미지원 요소를 검사한 뒤 사용자가 새 draft를 명시적으로 저장하는 후속 작업으로 분리한다. 손실 없는 복원·이동에는 버전 있는 JSON과 source/asset manifest가 필요하며 이는 BE-21의 export/import 계약이다. 공개 HTML/Markdown은 BE-20의 검토된 공개 projection에서만 만든다. 에디터의 private `getHTML()`이나 clipboard HTML을 Delivery에 직접 보내지 않는다.

## 단계·호환성

BASE-03의 `schemaVersion:1` envelope는 실제 저장 없이 넓은 JSON 예제로만 존재했다. FE-02는 같은 버전의 허용 node subset을 확정한다. BE-11은 신규 문서 테이블과 API가 이 subset을 검증한 뒤 JSON을 저장하며, 알 수 없는 미래 버전은 읽기 전용/명시적 오류로 처리한다. 유효한 원문·불변 revision을 자동 정규화로 덮어쓰지 않는다. 유료 협업/Cloud/CRDT는 이 계약의 필수 조건이 아니다.
