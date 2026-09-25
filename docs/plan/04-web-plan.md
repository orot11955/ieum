# 04 · Web 상세 실행 계획

## 책임

Web은 사용자의 작업·초안·선택·확인·복구 경험을 책임진다. backend의 업무 규칙이나 core의 판단을 다른 방식으로 다시 구현하지 않는다. 원문 기록은 빠르게, 위키는 편집과 연결 중심으로, 문서 작업실은 근거·관점·공개 검토 중심으로 구성한다.

## state와 hook 분리 기준

| 상태 | 소유자 | 생성·갱신·폐기 |
|---|---|---|
| 로그인 결과·서버 capability | auth bootstrap/query | 로그인 후 조회, 철회/계정 변경 시 무효화 |
| 서버 기록·목록·job | entity query/TanStack Query | key=user/workspace/resource/filter, logout 시 abort+clear |
| 미저장 문서·폼 | feature reducer/hook | 화면/문서 ID 기준 생성, 서버 ACK 후 baseVersion 갱신, explicit logout 시 제거 |
| 검색어·필터·선택 탭 | URL | navigation과 함께 복원 |
| modal·popover·temporary selection | local state | 해당 UI 생명주기 종료 시 폐기 |
| theme preference | app theme provider | system/light/dark 설정에 따라 유지; 개인 본문 저장소와 구분 |

hook은 독립된 생명주기와 사용자 행동이 있을 때 분리한다. `useCaptureQuery`와 `useDocumentDraft`는 역할이 다르다. 모든 setter를 별도 hook으로 만들거나 한 `usePageEverything`으로 모으지 않는다. 페이지는 작업 흐름을 조립하고 network payload·권한·복잡한 편집 상태는 feature/entity 경계로 옮긴다.

## 편집 상태 계약

`clean→dirty→saving→saved`와 `saving→error/conflict/session-expired`를 구현한다. 한글 조합 도중 submit/분할/불완전 save를 하지 않는다. 이전 저장 응답이 현재 draft를 덮지 않도록 요청 sequence와 baseVersion을 사용한다. 서버본·내본을 보존한 명시적 충돌 해결만 허용한다. 경고 UI나 beforeunload만으로 저장을 보장한다고 설명하지 않는다.

## 디자인 계약

Paper와 Dark를 같은 token/recipe 체계에서 관리한다. 외부 editor/picker 등의 appearance는 wrapper adapter가 정규화한다. token generator/lock 검사와 실제 화면 테스트를 함께 사용한다. 문서·코드·긴 URL·모바일·focus·invalid 상태에서 스타일이 유지되어야 한다. 기존 W01–W27은 화면 ID로 보존하고 새 FE-*는 구현 작업 ID로 사용하여 충돌하지 않게 한다. [S14]

## 카드

<!-- GENERATED:TASKS:FE:START -->

### FE-01 · Paper/Dark 토큰·공통 UI·상태 gallery

**구간:** P0 · **상태:** IMPLEMENTED · **선행:** BASE-02

**화면:** W01, W26

**구현 범위:** 다크 기준선의 tokens/themes/lock/recipes를 보존하고 Button/Field/Check/Select/Dialog/Notice/Status/Card/Table/layout wrapper를 기능에 맞게 검증한다. page는 배치만 맡고 appearance는 recipe를 사용한다.

**입출력·데이터·코드 계약:** 위치: packages/ui, design-system. theme system/light/dark 선호와 초기 적용을 유지한다. 새 브랜드/색 체계는 도입하지 않는다.

**필수 반례·검증:** light/dark/system, FOUC, focus/invalid/busy/disabled/readOnly 조합, keyboard dialog, forced-colors, reduced-motion, 긴 한글·URL, 좁은 viewport.

**완료 기준:** 실제 React 상태 gallery와 회귀 screenshot을 갖고 페이지별 임의 CSS가 검사에서 걸린다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-01.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-02 · 편집기·폼·HTTP 계약 spike

**구간:** P0 · **상태:** PLANNED · **선행:** FE-01, BASE-03

**화면:** W13, W14

