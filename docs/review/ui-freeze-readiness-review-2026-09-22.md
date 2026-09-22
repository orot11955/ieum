# UI 고정 · 최종 착수 검토 결과

- 기준 commit: `e0620a280aa6fd9f498c6f00feca47203e178f29`
- 사용자 기준: 첨부 PRODUCT UI STYLEGUIDE 이미지.
- 결과: **Paper Terminal 1.0.0 고정, 제품 기반 구현 GO, 공개 운영 NO-GO.**

## 이번에 실제로 만든 것

247개 primitive/semantic/component 토큰, 원본 hash lock, CSS/TS 생성기, 중앙 CSS recipe, UI API 타입 계약, W01–W27 상태 매핑, source guard와 반례 테스트, CI workflow, 네 화면의 브라우저 시연을 만들었다. 제품 React wrapper·인증·관리 API·DB migration은 구현하지 않았다.

다운로드 패키지에는 독립 HTML, 생성 CSS/TS, 검사 원본과 결과, PNG 표본을 포함한다. Git에는 authored source와 생성/검사 도구를 두고 생성 파일은 제외한다. 폰트 파일이나 실제 개인 데이터는 포함하지 않는다.

## 실행 결과

| 검사 | 결과 | 범위 |
| --- | --- | --- |
| token/alias/type/lock/생성 결과 | 247개, 오류 0 | 이 생성기가 지원하는 DTCG 부분집합 |
| 선언한 대비 쌍 | 31/31 통과 | 일반 텍스트 4.5, 필수 경계 3 목표 |
| 화면 계약 | W01–W27 누락 0 | 상태 매핑이며 27개 실제 UI 구현 아님 |
| Node 반례 테스트 | 18/18 통과 | raw 값·임의 style·alias/blur/type 반례 |
| 표본 reflow | 4화면 × 4폭 = 16/16 통과 | gallery/login/editor/data, 320/390/768/1440 |
| 브라우저 상태 검사 | 13/13 통과 | 아래 항목 |
| JavaScript page error | 0 | HTML 시연 |
| 제품 소스 guard 검사 파일 | 0 | 제품 경로 미구현. 제품 준수 증거 아님 |

검정 `#111111` 문자/형광 초록 `#00FF00` 버튼의 계산 대비는 13.761:1이다. 이는 색상 쌍의 검사이지 모든 UI의 WCAG 준수 판정이 아니다.

13개 상태 검사: 오류+focus, 오류+hover, dialog 초기 focus, Tab containment, Escape 뒤 focus 복원, 처리중 중복 activation 차단, 처리 완료 복귀, 모션 감소 transition 0, 모션 감소 pressed 이동 없음, 강제 색상 focus 표시, 충돌 시 입력 보존, 로그인 오류 시연, 모바일 버튼 최소 48px.

실행 환경은 Node 22.16.0, Chromium 144.0.7559.96, Debian 13이다. CI는 Node 24를 대상으로 작성했으나 이 보고서에서 원격 CI 실행 결과까지 통과했다고 주장하지 않는다. 브라우저의 file URL 탐색이 환경 정책으로 차단되어 독립 HTML을 `about:blank`에 `set_content`로 주입해 검사했다. 파일 전송·서버 라우팅·실제 로그인은 검증하지 않았다.

## 발견 후 수정한 문제

1. `.ieum-stack`의 display가 `[hidden]`을 덮는 문제를 `body [hidden]` 규칙으로 수정하고 computed visibility를 검사했다.
2. 오류 필드에서 hover가 오류 border를 지울 수 있어 hover 대상에서 invalid를 제외했다. focus outline은 별도로 유지한다.
3. 모션 감소의 낮은 specificity가 기존 transition/pressed transform을 끄지 못하는 문제를 semantic duration 및 정확한 선택자 override로 수정했다.
4. dialog의 Shift+Tab이 문서 밖으로 이동할 수 있는 시연을 보완해 내부 Tab 순환과 반환 focus를 검사했다.
5. source panel의 구분선이 flex child에서 축소되는 문제를 수정했다.

실제 제품 wrapper의 모든 조합/키보드/보조기술 검사를 대신하지 않는다. 200% 글자 확대, 실제 모바일 키보드·IME, 다양한 브라우저, screen reader, vendor editor, 전체 27개 화면의 시각 회귀는 S0 및 기능별 gate다.

## 착수 판단의 근거

제품 목적, 앱/Core/Delivery 경계, 화면과 관계 모델, 권한·운영 요구, 시각 정본이 있어 작은 기반 구현의 입력은 충분하다. 계획의 I00/I01 실행 기반 순서, 위키 편집보다 늦었던 충돌 처리, auth vendor schema와 논리 ERD의 혼동, 전체 운영 기능의 과도한 선행을 보완했다.

실행 순서는 [S0–S5](../plan/final-implementation-readiness.md)가 기준이다. S0는 최소 runtime/test harness와 실제 공유 UI wrapper, S1은 인증 통합 시험, S2는 첫 계정·개인 공간이다. Core 연구는 기존 M0/M1 트랙을 유지한다. 실제 인증·격리·RLS·발행·복원을 확인하기 전 공개 릴리스는 허용하지 않는다.

이번 판단은 개발을 시작할 수 있다는 결론이지 제품 구현/배포를 실행했다는 보고가 아니다. required CI/branch protection은 저장소 관리 설정으로 별도 확인해야 한다.
