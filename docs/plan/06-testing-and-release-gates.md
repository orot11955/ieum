# 06 · 검증·품질·릴리스 기준

## 1. 증거의 등급

문서 작성, 단위 테스트 작성, 단위 테스트 실행, 실제 PostgreSQL 통합 실행, browser E2E 실행, 실제 개인 데이터 품질 측정, 사용자 효용 확인, 배포/복원 확인은 별도 증거다. 코드가 컴파일된다는 이유로 의미 판단이 유효하다고 결론내리지 않는다. 이 패키지의 구조 검사는 제품 검증이 아니다.

## 2. 단계 gate

| Gate | 완료시 확인 | 실패 시 처리 |
|---|---|---|
| G0 기반 | 실제 최소 실행, import/contract/design 실패 검사, auth/editor spike | 문제 adapter만 수정; 미래 모듈 확대 중단 |
| G1 Core Lab | 파일 수직 흐름, 결정 replay, 누수 반례, B0 측정 | 입력·feature·재현성 결함 수정; 품질 미달이면 B1 실험 계속 |
| G2 개인 공간 | 두 사용자 격리, 실제 PG role/RLS, MFA/철회/command | 개인 데이터 사용·계정 수용 보류 |
| G3 수동 제품 | Core OFF 기록→할일→결과→위키, 일정·충돌 | 데이터 유실/업무 상태 결함 수정 후 다음 의존 기능 진행 |
| G4 판단 통합 | async 분리, stale/중복/권한, 실제 suggest 정책 평가 | observe 유지; worker/트랜잭션 결함은 blocking |
| G5 구조 | bridge, 영향 preview, 원자 적용, 충돌 있는 inverse | 구조 적용 비활성; 문서 수동 개발은 계속 |
| G6 문서 | 출처 고정, claim 편집 재검토, 모델 오류 격리 | 생성 적용 비활성; 수동 편집·evidence pack 유지 |
| G7 공개 | immutable projection, private canary 차단, 개정/철회·독립 소비자 | 공개 Delivery OFF |
| G8 운영 | 실제 import/export/restore, 삭제·철회 reconciliation | 공개 운영 보류; 데이터 보존 결함 먼저 수정 |
| G9 통합 | 실제 품질·효용·화면·성능 및 G1–G8 증거 | 통과 범위로만 제한 사용; full V1 표기 금지 |

G5 실행 증거는 CORE-13/BE-15/FE-14 완료 때 남기고 QA-06에서 G6와 함께 다시 검토한다. 한 검증 카드가 두 영역을 다뤄도 보고서는 구조/문서로 구분한다.

QA-01은 BE-02와 FE-02의 실제 spike 뒤 G0의 import/contract/design CI 실패 조건을 확인한다. 저장소 브랜치 보호 설정은 별도 확인 대상이며 CI job 성공만으로 main push 차단이 설정됐다고 주장하지 않는다. QA-05는 판단·추출의 G4이고, 통합 검색 BE-26/FE-11은 별도 반례까지 VERIFIED여야 P4 전체를 마친다. QA-07은 공개 기능의 G7이며 실제 공개 운영 판정은 복원·운영 G8과 종단 G9 뒤에 한다.

## 3. 테스트 피라미드가 아니라 책임별 검증

| 영역 | 도구/환경 | 핵심 검증 |
|---|---|---|
| Core/domain | Vitest, 고정 fixture, 필요시 property-based tests | finite·span·다중 소속·missing/0·asOf·동점·origin·반례 |
| Application | port fake + 실제 핵심 integration | 명령 전제·권한·원자성·typed failure |
| Repository/DB | Testcontainers 실제 PostgreSQL | FK/unique/RLS/non-owner·동시성·락·migration |
| HTTP/contract | API integration + 생성 client | input/output schema·status·비밀 제외·DTO drift |
| Web feature | Testing Library + browser | form/state·IME·autosave·conflict·cache purge |
| 사용자 흐름 | Playwright | Core OFF 기본 제품, 구조/문서/발행/철회 |
| 장애 | worker kill/timeout/DB failure injection | 저장 분리·중복 job·stale result·retry budget |
| 운영 | 별도 DB/volume/환경 | backup/restore·source/schema/asset 무결성 |
| 품질 | lab replay + 허용 실제 데이터 | retrieval/정책/구조/정제/효용 별도 지표 |

