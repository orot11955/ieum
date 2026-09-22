# 컴포넌트 · 상태 · 예외 계약

- 기준: Paper Terminal 1.0.0. 색·크기는 토큰 정본을 따른다.
- 목표 UI API 타입: `design-system/component-contracts.ts`. React 구현은 아직 없다.

## 1. 겹친 상태의 우선순위

권한/데이터 존재는 먼저 렌더링 범위를 결정한다. 권한 없는 본문을 흐릿하게 처리해 숨기지 않는다. disabled/busy는 activation을 막고 hover/pressed를 적용하지 않는다. validation 오류는 테두리+메시지로, focus-visible은 별도의 검정 outline으로 동시에 표시한다. selected는 배경/체크/aria 속성으로 표시하고 성공 상태로 해석하지 않는다.

readOnly는 읽고 선택·복사할 수 있는 상태다. disabled처럼 탭 순서에서 빼거나 문자를 흐리게 하지 않는다. async stale/offline/conflict와 입력 invalid도 다르며 하나의 `error=true`에 모두 넣지 않는다.

| 상태 조합 | 시각·행동 |
| --- | --- |
| 기본 + hover | 마우스 hover 지원 환경에서만 배경/경계 변경 |
| selected + hover | 선택 체크와 선택 배경 보존; hover가 선택을 지우지 않음 |
| invalid + focus | 빨간 오류 테두리 + 검정 3px 외곽 focus + 오류 문장 |
| readOnly + focus | 회색 면, 정상 문자·복사·focus. 수정만 금지 |
| disabled | 배경/문자 전용 토큰, 반복 activation 없음, 이유는 항상 읽을 수 있게 |
| busy + focus | 현재 focus 유지, aria-busy/aria-disabled, 중복 요청 차단, 결과는 polite announcement |
| stale + selected | 선택은 유지하되 source/version 재검토 안내; 자동 새 자료 교체 없음 |
| permission denied | 내용 미표시, 안전한 오류/이동 경로. 단순 disabled 스타일로 위장하지 않음 |

CSS의 `aria-disabled`는 클릭을 실제로 막지 않는다. 실제 컴포넌트에서 click/keyboard 명령을 차단해야 한다. `aria-busy` 역시 mutation 중복 방지 로직을 대신하지 않는다.

## 2. 기본 컴포넌트 계약

| 컴포넌트 | variant / states | 필수 행동과 금지 |
| --- | --- | --- |
| Button/IconButton | primary/secondary/danger/ghost; enabled/disabled/busy | 의미 있는 label, 최소 target, 명시 type. disabled 이유를 hover tooltip에만 두지 않음 |
| Field/Textarea/Select | editable/readonly/disabled + invalid | label 항상 존재, error/help id 연결, placeholder로 label 대체 금지 |
| Checkbox/Radio/Switch | off/on/mixed(checkbox) | 가능한 native semantics, label 전체 target. 색 외 체크/문구 |
| Chip | display/filter/removable | 정보 chip은 버튼 아님. filter aria-pressed; 제거 버튼에 이름+target |
| Tabs | selected/focus/disabled | 화면 링크와 role=tab을 혼동하지 않음. 방향키/Home/End/Enter 정책 통일 |
| Card | static/link/action group | 클릭 불가능한 카드에 hover elevation 없음. 중첩 버튼을 전체 카드 링크로 감싸지 않음 |
| Table/List | sorted/selected/empty/loading/partial/error | caption/headers, checkbox 선택, 안정적 row key. 목록 카드의 핵심 정보 유지 |
| Dialog/Sheet | open/dirty/busy/confirm | focus 초기/contain/복원, Escape, 접근 가능한 제목. destructive 기본 focus는 취소 |
| Menu/Popover/Tooltip | open/keyboard/touch | hover만으로 필수 내용 제공 금지; collision/portal은 공통 구현 |
| Alert/Toast | info/success/warning/danger/neutral | 의미 문장+아이콘. 입력 오류는 폼 근처에도 남김. toast만으로 실패 설명 금지 |
| StatusBadge | task/job/document/publication/security 각각 매핑 | PUBLISHED가 진실 확인이라는 뜻 아님. 모든 상태에 형광 초록 금지 |
| Progress/Skeleton | known/unknown; reduced-motion | 미상 진척에 가짜 80% 금지. skeleton은 정적·읽기 UI 대체가 아님 |
| Editor/Diff | dirty/saving/saved/conflict/offline/invalid-source | 입력 보존, 원문 refs 구분. diff에 +/−/문구, 색만 사용하지 않음 |
| Date/Calendar | today/selected/range/disabled/timed/all-day | 오늘 윤곽과 선택을 구분. 키보드/모바일 목록 대안 |
| Upload/Asset | queued/checking/verified/rejected | drag 외 파일 버튼, 검증 전 공개 금지, file type/size reason |
| Empty/Error | first-use/no-results/forbidden/404/offline/partial | 원인별 다른 문구와 회복 동작. 모두 동일 빈 박스로 표시하지 않음 |

