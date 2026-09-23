# 02 · Core 상세 실행 계획

## 책임

Core는 의미적 연결·구조·정제의 **판단 재료를 계산하고 검증**한다. 업무 데이터 저장·인증·job·모델 통신·공개 발행은 맡지 않는다. 큰 `route()` 한 개에 모든 판단을 넣지 않고, 입력과 출력이 독립적으로 검증 가능한 함수로 나눈다. [S09–S12]

## 판단 파이프라인

```text
권한 내 snapshot
 → feature 준비(lexical + 선택 semantic)
 → candidate finder(identity/member/source별 후보)
 → source family dedupe와 budget
 → evaluator(값·가용성·근거)
 → scorer(순위와 내용 근거량 분리)
 → policy(candidate/suggest/abstain)
 → explain(trace에서 도출한 이유)
 → 승인할 수 있는 proposal 재료
```

구조 분석은 이 scorer의 다른 threshold가 아니다. 목적·질문·bridge·원본 다양성을 보는 별도 module이다. 글 정제도 관련성 점수의 합이 아니라 evidence/claim/outline/readiness 계약이다.

## 최초 성공 시연

원본 revision이 있는 fixture를 읽고, 관련 맥락 두 개를 반환하고, 최근 활동만 높은 무관 맥락에는 보류한다. 사용자가 하나 또는 여러 맥락을 선택하면 이력과 source pack을 새 파일로 출력한다. 같은 snapshot으로 재생했을 때 decision 결과가 같아야 한다. CLI가 된 뒤 실제 UI·DB 연결을 하고, CLI가 됐다는 이유로 제품 완성이라고 표시하지 않는다.

## 카드

<!-- GENERATED:TASKS:CORE:START -->

### CORE-01 · 원본·단위·맥락·근거 타입과 불변식

**구간:** P1 · **상태:** VERIFIED · **선행:** BASE-03

**구현 범위:** CaptureRevision, ThoughtUnitRevision, ContextSnapshot, EvidenceRef, originKey, recordedAt/occurredAt을 구현한다. 기본은 원본 1개→단위 1개이며 수동 분할과 원문 보존을 지원하는 타입을 만든다.

**입출력·데이터·코드 계약:** 위치: packages/core/src/model 및 validation. sourceSpan은 rawBody 기준 UTF-16 [start,end); 변환문은 quote가 아니라 paraphrase로 표시. ID 생성과 clock은 바깥에서 제공.

**필수 반례·검증:** 한글·이모지·결합문자 span, 범위 초과, revision 없음, 변환문을 인용으로 위장, 중복 ID, NaN/Infinity 입력 거부.

**완료 기준:** 유효하지 않은 근거는 계산 전에 실패하며 원문을 정규화 결과로 덮어쓰는 경로가 없다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-01.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-02 · 시점·권한 범위가 고정된 snapshot

**구간:** P1 · **상태:** VERIFIED · **선행:** CORE-01

**구현 범위:** 순수 snapshot validator와 파일 snapshot builder를 분리한다. asOfRecordedAt 이전에 존재한 revision/소속/관계만 선택하고 query와 같은 origin 계열을 후보 근거에서 제외한다. eligible set과 제외 이유를 기록한다.

**입출력·데이터·코드 계약:** 위치: core/snapshot validator, lab-cli/adapters/snapshot. manifest에는 입력 hash, eligible IDs, revision 목록, profile watermark, 정렬 규칙을 포함한다. 실제 권한 판정은 backend 책임이다.

**필수 반례·검증:** 미래 revision·사후 등록된 과거 사건·다른 workspace·현재 query 파생물·삭제 상태 누수 반례; 입력 순서 shuffle 후 manifest의 canonical 부분 일치.

**완료 기준:** 과거 재생에 현재 최종 상태가 섞이지 않고 허용된 데이터만 core 입력이 된다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-02.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-03 · 한국어·식별자 lexical 기준선

**구간:** P1 · **상태:** VERIFIED · **선행:** CORE-02

**구현 범위:** 검색용 NFKC·영문 정규화와 한국어 문자 2/3-gram, 영문 word/identifier tokenizer를 구현한다. fixed snapshot TF-IDF cosine을 계산한다. query를 IDF corpus에 넣지 않는다.

**입출력·데이터·코드 계약:** 위치: core/features/lexical. tokenizer/IDF/normalizer 버전과 고정 파라미터를 config에 둔다. 원문 span은 정규화 문자열 offset으로 대체하지 않는다.

**필수 반례·검증:** C++/C#, 버전·경로·CLI 옵션, 한영 혼용, 빈 벡터, 조사·띄어쓰기, 부정문, 동일 원본 중복의 IDF 영향 검사.

