# 작업 인덱스 · 자동 생성

정본은 [backlog.json](backlog.json)이다. `node scripts/plan/render.mjs`로 갱신한다.

| ID | 구간 | 상태 | 기능 | 선행 |
|---|---|---|---|---|
| BASE-01 | P0 | VERIFIED | 기준선·문서 우선순위·재사용 판정 확정 | 없음 |
| BASE-02 | P0 | VERIFIED | 최소 workspace·실행·검사 기반 | BASE-01 |
| BASE-03 | P0 | VERIFIED | 도메인·HTTP·편집기 계약과 의존 방향 | BASE-02 |
| CORE-01 | P1 | VERIFIED | 원본·단위·맥락·근거 타입과 불변식 | BASE-03 |
| CORE-02 | P1 | VERIFIED | 시점·권한 범위가 고정된 snapshot | CORE-01 |
| CORE-03 | P1 | VERIFIED | 한국어·식별자 lexical 기준선 | CORE-02 |
| CORE-04 | P1 | VERIFIED | 후보 검색·원본별 중복 제거·예산 | CORE-03 |
| CORE-05 | P1 | VERIFIED | 점수·가용성·보류·설명 엔진 | CORE-04 |
| CORE-06 | P1 | VERIFIED | 파일 Replay·실행 이력·수동 피드백 | CORE-05 |
| CORE-07 | P1 | VERIFIED | 평가 데이터·라벨·메트릭·반례 | CORE-06 |
| CORE-08 | P1 | PLANNED | 모델 없는 evidence pack | CORE-01, CORE-06 |
| CORE-09 | P4 | PLANNED | 고정 embedding과 exact semantic 검색 | CORE-07 |
| CORE-10 | P4 | PLANNED | hybrid·정책 보정·추천 활성화 | CORE-09, CORE-05 |
| CORE-11 | P4 | PLANNED | 자유 기록에서 관리 항목 추출 계약 | CORE-08, CORE-10 |
| CORE-12 | P5 | PLANNED | 맥락의 구조 진단 | CORE-09 |
| CORE-13 | P5 | PLANNED | 분리·병합·상위 묶음 변경안 | CORE-12 |
| CORE-14 | P6 | PLANNED | 문서 목적·관점·개요·readiness | CORE-08 |
| CORE-15 | P6 | PLANNED | 모델 초안·claim map 검증 | CORE-14, CORE-11 |
| CORE-16 | P9 | PLANNED | 실제 판단·정리 효용 최종 평가 | CORE-10, CORE-13, CORE-15, FE-14, FE-16 |
| BE-01 | P0 | PLANNED | NestJS + Fastify 통합과 composition root | BASE-02 |
| BE-02 | P0 | PLANNED | 인증 adapter의 실제 호환성 검증 | BE-01, BASE-03 |
| BE-03 | P2 | PLANNED | PostgreSQL migration·소유 범위·RLS | BE-02 |
| BE-04 | P2 | PLANNED | 계정·개인 공간·초대·세션·복구 | BE-03 |
| BE-05 | P2 | PLANNED | 업무 명령·멱등성·충돌·감사 | BE-04, BASE-03 |
| BE-06 | P4 | PLANNED | pg-boss worker·transactional outbox | BE-05 |
| BE-07 | P3 | PLANNED | Capture·원본 revision·ThoughtUnit | BE-05, CORE-01 |
| BE-08 | P3 | PLANNED | Context·다중 소속·관계·대표 맥락 | BE-07 |
| BE-09 | P3 | PLANNED | 할일·상태 전이·결과 기록 | BE-07, BE-08 |
| BE-10 | P3 | PLANNED | 일정·시간대·종일·변경·취소 | BE-05, BE-07 |
| BE-11 | P3 | PLANNED | 위키·문서 공통 draft/revision 엔진 | BE-05, FE-02 |
| BE-12 | P4 | PLANNED | snapshot builder·profile·판단 job 연결 | BE-06, BE-07, BE-08, CORE-06 |
| BE-13 | P4 | PLANNED | 제안·노출·피드백·승인 적용 | BE-12, BE-05, CORE-05 |
| BE-14 | P4 | PLANNED | 추출 후보 승인→업무 항목 생성 | BE-13, BE-09, BE-10, CORE-11 |
| BE-15 | P5 | PLANNED | 구조 변경의 원자적 적용과 역변경 | BE-13, BE-08, CORE-13 |
| BE-16 | P6 | PLANNED | 자료 묶음·출처 고정·문서 작업실 | BE-11, BE-07, BE-08, CORE-14 |
| BE-17 | P6 | PLANNED | 선택적 모델 정제 adapter·비용·실패 격리 | BE-16, BE-06, CORE-15 |
| BE-18 | P6 | PLANNED | 비공개 첨부·안전 검증·공개 파생물 | BE-05, BE-11, BE-06 |
| BE-19 | P7 | PLANNED | 봉인·검토·발행·개정·철회 | BE-16, BE-18, BE-05 |
| BE-20 | P7 | PLANNED | Delivery 전용 API·읽기 권한·클라이언트 | BE-19, BASE-03 |
| BE-21 | P8 | PLANNED | 개인 Import/Export·dry-run·중복 처리 | BE-07, BE-11, BE-18, BE-06 |
| BE-22 | P8 | PLANNED | 휴지통·복원·삭제 영향·영구 삭제 | BE-07, BE-08, BE-11, BE-18, BE-19 |
| BE-23 | P8 | PLANNED | 운영·계정 관리·작업·설정·알림 | BE-04, BE-06, BE-20 |
| BE-24 | P8 | PLANNED | 배포·백업·복원·migration 복구 | BE-21, BE-22, BE-23 |
| BE-25 | P9 | PLANNED | 성능·관측·병목 최적화 | BE-12, BE-20, BE-24 |
| BE-26 | P4 | PLANNED | 통합 검색·필터·안전한 read model | BE-07, BE-08, BE-09, BE-10, BE-11, CORE-04 |
| FE-01 | P0 | PLANNED | Paper/Dark 토큰·공통 UI·상태 gallery | BASE-02 |
| FE-02 | P0 | PLANNED | 편집기·폼·HTTP 계약 spike | FE-01, BASE-03 |
| FE-03 | P2 | PLANNED | 앱 shell·라우팅·서버 상태·권한 표시 | FE-01, BE-04 |
| FE-04 | P2 | PLANNED | 로그인·초대·MFA·복구·세션 관리 | FE-03, BE-04 |
| FE-05 | P3 | PLANNED | 기록함·원문·출처·수동 단위 분할 | FE-03, BE-07 |
| FE-06 | P3 | PLANNED | 맥락 상세·다중 연결·관계 탐색 | FE-05, BE-08 |
| FE-07 | P3 | PLANNED | 할일·기한·상태·결과 기록 | FE-05, BE-09 |
| FE-08 | P3 | PLANNED | 일정 목록·월 보기·시간대 편집 | FE-03, BE-10 |
| FE-09 | P3 | PLANNED | 위키·autosave·충돌·역링크 | FE-02, FE-03, BE-11 |
| FE-10 | P3 | PLANNED | 홈·기록→행동→지식의 연결 | FE-05, FE-06, FE-07, FE-08, FE-09 |
| FE-11 | P4 | PLANNED | 통합 검색·필터·원문 이동 | FE-03, BE-26 |
| FE-12 | P4 | PLANNED | 판단 상태·후보·근거·제안함 | FE-05, FE-06, BE-13 |
| FE-13 | P4 | PLANNED | 추출 후보 편집·중복 비교·승인 | FE-12, BE-14 |
| FE-14 | P5 | PLANNED | 구조 before/after·bridge·충돌·Undo | FE-06, FE-12, BE-15 |
| FE-15 | P6 | PLANNED | 문서 작업실·자료 선택·관점·claim | FE-09, BE-16 |
| FE-16 | P6 | PLANNED | 모델 정제·부분 적용·검토 diff | FE-15, BE-17 |
| FE-17 | P6 | PLANNED | 파일·검증 상태·사용처·공개 선택 | FE-03, BE-18 |
| FE-18 | P7 | PLANNED | 발행 검토·공개본·개정·Delivery 설정 | FE-15, FE-17, BE-19, BE-20 |
| FE-19 | P8 | PLANNED | 이식·휴지통·삭제 영향 | FE-03, BE-21, BE-22 |
| FE-20 | P8 | PLANNED | 회원·권한·로그·작업·운영·설정 | FE-03, BE-23, BE-24 |
| FE-21 | P9 | PLANNED | 전체 화면 상태·접근성·한글 회귀 | FE-10, FE-11, FE-13, FE-14, FE-16, FE-18, FE-19, FE-20 |
| QA-01 | P0 | PLANNED | 의존성·계약·디자인 CI 차단 | BASE-03, BE-02, FE-02 |
| QA-02 | P1 | PLANNED | Core Lab 재현성·누수 반례 gate | CORE-06, CORE-07, CORE-08 |
| QA-03 | P2 | PLANNED | 인증·두 사용자·transaction gate | QA-01, BE-03, BE-04, BE-05, FE-04 |
| QA-04 | P3 | PLANNED | Core OFF 기본 개인 관리 E2E | FE-10, BE-09, BE-10, BE-11, QA-03 |
| QA-05 | P4 | PLANNED | 비동기 판단·추출·오류 격리 gate | BE-06, BE-12, BE-13, BE-14, FE-12, FE-13 |
| QA-06 | P6 | PLANNED | 구조·근거·문서 정제 gate | BE-15, BE-16, BE-17, FE-14, FE-15, FE-16 |
| QA-07 | P7 | PLANNED | 공개 경계·개정·철회·외부 소비자 gate | BE-19, BE-20, FE-18 |
| QA-08 | P8 | PLANNED | 실제 이식·삭제·복원·운영 gate | BE-21, BE-22, BE-24, FE-19, FE-20 |
| QA-09 | P9 | PLANNED | 최초 컨셉 종단 인수·릴리스 판정 | QA-01, QA-02, QA-04, QA-05, QA-06, QA-07, QA-08, CORE-16, BE-25, FE-21 |
