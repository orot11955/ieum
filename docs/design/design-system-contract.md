> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# IEUM Paper Terminal · 디자인 계약 1.0.0

- 상태: **내부 관리 웹의 시각 기준을 고정**. 제품 React 컴포넌트 구현/전체 접근성 인증 완료는 아님.
- 기준: 2026-09-22 사용자가 첨부한 PRODUCT UI STYLEGUIDE 이미지.
- 정본: `design-system/ieum.tokens.json` → `scripts/design/build.mjs` → `tokens.css`, `ui.css`, `tokens.ts`.
- 의미/동작 계약: `component-state-contract.md`, `screen-matrix.json`. 이전 파란색 시연/요약 이미지의 색·둥근 카드보다 이 계약을 우선한다. W01–W27의 업무 흐름과 ERD는 유지한다.

## 1. 유지할 감각과 수정할 부분

크림색 종이 바탕, 거의 검정인 문자, 각진 컨트롤, 명확한 테두리, blur 없는 작은 offset shadow, 제한된 형광 초록을 유지한다. 글 읽기/기록이 중심이므로 종이 질감 이미지·움직이는 grid·큰 그림자·과도한 bevel·모든 카드의 녹색 배경은 사용하지 않는다.

표본 이미지의 작은 1/3/6/10px 문자는 UI 글자 크기로 복제하지 않는다. 흰 바탕 위 형광 초록 글씨와 초록만으로 그린 focus ring도 사용하지 않는다. 원본 이미지의 정확한 픽셀 추출이 아니라 컨셉을 제품 접근성에 맞게 해석한 값이다.

v1은 `paper-light` 하나다. 운영체제 dark 설정을 임의 역상으로 적용하지 않고 다크 테마 선택 UI도 열지 않는다. 향후 다크 모드는 모든 상태·대비·에디터·차트를 함께 검증한 별도 버전이다. 고대비(강제 색상)는 사용자 환경을 존중하며 light 테마의 변형으로 억지 고정하지 않는다.

## 2. 핵심 토큰

| 용도 | 고정값 | 사용 제한 |
| --- | --- | --- |
| canvas | `#F4F0E5` | 앱 전체 크림색 바탕 |
| panel | `#FFFCF4` | 글·폼·카드의 읽기 면 |
| subtle | `#F0F0F0` | 헤더·보조 면·읽기 전용 |
| text | `#111111` | 본문/주요 문자 |
| secondary text | `#595959` | 설명·날짜·부가 메타 |
| interactive border | `#666666` | 입력·선택 컨트롤 식별 |
| strong border/focus | `#111111` | 핵심 경계와 포커스 |
| decorative rule | `#CCCCCC` | 장식/행 구분만. 필수 컨트롤 경계로 쓰지 않음 |
| primary | `#00FF00` | 주요 행동 또는 현재 탐색 선택, 검정 문자와 조합 |
| primary hover / pressed | `#00E600` / `#00CC00` | 실제 활성 상태에서만 |
| selected surface | `#E3FFDA` | 선택 행/필터; 현재 위치와 구별 |
| danger | `#A32020` | 오류·파괴적 행동, 공개 상태와 구별 |
| warning | `#704900` / `#FFF1C9` | 주의·출처 stale·충돌 |
| success | `#236329` / `#EEF6EA` | 완료 결과; 형광 초록과 구별 |
| info | `#2D476B` / `#EDF1F6` | 정보·처리 상태, 브랜드 primary 대체 금지 |

한 작업 영역에는 주요 행동 버튼 하나를 기본으로 둔다. 선택된 내비게이션은 위치 표시이므로 별도로 허용한다. 버튼이 여러 개라는 이유로 모두 형광 초록을 쓰지 않는다. 링크는 검정+밑줄이며 색만으로 링크를 구별하지 않는다.