**완료 기준:** 같은 snapshot과 config에서 같은 feature를 얻고 실패 slice를 숨기지 않는다. lexical similarity를 의미 일치 확률로 표기하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-03.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-04 · 후보 검색·원본별 중복 제거·예산

**구간:** P1 · **상태:** VERIFIED · **선행:** CORE-03

**구현 범위:** 맥락 identity와 member 검색 결과를 union한다. 같은 origin의 member는 먼저 각각 비교한 뒤 대표 근거를 정해 임의 마지막 member를 선택하지 않는다. context별 quota와 전체 budget, stable tie-break, source별 순위와 잘림을 남긴다.

**입출력·데이터·코드 계약:** 위치: core/retrieval + lab의 exact finder adapter. 기본 K=32는 실험값이며 16/32/64 및 전수 대조가 가능하다. 명시적 context 지정은 자동 추천과 다른 사용자 명령이다.

**필수 반례·검증:** 정답이 identity에는 없고 member에만 있는 사례, 하나의 origin이 후보를 독점하는 사례, budget 초과, 동점, 후보 없음, 배열 순서 변경.

**완료 기준:** 후보 누락을 점수 오류와 구분할 수 있고 truncation=true 및 검색 source 오류가 결과에 드러난다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-04.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-05 · 점수·가용성·보류·설명 엔진

**구간:** P1 · **상태:** VERIFIED · **선행:** CORE-04

**구현 범위:** Evaluator→Scorer→Policy→Explain 단계를 분리한다. available/missing/not_applicable/error를 구분하고 contentScore, coverage, rankScore를 각각 반환한다. 초기 observe에서 candidate/abstain만 활성화한다.

**입출력·데이터·코드 계약:** 위치: core/evaluation, scoring, policy, explanation. matchProbability=null. missing feature별 임의 가중치 재정규화 금지. recency/graph는 초기 off이며 내용 근거를 대체하지 않는다.

**필수 반례·검증:** 측정된 0과 missing, coverage=0, NaN, recency만 높은 후보, 관련 맥락 2개, primary 없음, 잘못된 threshold config, 근거 없는 설명 문구.

**완료 기준:** 모든 후보에 사용 근거·설정·보류 이유가 있고 낮은 점수를 진실성 판단이나 자동 신규 맥락 생성으로 변환하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-05.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-06 · 파일 Replay·실행 이력·수동 피드백

**구간:** P1 · **상태:** VERIFIED · **선행:** CORE-05

**구현 범위:** replay/inspect/compare CLI와 불변 run directory를 구현한다. 저장 feature로 decision replay하고 입력·설정·engine hash와 결과를 남긴다. 노출/직접 선택/관련성 거절/primary 변경을 구분한다.

**입출력·데이터·코드 계약:** 위치: apps/lab-cli, artifacts 출력. manifest.json, judgements.jsonl, failures.jsonl, metrics.json, report.md. 원본 fixture를 수정하지 않으며 private artifacts는 저장소 밖이 기본이다.

**필수 반례·검증:** 같은 feature 반복 replay 결과 일치, 중단 후 임시 파일 처리, 중복 command ID, 미응답을 음성으로 취급하지 않음, 모델 재실행과 replay 구분.

**완료 기준:** run 하나만으로 당시 판단 입력과 결과를 추적할 수 있다. 파일 구현이 DB 수준 다중 프로세스 동시성을 보장한다고 주장하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-06.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-07 · 평가 데이터·라벨·메트릭·반례

**구간:** P1 · **상태:** VERIFIED · **선행:** CORE-06

**구현 범위:** 합성 fixture와 실제 허용 데이터 평가를 분리한다. match/no_match/ambiguous/insufficient 및 미검토 pair를 표현한다. 시간·원본 계열 기준 split, holdout, slices를 지원한다.

**입출력·데이터·코드 계약:** 위치: datasets/sample, configs/experiments, lab/evaluation. Recall@K, Hit@K, reviewed-pair precision, query coverage, no-match false suggestion rate를 분모와 함께 출력한다.

**필수 반례·검증:** gold 필드가 feature 입력에 들어가면 실패; 빈 분모 N/A; 하나의 관련 정답만 맞춘 multi-label 사례; 동일 origin split 누수; 미래 feedback 누수.

**완료 기준:** B0 결과와 실패 목록이 남고 합성 통과/실제 품질/효용을 구분한다. B0 정확도 미달을 semantic 실험 또는 수동 제품 개발 차단 조건으로 삼지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-07.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-08 · 모델 없는 evidence pack

