# 서버 착수 전 API·와이어프레임 재점검

2026-09-23 KST. 기준: `docs/plan/backlog.json`, `docs/plan/05-data-api-and-state-contracts.md`, `docs/design/wireframes.md`, `docs/plan/04-web-plan.md`. 이 문서는 구현 순서 판단이며 완료된 제품 화면이나 업무 API의 검증 결과가 아니다.

## 경계 대조

| 경계 | 화면·상태 요구 | 실행 결정 |
| --- | --- | --- |
| 관리 API `/api/v1/workspaces/{wid}` | W04–W15 등의 개인 자료·명령. 권한, baseVersion, 충돌, 오류 상태가 화면에 필요 | controller는 DTO를 application command로 옮기고, actor/workspace는 신뢰된 서버 문맥에서 채운다. BE-01에서 업무 endpoint를 선행 생성하지 않는다. |
| 인증 `/api/auth/*` 및 `/me` | W01–W03/W26의 로그인·초대·MFA·복구·세션 관리 | Better Auth native handler의 쿠키·CSRF·철회·MFA를 BE-02에서 실제 DB로 검증한다. 로그인 전 화면의 개인 메뉴는 HTML 시연용이며 제품 노출 요구가 아니다. |
| 운영 liveness `/health/live` | 화면 메뉴가 아닌 API 프로세스 생존 확인 | BE-01의 무상태 공개 경로로 둔다. 계정·DB 준비 상태나 인증 성공을 뜻하지 않는다. 오류는 `application/problem+json`과 서버 생성 request ID로 답한다. |
| Delivery `/delivery/v1` | W16–W18은 검토·발행·공개본·클라이언트를 구분 | 관리 DTO/원문과 분리된 projection으로 BE-20에서 구현한다. BE-01에 공개 글 라우트를 만들지 않는다. |

## 화면 계약의 충돌·보류

| 화면 | 확인 결과 | 처리 |
| --- | --- | --- |
| W13 | 와이어프레임의 “본문 · Markdown”과 FE-02의 Tiptap JSON 저장 계약이 다른 형식처럼 보였다. | 와이어프레임은 “본문 · 편집기”로 수정했다. FE-02가 실제 JSON schema와 Markdown import/export 손실 범위를 고정한다. |
| W14 | 서버 409/currentVersion만으로 미저장 입력 보존·두 버전 비교가 완성되지 않는다. | BE-11의 draft/baseVersion과 FE-09의 로컬 draft 수명·충돌 화면을 함께 검증한다. 자동 병합이나 자동 원문 교체는 계약에 없다. |
| W16 | READY와 PUBLISHED가 같은 상태처럼 취급되면 검토 뒤 본문·첨부 변경을 놓친다. | BE-19의 sealed revision/manifest 확인과 최근 재인증을 W16의 필수 입력으로 유지한다. |
| W04 | 홈은 여러 기능의 부분 실패가 가능한 조합 화면이다. | 인증·개인 공간과 실제 자료 API가 생기기 전 빈 dashboard 전용 응답을 만들지 않는다. FE-10에서 scoped read와 부분 오류를 검증한다. |

사용자의 “서버부터” 지시는 P0의 BE-01→BE-02 진행 순서에 적용한다. 이후에는 카드 선행관계에 맞춰 편집기·웹 계약과 세로 기능 검증을 다시 연결한다. BE-01 착수에 남은 API/화면 계약 차단 사항은 없다. 인증 adapter, DB 물리 schema, 편집기 포맷의 실제 검증은 각 후속 카드의 완료 조건이다.