일반 텍스트는 4.5:1 이상, 식별에 필요한 컨트롤 경계/아이콘 등은 3:1 이상을 목표로 쌍별 검사한다. 모든 비활성 컨트롤에 WCAG 대비 요구가 적용되는 것은 아니지만 이음은 비활성 이유를 읽을 수 있게 유지한다. 초록 위 검정은 별도 대비 검사에 포함하며 흰색 버튼 문자를 허용하지 않는다. 이 기준은 [WCAG 텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)와 [비텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)를 참고한다.

## 3. 글자·크기·간격

본문은 1rem(기본 16px), label 0.875rem(14px), 도움말 0.8125rem(13px), 부가 caption 0.75rem(12px), section 1.25rem(20px), heading 1.75rem(28px)이다. 오류·기한·권한 같은 필수 정보는 12px 이하로 줄이지 않는다. root 폰트는 100%이며 사용자 글자 확대를 차단하지 않는다. 모바일 입력은 최소 1rem이다.

본문 행간 1.5, 읽기 문서 1.75, 제목 1.3을 사용한다. display 2.5rem/900은 IEUM 단어형 브랜드/짧은 표지에만 사용한다. 본문 전체를 pixel/monospace로 만들지 않는다. 시스템 한국어 sans stack과 ID/코드용 mono stack을 제공한다. 폰트 파일과 외부 font CDN은 이 패키지에 포함하지 않는다. 특정 폰트로 픽셀 단위 시각 회귀를 고정할 때는 라이선스·버전·플랫폼 시험을 별도로 수행한다.

간격은 4px 기반 `0,4,8,12,16,20,24,32,40,48,64`이다. border는 1/2/3px, radius는 사각 0/컨트롤 2/카드 4px다. 999px는 avatar에만 허용하고 칩·탭·버튼을 pill로 만들지 않는다. shadow는 (2,2), (4,4), (6,6) offset과 blur 0으로 제한한다. 정적인 모든 카드에 그림자를 달지 않고 버튼·popover·dialog에 선택적으로 사용한다.