**구간:** P1 · **상태:** PLANNED · **선행:** CORE-01, CORE-06

**구현 범위:** 사용자가 고른 원문 revision과 단위에서 제목·질문·관찰·반론·결정·미확인 항목을 템플릿으로 정리한다. 내용이 없는 항목은 빈칸이나 미확인으로 표시한다.

**입출력·데이터·코드 계약:** 위치: core/derivation/evidence-pack 및 lab 출력 adapter. pack manifest에 source refs, source hashes, origin families, purpose를 저장한다. 첫 Markdown 출력에는 새로운 사실을 생성하지 않는다.

**필수 반례·검증:** 없는 출처 ID, 발췌 불일치, 동일 원문의 재인용, 반론 누락 목록, 원본 수정 뒤 기존 pack 불변, private 출력 경로.

**완료 기준:** 입력→판단→직접 선택→근거 묶음까지 DB·웹·LLM 없이 한 번 수행된다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-08.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-09 · 고정 embedding과 exact semantic 검색

**구간:** P4 · **상태:** PLANNED · **선행:** CORE-07

**구현 범위:** 고정 embedding artifact를 읽는 lab adapter와 pure cosine 계산을 추가한다. 모델 revision, 차원, tokenizer/prefix/pooling/precision을 manifest로 검증한다. live provider 호출은 core 밖에 둔다.

**입출력·데이터·코드 계약:** 위치: core/features/semantic, lab/adapters/embedding-artifact. B1은 동일 eligible snapshot의 exact search; 모델 교체 시 artifact namespace와 cache를 분리한다.

**필수 반례·검증:** 차원 불일치, 서로 다른 모델 공간 혼합, zero vector, 부분 artifact 누락, provider 실패, 한영 재서술, identifier 검색 회귀.

**완료 기준:** B0/B1의 품질·지연·메모리 차이를 비교하고 결과를 재현할 수 있다. ANN 도입은 아직 필요하지 않다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-09.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-10 · hybrid·정책 보정·추천 활성화

**구간:** P4 · **상태:** PLANNED · **선행:** CORE-09, CORE-05

**구현 범위:** B2 lexical+semantic RRF와 B3 제한된 graph/session ablation을 비교한다. 순위 결합과 suggest 임계값을 분리하고 validation에서만 content floor/coverage/threshold를 선택한다.

**입출력·데이터·코드 계약:** 위치: core/retrieval/fusion, configs/policies, lab/compare. feature 실패 시 run 전체 lexical-degraded profile로 전환하고 서로 다른 profile threshold를 섞지 않는다.

**필수 반례·검증:** 무관 후보 추가로 absolute confidence가 부풀지 않음, semantic 전면 실패, 한국어/no-match/부정/다중 소속 slice, holdout 튜닝 금지, 제안 0건 precision=N/A.

**완료 기준:** 추천 모드는 평가 보고서와 config hash가 있는 경우에만 켜진다. 미달이면 observe를 유지하되 기능 구현과 품질 미달을 따로 보고한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-10.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-11 · 자유 기록에서 관리 항목 추출 계약

**구간:** P4 · **상태:** PLANNED · **선행:** CORE-08, CORE-10

**구현 범위:** Task/Event/ThoughtUnit/Context 후보의 schema와 검증기를 만든다. 모델 또는 제한된 파서는 후보만 반환하고 확정 시간·본문·대상 revision을 사용자가 확인한다. 상대 날짜의 기준 시간대와 모호성 필드를 둔다.

**입출력·데이터·코드 계약:** 위치: core/extraction/validation. 출력은 ExtractProposal[]이며 origin revision, source span, target kind, unresolved fields를 포함한다. 사용자 폼 저장과 추출은 별개다.

**필수 반례·검증:** 내일·다음 주·시간대 없음, 같은 문장의 중복 추출, 원문 수정 후 재추출, 거절한 후보 재노출, 이미 완료한 task가 다시 열리지 않음.

**완료 기준:** 추출 결과가 기존 업무 명령으로 안전하게 변환될 만큼 명확하며 모델이 직접 DB/발행 명령을 실행할 수 없다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-11.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-12 · 맥락의 구조 진단

**구간:** P5 · **상태:** PLANNED · **선행:** CORE-09

**구현 범위:** 변경된 dirty context의 승인 member snapshot만 분석한다. 작은 범위의 pairwise 유사도/그래프, origin 다양성, 목적 차이, bridge/outlier를 진단한다. 반복 run을 새로운 근거로 세지 않는다.

**입출력·데이터·코드 계약:** 위치: core/structure/diagnostics. 입력 규모 예산과 deterministic seed/config를 둔다. count 또는 centroid 하나만으로 분리·병합을 결정하지 않는다.