커버리지 퍼센트를 기능 완료의 대리 지표로 삼지 않는다. 중요한 불변식과 오류 경로가 실제로 실행되는지가 우선이다. 보안 회귀 canary는 실제 비밀 대신 합성 문자열로 작성한다.

## 4. Core 평가를 어떻게 시작할지

합성 fixture는 최소 목표로 context 40개/query 60개 정도의 비자명한 예제를 구성한다. 관련 맥락이 여러 개인 입력, no-match, 같은 단어지만 다른 목적, 바꿔 말하기, 한국어 조사/띄어쓰기, 한영 혼용, identifier, 부정/반론을 포함한다. 숫자만 채우려고 이름만 바꾼 context를 늘리지 않는다. [S12]

실제 자료는 사용자가 허용한 50–100개 기록으로 입력/라벨 비용을 먼저 확인하고, 100–300개 및 더 긴 기간으로 확장하는 실행안을 채택한다. 이것은 현재 확보한 데이터 수가 아니다. 공개 fixture와 private dataset은 분리하고 snapshot/label을 저장소 밖에 둔다.

시간순 development/validation/holdout을 원본 계열 기준으로 나눈다. 비율 60/20/20은 시작 예이며 실제 group 크기와 건수를 공개한다. 정답 label은 feature/schema 입력에서 거부한다. 관련성 미검토 pair는 unknown, 미응답은 label이 아니다. 이미 답을 보고 조정한 holdout은 새 최종 검증용으로 재사용하지 않는다.

### 메트릭

- Candidate Recall@K: 정답 맥락이 있는 query별 `찾은 관련 맥락 수/전체 관련 맥락 수`의 평균.
- Hit@K: 정답이 하나라도 들어간 query 비율. multi-label Recall과 혼용하지 않는다.
- Suggestion precision: 제안한 pair 중 검토된 pair의 적합 비율. 미검토 pair 비율도 함께 표시한다.
- Coverage: 평가 가능한 query 중 제안이 하나 이상 나온 query 비율.
- No-match false suggestion rate: 관련 맥락 없음으로 검토된 query 중 제안한 비율.
- Structure: false merge/false split, 대안의 적절성, 반복 노출, preview 이해도, inverse 성공/충돌 처리.
- Derivation: 잘못된 출처, unsupported claim, 누락 반론, 의미 변경, 수정량·정리 시간.

분모가 0이면 N/A다. Recall@10을 보고할 때 eligible context 수가 10 이하라 전수를 반환한 경우를 별도 표시한다. 여러 evaluator가 같은 원문을 보았다고 독립 근거 수를 늘리지 않는다. 작은 표본의 비율만으로 안정성을 주장하지 않고 source-group 단위의 불확실성을 보고한다.

### 추천 모드 활성화 목표

현재 저장소의 초기 목표와 연결해 validation에서 Recall@10 ≥0.90, reviewed-pair precision ≥0.90, query coverage ≥0.30, no-match false suggestion rate ≤0.10을 **pilot 목표**로 사용한다. 더 높은 품질을 목표로 개선하되 이 숫자를 실측 성과나 확률 보증으로 표시하지 않는다. [S12]

검토된 제안 50 pair와 no-match 20 query는 초기 판단 보고에 필요한 최소 표본의 제안값이다. 서로 종속된 동일 origin 표본이 많으면 숫자만 채운 것으로 취급하지 않는다. 표본이 부족하면 제한된 observe/실험 사용을 유지하고 추가 라벨을 수집한다. matchProbability는 별도 calibrator가 검증되기 전까지 null이다. 초기 STRONG_SUGGEST와 무승인 실행은 없다.

Core Lab 또는 B0 품질 미달은 프로젝트 실패 판정이 아니다. 후보 누락→후보 source 개선, 후보는 있으나 순위가 낮음→feature/fusion 개선, no-match 오제안→policy/coverage 개선, 구조 오류→목적/bridge/원본 중복 점검, 정제 오류→source pack/claim validation/UX 개선 순으로 진단하고 새 config와 새 검증 증거를 남긴다.