**구현 범위:** Tiptap JSON과 block ID, source reference node, 한글 IME 입력을 작은 editor로 시험한다. React Hook Form+Zod 폼 경계, typed client+TanStack Query, 오류 표시를 시험한다.

**입출력·데이터·코드 계약:** 산출물: editor-schema 계약, EditorAdapter, typed-client demo. 무료 코어 기능으로 시작하고 유료 cloud/협업 기능은 필수로 두지 않는다. rich text와 raw capture editor는 동일 입력기로 강제하지 않는다.

**필수 반례·검증:** 한글 조합 중 Enter, 붙여넣기·잘라내기·undo/redo·block split/merge ID, schema serialize/deserialize, 출처 anchor 변경, form 서버 오류.

**완료 기준:** 문서 저장 포맷과 ID 유지/재검토 규칙이 고정되고 기존 Markdown 자료의 변환·export 손실 범위가 문서화된다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-02.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-03 · 앱 shell·라우팅·서버 상태·권한 표시

**구간:** P2 · **상태:** PLANNED · **선행:** FE-01, BE-04

**화면:** W04, W23, W26

**구현 범위:** React/Vite+React Router에 app providers, auth bootstrap, shell, error route를 구성한다. server state는 TanStack Query, 필터는 URL, 편집은 feature state, modal은 local state로 나눈다.

**입출력·데이터·코드 계약:** 위치: apps/web/src/{app,pages,features,entities,shared}. query key에 user/workspace 포함; logout/account change 시 abort·cache clear. 메뉴는 실제 capability만 표시.

**필수 반례·검증:** 직접 URL 접근, 새로고침, 만료 세션, 다른 사용자 로그인, 오래된 응답 도착, 뒤로가기, 모바일 navigation, forbidden route.

**완료 기준:** 이전 사용자의 본문이 새 세션에서 한 프레임도 노출되지 않는 흐름을 검사한다. UI 권한은 서버 권한의 대체가 아니다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-03.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-04 · 로그인·초대·MFA·복구·세션 관리

**구간:** P2 · **상태:** PLANNED · **선행:** FE-03, BE-04

**화면:** W01, W02, W03, W26

**구현 범위:** 로그인/초대 수락/개인 공간 첫 설정/MFA/복구/기기별 세션·철회를 실제 API로 연결한다. mail 미설정/기능 비활성 상태를 정확히 설명한다.

**입출력·데이터·코드 계약:** 화면: W01/W02/W03/W26. 비밀번호 manager·붙여넣기 지원, OTP 자동 제출 금지, secret 단회 노출과 재발급 안내, 민감 동작 재인증.

**필수 반례·검증:** 오류·rate limit·초대 만료/사용됨·MFA 중단·복구 코드 재사용·세션 철회·키보드/모바일·로그아웃 cache 정리.

**완료 기준:** 계정 생성부터 로그인·복구·철회까지 사용자가 막힘 없이 수행하고 계정 정보를 localStorage 권한 근거로 저장하지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-04.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-05 · 기록함·원문·출처·수동 단위 분할

**구간:** P3 · **상태:** PLANNED · **선행:** FE-03, BE-07

**화면:** W05, W06

**구현 범위:** 기록 작성/목록/필터/상세/revision history, 출처 metadata, 단위 선택·수동 분할을 구현한다. 저장 상태와 향후 분석 상태는 별도 표시한다. 서버 DTO를 명시적인 view model로 변환한다.

**입출력·데이터·코드 계약:** 화면: W05/W06. feature capture-editor와 capture-query를 분리; 단위 ID와 revision을 payload에 명시. 목록은 cursor pagination.

**필수 반례·검증:** 빈 목록/빈 검색/긴 원문·URL/한글 IME/저장 오류/동시 수정/분할 span/route 변경 미저장 보호/저장 성공 후 분석 미실행.

**완료 기준:** 새 기록과 이전 원문 revision을 다시 확인할 수 있고 실패 시 사용자의 입력이 사라지지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-05.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-06 · 맥락 상세·다중 연결·관계 탐색