**필수 반례·검증:** 같은 단어지만 다른 목적, 반론과 본론, 원문 하나에서 분리한 여러 unit, 작은 샘플, hub, 같은 snapshot 3회 실행.

**완료 기준:** 진단 수치와 대표 원문을 함께 제공하고 작은/불충분 맥락은 진단만 반환한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-12.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-13 · 분리·병합·상위 묶음 변경안

**구간:** P5 · **상태:** PLANNED · **선행:** CORE-12

**구현 범위:** KEEP/LINK/CREATE_PARENT/SPLIT/MERGE를 비교한다. bridge member 중복 소속과 잔여 member를 허용한다. 기존 context를 물리 삭제하지 않는 explicit mapping을 생성한다.

**입출력·데이터·코드 계약:** 위치: core/structure/proposals. base revision 집합, 새 context 정의, 이동/유지/복제 memberships, primary 영향, 이전 출처 영향, inverse-preview 재료를 포함한다.

**필수 반례·검증:** 목적이 다른 유사 context, 부모·자식을 중복으로 착각, 분리 후 양쪽에 남는 근거, 기각 반복 억제, stale preview, 순환 parent 관계.

**완료 기준:** 어떤 레코드가 어떻게 바뀌는지 사람이 미리 확인할 수 있다. 구조 제안의 품질은 routing precision과 별도 평가한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-13.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-14 · 문서 목적·관점·개요·readiness

**구간:** P6 · **상태:** PLANNED · **선행:** CORE-08

**구현 범위:** 가이드/실험 노트/결정 기록/비교 글 등 목적별 checklist와 outline을 만든다. 관찰·외부 주장·반론·자기 해석을 구분하고 source family별 독립성을 추적한다.

**입출력·데이터·코드 계약:** 위치: core/derivation/planning. evidence pack→outline→readiness report. 미확인 항목과 반론 누락을 명시하며 모든 글에 동일 성숙도 점수를 강제하지 않는다.

**필수 반례·검증:** 근거 없는 요약 항목, 같은 원문 재인용의 과대 가산, 실패 경험 글, 상충된 관점, 작성자 해석을 외부 인용으로 표시하는 오류.

**완료 기준:** 새로운 사실을 생성하지 않고도 문서의 자료와 구조를 정리할 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-14.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-15 · 모델 초안·claim map 검증

**구간:** P6 · **상태:** PLANNED · **선행:** CORE-14, CORE-11

**구현 범위:** 모델 초안의 blockId/claimId, source refs, quote/paraphrase/synthesis/author_added를 검증한다. source allowlist·정확 인용·존재 revision·내용 변경에 따른 mapping 재검토를 처리한다.

**입출력·데이터·코드 계약:** 위치: core/derivation/validation. 참조 유효성, 의미 검토 상태, 작성자 주장 상태를 분리한다. 유효한 JSON이나 출처 존재를 사실 검증 완료로 표시하지 않는다.

**필수 반례·검증:** 지어낸 source ID, 원문과 다른 직접 인용, 독립 근거 중복, source 본문의 prompt injection, 수정된 block의 stale claim, 모델 실패.

**완료 기준:** 검증된 부분과 사람이 검토할 부분이 분리되고 모델 오류가 evidence pack이나 기존 draft를 덮어쓰지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-15.md`. 테스트 작성과 실제 실행을 구분한다.

### CORE-16 · 실제 판단·정리 효용 최종 평가

**구간:** P9 · **상태:** PLANNED · **선행:** CORE-10, CORE-13, CORE-15, FE-14, FE-16

**구현 범위:** 허용된 실제 기록과 별도 holdout에서 관련성, 구조 변경, 글 정제 효용을 각각 측정한다. 후보 정확도뿐 아니라 직접 검색/수동 정리 대비 선택 시간·수정량·피로도를 비교한다.

**입출력·데이터·코드 계약:** 산출물: core-quality-report.md, 실제 표본 수와 slice/분모/불확실성, 활성화 가능한 정책 목록. 합성 데이터와 실제 데이터를 섞은 점수 금지.

**필수 반례·검증:** 소규모 표본·관련 pair 미검토·같은 과제 기억 효과·중복 origin·실패 slice·추천 0건 처리를 검토.

**완료 기준:** full V1의 판단·구조·정제 상태를 검증됨/관찰 모드/미달로 명시한다. 미달 기능을 완성으로 포장하지 않고 다음 개선 카드의 실패 근거를 남긴다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/core-16.md`. 테스트 작성과 실제 실행을 구분한다.

<!-- GENERATED:TASKS:CORE:END -->