탭과 dialog 행동은 [APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)를 기준으로 검증한다. ARIA 속성만 달았다고 키보드 행동이 자동 생기는 것은 아니다. 표본 HTML은 native dialog+명시적 Tab wrap을 시연하며 제품 wrapper의 완성본은 아니다.

## 3. 업무 의미 매핑

- 제안함: candidate/abstain은 중립, 근거 부족은 설명, stale은 warning, 처리 실패만 danger. rankScore에 따라 초록 배지를 자동 부여하지 않는다.
- 문서: 저장 상태와 공개 상태는 다른 badge. draft 수정 중에도 공개 r2 유지 표시. READY는 특정 manifest의 검토 상태다.
- 권한/회원: SUSPENDED/DELETION_PENDING은 원인과 제한을 문장으로 표현한다. Operator 표시가 개인 콘텐츠 Owner와 같아 보이지 않게 한다.
- 작업/운영: 모델 중단은 보조 기능 상태이고 전체 시스템 failure와 다르다. backup success와 restore tested도 별도 지표다.
- 일정: overdue/오늘/선택일/완료를 다른 구조로 표현한다. 접근성 텍스트에 실제 날짜와 시간대가 있어야 한다.

## 4. 긴 콘텐츠·입력·모바일

한국어/일본어 IME composition 중 Enter로 검색/저장/태그 추가를 실행하지 않는다. compositionend 뒤 validation/자동저장을 재개하고 오래된 응답이 최신 편집을 덮어쓰지 않게 한다. OTP는 복잡한 여섯 칸 분할보다 paste 가능한 한 필드를 우선한다. 로그인/복구의 password manager·autocomplete·붙여넣기를 차단하지 않는다.

긴 제목/번역/파일명/ID는 wrap 또는 copy 가능한 상세를 제공한다. 말줄임한 정보를 hover만으로 복구하지 않는다. 코드·표만 내부 스크롤, prose는 자연스러운 줄바꿈, 긴 URL은 anywhere wrap을 허용한다. 다국어 때문에 고정 높이를 넘으면 높이가 늘어나야 한다.

touch는 hover 효과/tooltip을 필수 경로로 쓰지 않는다. 모바일 source panel은 본문 아래/details/접근 가능한 sheet 중 공통 패턴을 선택한다. save bar는 키보드와 safe-area를 고려한다. 날짜 필드의 native appearance가 OS마다 다름을 인정하고 별도 picker 구현 시 동작/시각 테스트를 추가한다.

## 5. 구현 중 일관성을 유지하는 방법

공통 wrapper가 `intent/tone/density/state`를 받게 하고 `color/radius/shadow/fontSize`를 화면에서 임의로 넘기는 API는 두지 않는다. 외부 에디터/날짜선택기/toast를 도입하면 전용 adapter에서 이 토큰으로 theme를 덮으며 공급자 기본 파란색/둥근 pill/그림자를 그대로 섞지 않는다.

페이지 CSS는 배치 중심이다. layout 수치가 필요하면 먼저 semantic layout token/공통 primitive를 찾는다. virtualized row/drag 좌표/실제 progress 같은 런타임 geometry만 리뷰된 CSS variable exception으로 허용하며 시각 색/폰트 override로 확장하지 않는다.

W01–W27 전체 매핑은 `design-system/screen-matrix.json`이 기준이다. 화면마다 최소 basic, loading, empty, error, permission, relevant conflict/offline/stale와 narrow/keyboard 상태를 갖춘다. 지원하지 않는 상태를 성공 화면으로 위장하지 않는다.

## 6. 상태 갤러리와 검사

제공한 HTML은 컴포넌트 갤러리+W01 로그인+W13 문서+W24 이력의 네 표본이다. 27개 화면 전체를 새 스타일로 구현했다는 뜻은 아니다. 프레임워크 UI wrapper를 만든 뒤 이 표본을 기준으로 각 상태 fixture를 Storybook 또는 동일 수준의 UI gallery에 옮긴다.

필수 gate: static token check, semantic contrast pairs, keyboard focus, invalid+focus, disabled vs readonly, loading duplicate, dialog focus restoration, 320px reflow, 200% text, reduced motion, forced colors, 한글 조합 입력, screenshot regression. 색·UI 검사가 인증/권한/데이터 무결성 검사를 대신하지 않는다.