## 5. 성능 목표와 측정 조건

P0에서 실행 환경을 기록하고 BE-25에서 100/1,000/10,000건의 합성 또는 허용된 데이터 단계와 문서 크기·context 수·동시 요청·provider를 분리하여 측정한다. 사용자 원문을 단순 복제해 품질 검증 데이터 수를 부풀리지 않는다.

초기 UX 예산의 제안값은 같은 네트워크에서 Core OFF 저장 ACK p95 500ms, 일반 검색 p95 1s, draft ACK p95 1s다. Core/모델 job은 별도 queue wait와 실행 지연으로 측정하며 요청에 무제한 묶지 않는다. 이 값은 목표이지 현재 확인된 수치나 완료 시간 약속이 아니다. P0/BE-25에서 환경과 payload를 함께 고정하고, 미달이면 이유와 실제 UX 영향으로 수정 여부를 결정한다.

ANN·batch/cache 같은 최적화는 exact reference 대비 Recall 손실과 scope 필터링을 측정한 뒤 도입한다. full scan을 없애기 위해 correctness를 희생하거나 운영 환경을 모른 채 처리량을 보장하지 않는다.

## 6. 최종 인수 시나리오

### A · 기록이 경험과 지식이 되는 흐름

새 사용자 로그인→‘배포 장애 조사’ 기록→맥락 두 개 연결→조사 할일 생성→완료→실험 결과 기록→위키로 정리한다. 원본을 수정해도 완료 상태와 이전 원문 revision이 유지되어야 한다. Core/provider를 끄고도 반복한다.

### B · 관련성에서 구조로 발전하는 흐름

어휘가 다른 유사 기록을 넣어 lexical/semantic/hybrid 결과와 근거를 비교한다. 무관한 기록에는 보류하고, 여러 목적이 생긴 맥락에 split/link/parent/merge 대안을 제시한다. bridge를 양쪽에 남기고 적용 후 새 기록을 만든 뒤 Undo에서 충돌을 안전하게 처리한다.

### C · 경험과 외부 관점을 문서로 만드는 흐름

자기 실험 결과·외부 주장·반론을 source revision으로 묶고 독자/목적을 선택한다. outline과 문서를 작성하고 한 문단의 모델 정제를 선택 적용한다. 출처가 없는 문장과 편집으로 달라진 claim을 검토한 후 문서 revision을 봉인한다.

### D · 승인된 글만 외부에 나가는 흐름

r7을 검토해 발행하고 외부 소비자로 읽는다. 새 draft r8을 편집해도 외부는 r7을 유지한다. r8을 새로 검토·발행한 뒤 개정이 반영되는지 보고, 철회와 이전 alias/asset/ETag 우회를 검사한다. 비공개 source pack canary는 한 번도 출력되면 안 된다.

### E · 장애와 복원 뒤에도 경계 유지

worker를 죽이고 모델을 끊은 상태에서 수동 저장을 확인한다. 새 환경에 backup을 restore하고 계정/원문/문서/공개본/파일을 확인한다. 삭제·철회된 데이터가 다시 노출되지 않는지 reconciliation 결과를 검증한다.

## 7. 검증 카드

<!-- GENERATED:TASKS:QA:START -->

### QA-01 · 의존성·계약·디자인 CI 차단

**구간:** P0 · **상태:** PLANNED · **선행:** BASE-03, BE-02, FE-02

**구현 범위:** import graph, schema generation, design source/lock, build scripts의 실패 조건을 실제 CI에서 연결한다. rule을 꺼서 통과시키지 않는다.

**입출력·데이터·코드 계약:** 산출물: architecture-boundaries.spec, contract-drift check, design check와 CI 실행 결과. required-check 설정은 별도 저장소 권한과 확인이 필요하며, 설정 전에는 main push 차단을 보장하지 않는다.