**구간:** P3 · **상태:** PLANNED · **선행:** FE-05, BE-08

**화면:** W10

**구현 범위:** 맥락 생성/목적·범위 편집/종류/보관, member 목록, 다중 소속/primary 선택, 관계 편집을 구현한다. 그래프 없이도 목록·상세로 전체 동작을 제공한다.

**입출력·데이터·코드 계약:** 화면: W10. context-detail과 membership-editor feature; 의미적 SUPPORTS와 단순 membership 표시를 구분한다.

**필수 반례·검증:** primary 없음/변경/중복, 두 context 연결, 삭제·보관 대상, 잘못된 parent, 긴 제목, 모바일에서 관계 목록 탐색.

**완료 기준:** 맥락이 이름뿐인 태그가 아니라 함께 보는 목적과 자료를 관리하는 공간으로 동작한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-06.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-07 · 할일·기한·상태·결과 기록

**구간:** P3 · **상태:** PLANNED · **선행:** FE-05, BE-09

**화면:** W07

**구현 범위:** 할일 목록/필터/상세/날짜형·시각형 기한, 완료/보류/재개/취소, 결과를 새 기록으로 남기는 UX를 구현한다. 바뀐 필드만 command로 전송한다.

**입출력·데이터·코드 계약:** 화면: W07/W06. optimistic 상태는 서버 실패 시 되돌리고 중복 클릭을 차단한다. 결과 기록과 완료 여부는 사용자가 별도로 결정할 수 있다.

**필수 반례·검증:** 빠른 연속 완료, 실패 rollback, 기한 보존, 목록 필터 뒤 복귀, Core OFF, 결과 저장 재시도, 모바일 터치와 키보드.

**완료 기준:** 원문→할일→결과 기록을 이어서 사용할 수 있고 화면 상태와 서버 상태가 일치한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-07.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-08 · 일정 목록·월 보기·시간대 편집

**구간:** P3 · **상태:** PLANNED · **선행:** FE-03, BE-10

**화면:** W08

**구현 범위:** 모바일 agenda와 데스크톱 월간 보기, 일정 등록/상세/변경/취소를 구현한다. 일정 UI adapter에서 시간대·종일·겹침을 정규화한다. 단순 폼+목록만 만든 것을 최종 calendar로 표시하지 않는다.

**입출력·데이터·코드 계약:** 화면: W08. 월 grid는 read projection이고 실제 event 상태는 API가 소유. drag-and-drop은 필수 아님; 날짜와 instant 입력을 다른 form model로 유지한다.

**필수 반례·검증:** 종일 하루/여러 날, 오늘과 선택일, timezone 변경, DST 모호한 입력, 겹치는 일정, 월 경계, narrow·keyboard 대안.

**완료 기준:** 등록·변경·취소가 두 보기 모두 반영되고 사용자가 저장될 시간대를 분명히 이해한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-08.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-09 · 위키·autosave·충돌·역링크

**구간:** P3 · **상태:** PLANNED · **선행:** FE-02, FE-03, BE-11

**화면:** W09, W13, W14

**구현 범위:** 위키 목록/편집/보기/내부 링크·역링크를 구현한다. draft state machine은 clean/dirty/saving/saved/conflict/error/session-expired이며 한 번에 한 save와 최신 pending buffer를 관리한다.

**입출력·데이터·코드 계약:** 화면: W09/W13/W14. useDocumentDraft는 query cache와 분리하고 composition 중 autosave/Enter 처리를 제어한다. 충돌에는 서버본/내본/공통기준을 보존한다.

**필수 반례·검증:** 응답 역전, 저장 도중 타이핑, IME, 두 탭, 세션 만료 후 같은 사용자 재인증, 명시적 logout 삭제, 새로고침 미저장 경고, editor destroy.

**완료 기준:** 충돌 시 조용히 덮어쓰지 않으며 저장 성공은 서버 receipt 기준이다. 문서 단계에서 같은 draft 엔진을 재사용한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-09.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-10 · 홈·기록→행동→지식의 연결

**구간:** P3 · **상태:** PLANNED · **선행:** FE-05, FE-06, FE-07, FE-08, FE-09

