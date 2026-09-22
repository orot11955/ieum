# ADR 0010 · Paper Terminal 디자인 고정과 구현 착수 경계

- Status: Accepted for UI implementation
- Date: 2026-09-22

사용자가 제공한 크림 바탕·검정 문자·형광 초록·각진 컨트롤 컨셉을 IEUM 내부 UI의 정본으로 채택한다. 기존 파란 요약 이미지/화면 시연은 시각 기준을 제공하지 않는다. 화면 흐름과 데이터 모델은 기존 계약을 유지한다.

원본은 `design-system/ieum.tokens.json`이며 semantic/component alias와 공통 recipe를 통해 사용한다. 값·state·screen mapping은 1.0.0 lock으로 고정한다. 생성 CSS/TS는 직접 수정하지 않는다. 새 요구는 의미 토큰과 상태 계약을 함께 바꾸고 테스트·version·lock을 검토한다.

작은 텍스트·흐릿한 컨트롤 경계·초록만의 focus·모든 성공 상태의 형광 초록을 그대로 복제하지 않는다. 한국어 본문16px, 일반44px/터치48px 최소 높이, 별도 오류·성공·선택 상태, 고대비/모션 감소/모바일 경계를 둔다. v1 다크 모드는 제공하지 않는다. 외부 블로그는 API 규약만 공유하며 내부 UI 디자인을 강제하지 않는다.

token 검사와 source guard, 반례 테스트, CI workflow를 제공한다. branch protection은 별도이며, scanner만으로 모든 CSS/JSX 변형과 접근성을 보장하지 않는다. 제품 UI wrapper와 AST lint/시각 회귀가 구현 완료 조건이다.

최종 판단은 **첫 제품 기반 구현 GO, 공개 운영 NO-GO**다. 실제 auth 통합·Workspace 격리·DB/발행 제약은 구현 중 검증해야 한다. 기존 I00/I01 순서의 실행 기반 문제와 I07 편집→I10 충돌 처리 순서를 보완한다. 최신 진입점은 [S0–S5 구현 판단](../plan/final-implementation-readiness.md)이며 기존 I00–I14를 삭제하지 않고 구체화한다. Core 연구 지시는 여전히 M0/M1이다.

이번 변경은 디자인 자산/검사/설계 문서 작업이다. 제품 React 앱·관리 API·migration·서비스 배포를 수행하지 않았다.