**필수 반례·검증:** 의도적인 core→DB import, controller SQL, page arbitrary token, public DTO private field, regenerated artifact mismatch가 실패하는지 검사.

**완료 기준:** 파일 위치뿐 아니라 실제 의존 방향을 위반하면 로컬 검사와 CI job이 실패한다. 브랜치 보호가 확인되지 않았다면 main 반영 차단으로 보고하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-01.md`. 테스트 작성과 실제 실행을 구분한다.

### QA-02 · Core Lab 재현성·누수 반례 gate

**구간:** P1 · **상태:** PLANNED · **선행:** CORE-06, CORE-07, CORE-08

**구현 범위:** 고정 run의 반복 계산과 feature/config 변경 비교, source/시간/정답 누수 반례를 독립 점검한다.

**입출력·데이터·코드 계약:** gate G1: CLI 수직 흐름 실행 log, fixture 결과, actual data 미실행 표시, replay equality report.

**필수 반례·검증:** 동일 snapshot, 다른 입력 순서, float 허용 오차, origin 중복, 미래 자료, unknown label, source span, 보류.

**완료 기준:** Core의 최소 실험이 실제 실행되고 다음 semantic 실험에 사용할 B0 기준선이 저장되었다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-02.md`. 테스트 작성과 실제 실행을 구분한다.

### QA-03 · 인증·두 사용자·transaction gate

**구간:** P2 · **상태:** PLANNED · **선행:** QA-01, BE-03, BE-04, BE-05, FE-04

**구현 범위:** 실제 PG와 browser/API 조합으로 인증·session·workspace·idempotency·audit 실패를 검증한다.

**입출력·데이터·코드 계약:** gate G2: role/privilege matrix, 두 사용자 negative tests, auth spike report, bootstrap/recovery evidence.

**필수 반례·검증:** cross-scope 요청·JWT/쿠키 조작·CSRF·세션 철회·last owner·동시 초대·audit 실패·pool scope reuse.

**완료 기준:** 개인 관리 기능이 올라갈 최소 신뢰 경계가 검증되었다. 아직 없는 asset/job/public 경로는 이후 gate에서 검사한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-03.md`. 테스트 작성과 실제 실행을 구분한다.

### QA-04 · Core OFF 기본 개인 관리 E2E

**구간:** P3 · **상태:** PLANNED · **선행:** FE-10, BE-09, BE-10, BE-11, QA-03

**구현 범위:** 로그인→기록→다중 맥락→할일→완료→결과→위키, 일정 변경/취소, 충돌 복구를 수행한다. Core/provider를 강제로 끈다.

**입출력·데이터·코드 계약:** gate G3: Playwright trace, 실제 DB에 저장된 revision/state, 모델 접근 요청 0 확인.

**필수 반례·검증:** 재시작 후 조회, 두 탭 autosave, 세션 만료, 네트워크 오류, 날짜/시간대, source 수정 후 task 상태 유지.

**완료 기준:** 기본 개인 관리 제품이 데이터 유실 없이 실제로 사용 가능하다. 이 단계만으로 최초 지능형 제품 목표 완료라고 부르지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-04.md`. 테스트 작성과 실제 실행을 구분한다.

### QA-05 · 비동기 판단·추출·오류 격리 gate

**구간:** P4 · **상태:** PLANNED · **선행:** BE-06, BE-12, BE-13, BE-14, FE-12, FE-13

**구현 범위:** 저장 성공 이후 worker·provider·정책 실패와 재시도를 강제로 만들고 source revision/권한/비용 경계를 점검한다.

**입출력·데이터·코드 계약:** gate G4: failure injection report, replay artifact, 중복 명령 결과, 실제 recommendation quality와 observe 상태.

**필수 반례·검증:** worker kill, provider timeout, duplicate delivery, source 삭제, stale proposal, expired actor, 금지 자료 embedding, 중복 task.