**화면:** W04

**구현 범위:** 최근 기록·진행할 일·다가오는 일정·정리 중 위키를 실제 데이터로 조립한다. 카드 수치를 보여주는 것보다 다음 행동과 출처로 이동하는 흐름을 우선한다.

**입출력·데이터·코드 계약:** 화면: W04. dashboard는 다른 feature의 내부 상태를 복제하지 않고 scoped read query 또는 합의된 query를 사용한다. 부분 조회 실패는 해당 영역에만 표시.

**필수 반례·검증:** 처음 빈 공간, 일부 API 실패, Core disabled, 완료 결과로 이동, 긴 제목, 모바일 순서, stale 데이터 상태.

**완료 기준:** 첫 개인 사용 흐름을 홈에서 시작·재개할 수 있고 데모 숫자/가짜 완료율이 없다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-10.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-11 · 통합 검색·필터·원문 이동

**구간:** P4 · **상태:** PLANNED · **선행:** FE-03, BE-26

**화면:** W11

**구현 범위:** 검색 query/type/date/context 필터를 URL에 저장하고 결과 snippet·종류·출처·상태를 표시한다. 통합 검색과 추천 후보 화면의 목적을 분리한다.

**입출력·데이터·코드 계약:** 화면: W11. debounce/AbortSignal, 한글 composition, stale 요청 무시, cursor pagination. raw HTML highlight를 직접 주입하지 않는다.

**필수 반례·검증:** IME Enter, 쿼리 급변, 빈/부분 실패, 긴 query, 잘못된 cursor, 삭제한 자료, account change, highlight XSS.

**완료 기준:** 결과 선택이 정확한 resource/revision 화면으로 이동하고 접근할 수 없는 결과 개수가 새지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-11.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-12 · 판단 상태·후보·근거·제안함

**구간:** P4 · **상태:** PLANNED · **선행:** FE-05, FE-06, BE-13

**화면:** W15, W06

**구현 범위:** 기록별 queued/running/failed/abstained/done, 후보별 근거·보류 이유·상대 순위를 표시한다. 제안 수락/거절/닫기/새로 판단을 분리하고 exposure를 적절한 노출 시점에 기록한다.

**입출력·데이터·코드 계약:** 화면: W15/W06. observe 후보를 확정 추천으로 장식하지 않는다. rankScore에 % 정확도 라벨 금지. policy/engine profile과 오래된 근거를 확인 가능하게 한다.

**필수 반례·검증:** 모델 offline, missing source, no candidates, 다중 적합, stale accept409, 중복 클릭, 화면 미노출 후보의 feedback 없음.

**완료 기준:** 왜 제안했는지 보고 실제 변경 대상을 확인한 후 적용할 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-12.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-13 · 추출 후보 편집·중복 비교·승인

**구간:** P4 · **상태:** PLANNED · **선행:** FE-12, BE-14

**화면:** W06, W15

**구현 범위:** 할일/일정/단위 추출 후보를 원문 옆에 보여주고 제목·시간대·기한·대상을 수정 후 승인한다. 기존 항목과 중복 가능성을 비교한다.

**입출력·데이터·코드 계약:** 화면: W06/W15, 필요시 inline 또는 sheet. unresolved 필드는 사용자가 채우기 전 승인 비활성. 승인 결과 task/event 링크를 제공.

**필수 반례·검증:** 상대 날짜·timezone 미확정, 기존 완료 task, 선택 승인/부분 실패, stale 원문, 빠른 재시도, 거절 후 재노출.

**완료 기준:** 원문에서 관리 항목으로 이어지는 절차가 안전하며 자동 생성으로 오해되지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-13.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-14 · 구조 before/after·bridge·충돌·Undo

**구간:** P5 · **상태:** PLANNED · **선행:** FE-06, FE-12, BE-15

**화면:** W10, W15

**구현 범위:** 유지/연결/상위 묶음/분리/병합 대안, 변경 전후 소속, bridge, primary 및 과거 출처 영향을 표시한다. 승인·기각과 역변경 preview를 제공한다.