기본 버튼·입력은 최소 높이 44px, 작은 화면/터치 포인터는 48px다. 조밀한 desktop 테이블에만 36px compact를 허용하고 글자는 작게 줄이지 않는다. target size의 WCAG 2.2 AA 기본 기준은 24 CSS px와 예외 조건이며, 44/48px는 그보다 여유 있게 정한 **제품 기준**이다. [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

## 4. 레이아웃·반응형

breakpoint는 40rem/64rem이며 CSS media query에는 custom property를 직접 쓰지 않는다. 생성기가 토큰에서 숫자를 읽어 `recipes.css.in`의 placeholder를 컴파일한다. 다른 화면에서 임의 713px breakpoint를 추가하지 않는다.

wide는 내비게이션+작업면+선택적 source panel, 중간은 source panel을 아래로, 좁은 화면은 단열로 둔다. 고정 폭 사이드바를 모바일에 그대로 두지 않는다. 문서 읽기 면은 최대 44rem, 앱 작업면은 필요에 따라 넓힐 수 있다. 긴 코드/표/달력만 영역 내부 스크롤을 허용하고 본문 전체 가로 넘침은 금지한다.

320 CSS px, 390, 768, 1440 폭을 공통 테스트 지점으로 사용한다. 200% 텍스트 확대·400% zoom에 해당하는 reflow는 실제 제품에서도 추가 검사한다. 버튼/대화상자 고정 높이로 다국어 긴 텍스트를 자르지 않는다. 모바일 키보드·safe-area·고정 저장 bar가 focus와 필수 동작을 덮지 않아야 한다. [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)

## 5. 레이어·움직임·특수 환경

z-index 계층은 base 0/sticky 10/popover 30/overlay 40/dialog 50/toast 60이다. 개별 화면에서 9999를 추가하지 않는다. native dialog/top layer는 수치 z-index보다 별도로 동작하므로 dialog 내 picker/popover/알림은 해당 modal tree 또는 같은 관리 portal 경계에 둔다. 바깥 toast가 modal에 가려졌다면 z-index만 올려 해결하지 않는다.

기본 전환은 색상 변화 100ms, 일반 160ms, 긴 전환의 상한 초안 240ms다. 모션 감소 환경에서는 시간을 0으로 하고 이동/깜빡임/shimmer를 끈다. 강제 색상에서는 시스템 Canvas/ButtonText/Highlight/LinkText를 사용하고 box-shadow 없이도 경계·선택·포커스가 남는다. `forced-color-adjust:none`을 전체 앱에 적용하지 않는다.

print는 개인 메뉴·작업 버튼·불필요한 장식을 제외하고 검정 문자/흰 배경을 사용한다. 인쇄·export는 접근 권한과 공개 승인을 우회하는 발행 수단이 아니다.

## 6. 토큰의 계층과 변경 규칙

`primitive → semantic → component → 공유 UI wrapper → 화면`의 방향이다. primitive는 팔레트/숫자, semantic은 사용 의미, component는 구체 recipe다. 모든 semantic/component 토큰은 alias로 두고 누락/순환/타입 불일치를 검사한다. 페이지는 semantic/component만 소비하며 primitive·임의 hex·px·inline appearance·Tailwind 임의값을 사용하지 않는다.

JSON은 DTCG 2025.10의 color/dimension/duration/number/fontFamily/fontWeight/cubicBezier/shadow와 whole-token alias를 사용한다. 동봉 생성기는 그 **제한된 부분집합만** 지원하며 범용 DTCG 처리기 또는 모든 외부 디자인 도구와 호환된다고 주장하지 않는다. DTCG 문서는 Community Group Report이며 W3C Recommendation이라는 의미는 아니다. [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/)

`baseline.lock.json`은 원본 토큰·recipe·상태/화면 계약의 hash를 고정한다. `build`는 lock을 자동 갱신하지 않는다. 무단 값 변경은 check 실패다. 승인된 변경은 변경 이유/영향 화면/대비·상태 검사와 버전 갱신 후 lock을 함께 수정한다. patch는 기존 의미를 유지하는 접근성/명백한 오류 수정, minor는 additive 토큰/variant, major는 기존 값·의미·기본 theme/density/크기의 전반적 변경 기준이다.

수정은 디자인 담당 변경 묶음 하나가 소유한다. FE worker마다 같은 Button을 따로 만들거나 lock만 새로 찍어서 규칙을 우회하지 않는다. 이미 승인된 token을 같은 의미의 이름으로 다시 만드는 것도 금지한다. 예외는 정확한 file/rule/reason/review/expires를 정책에 기록하고 다음 공유 컴포넌트 개선으로 회수한다.

## 7. 강제 수준과 한계

실제 제공: 원본 JSON, 해시 lock, CSS/TS 생성, 대비 쌍 검사, 27개 화면 매핑 검사, 소스 guard와 반례 테스트, CI workflow. 생성 파일은 Git에서 직접 편집하지 않고 build로 만든다. ZIP에는 바로 열 수 있는 결과물을 포함한다.

guard는 간단한 source scanner이며 동적으로 조립한 class/CSS나 모든 CSS AST를 완전히 검증하지 않는다. 제품 FE 기반에서 shared UI wrapper와 AST 기반 lint/Storybook 또는 동등한 state gallery/시각 회귀를 연결하는 것을 I-UI gate로 둔다. 프로젝트 기능 파일이 아직 없다면 scanned files=0은 정상이고 **제품 전체의 일관성이 검증되었다는 뜻이 아니다**.

CI 작업을 제공하는 것과 main의 required check/branch protection을 설정하는 것은 다르다. 저장소 관리 설정을 변경하지 않았으므로 관리자가 required check를 켜야 merge 차단까지 강제된다. 최종 외부 블로그는 별도 디자인을 가질 수 있으며 Delivery 본문에 이음 내부 클래스/색상/토큰을 강요하지 않는다.