**완료 기준:** 의미 판단이 제품에 연결됐지만 수동 기능을 막거나 임의 구조를 바꾸지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-05.md`. 테스트 작성과 실제 실행을 구분한다.

### QA-06 · 구조·근거·문서 정제 gate

**구간:** P6 · **상태:** PLANNED · **선행:** BE-15, BE-16, BE-17, FE-14, FE-15, FE-16

**구현 범위:** 구조 변경/역변경과 출처 기반 문서 작성·생성 결과 채택을 분리 검증한다. 두 부분의 결과를 별도 report로 남긴다.

**입출력·데이터·코드 계약:** gate G5/G6: structure mutation/inverse proof; evidence/claim editing audit; hallucinated source rejection; user review trace.

**필수 반례·검증:** bridge, 신규 record 후 Undo, 출처 수정/삭제, 문단 split/merge, 생성 중 편집, 반론 누락, 존재 출처≠의미 타당성.

**완료 기준:** 맥락 구조와 문서의 provenance가 변경 이후에도 유지된다. 모델 사용 여부와 검토 상태를 정확히 표시한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-06.md`. 테스트 작성과 실제 실행을 구분한다.

### QA-07 · 공개 경계·개정·철회·외부 소비자 gate

**구간:** P7 · **상태:** PLANNED · **선행:** BE-19, BE-20, FE-18

**구현 범위:** 별도 작은 Delivery 소비자를 만들어 DB/내부 타입 없이 공개 목록/상세/개정/철회를 시험한다. 관리와 public role의 접근 경계를 검사한다.

**입출력·데이터·코드 계약:** gate G7: private canary 없음, projection schema allowlist, consumer contract tests, cache/alias/assets/key revocation matrix.

**필수 반례·검증:** draft 수정, READY stale, 미발행 원문, public asset만 노출, 이전 revision/alias로 우회, cached 304, key 폐기, 정적 사본 철회 한계, Core/worker 불가 중 발행·Delivery 조회.

**완료 기준:** 발행 API를 통해 공개하도록 검토한 데이터만 제공된다. 외부 블로그 제품 전체를 만드는 단계는 아니다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-07.md`. 테스트 작성과 실제 실행을 구분한다.

### QA-08 · 실제 이식·삭제·복원·운영 gate

**구간:** P8 · **상태:** PLANNED · **선행:** BE-21, BE-22, BE-24, FE-19, FE-20

**구현 범위:** 별도 빈 DB와 파일 저장소에 backup을 복원하고 export/import 왕복 및 purge 이후 reconciliation을 실행한다.

**입출력·데이터·코드 계약:** gate G8: restore manifest/hash/샘플 조회, migration rehearsal, auth/key 복구 절차, 삭제·철회 tombstone 반영 보고서.

**필수 반례·검증:** 깨진 backup, 누락 asset, schema mismatch, 철회 전 backup, job 재생성, 권한 바뀐 export 다운로드, rollback 시 새 데이터 보존.

**완료 기준:** 파일 생성이 아니라 실제 복원된 시스템을 확인했고 남은 운영 제약이 문서화되었다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-08.md`. 테스트 작성과 실제 실행을 구분한다.

### QA-09 · 최초 컨셉 종단 인수·릴리스 판정

**구간:** P9 · **상태:** PLANNED · **선행:** QA-01, QA-02, QA-04, QA-05, QA-06, QA-07, QA-08, CORE-16, BE-25, FE-21

**구현 범위:** 기록/행동/경험/맥락 정리/다중 관점 문서/공개 API/개정·철회/복원 전체를 독립 시나리오로 수행하고 사용자 효용과 운영 증거를 묶는다.

**입출력·데이터·코드 계약:** gate G9: release checklist, 실제 활성 기능과 제한, 통과/실패/미검증 행렬, rollback/incident runbook. 모든 task의 DONE은 증거 경로가 있어야 한다.

**필수 반례·검증:** 정상 경로뿐 아니라 core outage, 충돌, 모델 오류, 권한 오류, 공개 유출 canary, restore 후 private/public 일관성.

**완료 기준:** 수동 사용 가능/MVP/의미 판단 품질 검증/최초 목표 V1/공개 운영 가능을 분리 판정한다. 미완성 고급 기능을 상태명 변경으로 숨기지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/qa-09.md`. 테스트 작성과 실제 실행을 구분한다.

<!-- GENERATED:TASKS:QA:END -->