**입출력·데이터·코드 계약:** 화면: W10/W15 확장. 그래프는 선택 보조이며 목록 diff로 모든 변경을 검토할 수 있어야 한다. 이후 변경 때문에 Undo가 막히면 충돌 범위를 보여준다.

**필수 반례·검증:** 두 그룹 공통 member, 큰 변경 목록, stale preview, 새로운 기록 후 Undo, 키보드 검토, mobile before/after 탭, 일부만 적용된 것처럼 보이지 않음.

**완료 기준:** 사용자가 묶기/나누기 판단과 되돌리기 한계를 이해하고 실제 구조 변경을 수행할 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-14.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-15 · 문서 작업실·자료 선택·관점·claim

**구간:** P6 · **상태:** PLANNED · **선행:** FE-09, BE-16

**화면:** W12, W13, W14

**구현 범위:** 문서 목록·목적/독자 선택·evidence pack·outline·편집기·source panel을 구성한다. block/claim별 근거, 반론, 내 해석과 미확인 상태를 표시한다.

**입출력·데이터·코드 계약:** 화면: W12/W13/W14. wiki와 article은 공통 draft 엔진을 쓰되 작성 workflow는 분리한다. 모바일은 편집/자료 탭으로 전환.

**필수 반례·검증:** 출처 수정/삭제, 같은 원문 재인용, outline 변경, block 복사·분리 후 claim 재검토, 긴 문서, 세션 만료, source 없는 작성자 주장.

**완료 기준:** 경험과 외부 자료를 비교한 통찰 문서를 수동으로 완성하고 각 부분의 출처를 추적할 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-15.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-16 · 모델 정제·부분 적용·검토 diff

**구간:** P6 · **상태:** PLANNED · **선행:** FE-15, BE-17

**화면:** W13, W15

**구현 범위:** 문장 정제/개요/초안 생성의 범위와 전송 자료를 확인하고 job 상태·취소·비용 정보를 표시한다. 결과는 현재 draft와 diff로 비교해 선택 적용한다.

**입출력·데이터·코드 계약:** 화면: W13/W15. 서버가 검증한 claim 상태와 사용자 의미 검토를 별도로 표시. 생성 도중 편집한 최신 draft를 자동 교체하지 않는다.

**필수 반례·검증:** provider timeout, invalid output, 근거 없는 문장, 생성 중 사용자의 편집, 일부 단락 적용, source prompt injection, 네트워크 오류 후 재조회.

**완료 기준:** 모델이 도움을 주되 원문/초안/검토 권한을 빼앗지 않으며 비활성 상태에서도 작업실은 완결된다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-16.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-17 · 파일·검증 상태·사용처·공개 선택

**구간:** P6 · **상태:** PLANNED · **선행:** FE-03, BE-18

**화면:** W19

**구현 범위:** 파일 선택/업로드/검증/실패/재시도/사용처·다운로드를 구현한다. 공개 원본이 아니라 공개 파생물 preview와 metadata 경고를 보여준다.

**입출력·데이터·코드 계약:** 화면: W19, 문서 source panel에 연결. PENDING은 사용 불가 상태로 분명히 표시. drag 외 기본 file input 제공.

**필수 반례·검증:** 용량 초과, 잘못된 형식, 업로드 중 이탈, 중복 파일, 검증 실패, 세션 만료, 긴 파일명, keyboard, 공개 metadata 확인.

**완료 기준:** 사용자가 어떤 파일이 보관되고 어떤 부분이 공개되는지 구분한다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-17.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-18 · 발행 검토·공개본·개정·Delivery 설정

**구간:** P7 · **상태:** PLANNED · **선행:** FE-15, FE-17, BE-19, BE-20

**화면:** W16, W17, W18

**구현 범위:** 공개 manifest checklist, 실제 공개 preview, 재인증, 발행/개정/철회, 공개본과 draft 차이, slug/alias, API client/credential 관리 화면을 구현한다.

**입출력·데이터·코드 계약:** 화면: W16/W17/W18. READY와 PUBLISHED를 같은 상태로 표시하지 않는다. credential은 발급 시 한 번만 보여주고 브라우저용 public API key처럼 안내하지 않는다.

**필수 반례·검증:** 검토 뒤 draft 변경, asset 변경, stale review, 중복 발행, 철회 후 external consumer 확인, key 회전/폐기, 복사 실패, private source 유출.

**완료 기준:** 문서 편집→검토→발행→개정→철회를 사용자가 완료하고 외부 소비자는 승인된 version만 받는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-18.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-19 · 이식·휴지통·삭제 영향

**구간:** P8 · **상태:** PLANNED · **선행:** FE-03, BE-21, BE-22

**화면:** W20, W21

**구현 범위:** Import dry-run/중복 비교/적용 진행/오류 목록, Export 생성/다운로드/만료, 휴지통/복원/영구삭제 영향 화면을 각각의 feature로 구현한다.

**입출력·데이터·코드 계약:** 화면: W20/W21. 커밋은 import, export, trash로 나눈다. 전체 성공·부분 성공·실패를 구분하고 purge는 대상과 영향 확인 및 재인증을 요구한다.

**필수 반례·검증:** 부분 실패, 같은 import 반복, export 만료/다른 계정, 복원 충돌, source가 사라지는 문서, 삭제 중 취소/재시도.

**완료 기준:** 사용자가 자신의 데이터를 안전하게 이동·삭제하고 남는 범위를 알 수 있다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-19.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-20 · 회원·권한·로그·작업·운영·설정

**구간:** P8 · **상태:** PLANNED · **선행:** FE-03, BE-23, BE-24

**화면:** W22, W23, W24, W25, W26, W27

**구현 범위:** 계정 초대·정지, 실제 capability 읽기, 마스킹 로그, job 상태·retry/cancel, provider 설정됨 여부, 백업과 최근 복원 증거를 표시한다. 화면별 feature와 commit으로 나눈다.

**입출력·데이터·코드 계약:** 화면: W22/W23/W24/W25/W26/W27. 공유 grant 편집은 미지원으로 표시; operator가 본문이나 secret을 볼 수 있는 링크를 만들지 않는다.

**필수 반례·검증:** 마지막 operator, 권한 부족, 로그 민감값, 진행률 미상, stale health, 실패 backup/성공 backup but restore 미검증, 모바일 표 대안.

**완료 기준:** 운영에 필요한 상태와 실패 원인이 실제 backend 결과와 일치하고 미지원 기능은 활성 버튼으로 남지 않는다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-20.md`. 테스트 작성과 실제 실행을 구분한다.

### FE-21 · 전체 화면 상태·접근성·한글 회귀

**구간:** P9 · **상태:** PLANNED · **선행:** FE-10, FE-11, FE-13, FE-14, FE-16, FE-18, FE-19, FE-20

**구현 범위:** W01–W27 전체의 loading/empty/error/forbidden/stale/conflict/offline/busy를 실제 기능 기준으로 점검한다. Paper/Dark·키보드·좁은 화면·IME·긴 내용·focus 복귀와 unsaved draft 수명을 확인한다.

**입출력·데이터·코드 계약:** 산출물: screen-coverage.json, Playwright traces/screenshots, keyboard manual review, UI debt 목록. 전체 앱에 새 global store나 별도 디자인 체계를 추가하지 않는다.

**필수 반례·검증:** 모든 주요 사용자 시나리오 두 테마, 입력 조합, dialog focus, reduced motion/forced colors, route 전환, 모바일 입력, cache/초안 개인정보 흔적.

**완료 기준:** 디자인 gallery 통과가 아니라 실제 업무 화면의 상태와 오류 경로가 검증되었다.

**이번 카드 제외:** 이 카드가 요구하지 않는 후속 기능과 빈 모듈을 미리 만들지 않는다.

**완료 시 남길 증거:** 기능 ID가 있는 commit, 실제 명령·exit code·환경, 반례 결과, 실패·미검증 범위와 `docs/evidence/fe-21.md`. 테스트 작성과 실제 실행을 구분한다.

<!-- GENERATED:TASKS:FE:END -->
