# IEUM 구현 작업 규칙

## 현재 작업 정책

- **main에서 직접 작업한다. 새 브랜치·PR을 만들지 않는다.** 원격 main을 force 이동하거나 hard reset, 사용자 미커밋 변경 덮어쓰기, 과거 제품 패치 전체 재적용을 하지 않는다.
- **계획 2.0(ADR 0014) 개인 관리 우선:** 이음은 본인이 매일 쓰는 개인 관리 웹앱이다. 판단 Core는 제거됐다. 다음 작업은 [계획](docs/plan/README.md)의 마일스톤 순서(M1 앱 기반과 로그인부터)를 따른다. 문서 작업실·모델 초안·첨부·발행·Delivery는 동결이고, 개인 데이터 이식(BE-21)은 중단 상태다.
- 상태 요약은 docs/status/project-state.md 한 곳에만 둔다. 이 파일과 README·계획에 상태 목록을 반복하지 않는다. 문서/정리 요청만으로 제품 기능이나 DB/배포를 변경하지 않는다.
- 작업 전 git status·원격 main·`npm run prep:check`를 확인한다. main이 변경됐다면 diff를 재검토하고 사용자 변경을 보존한다.

## 반드시 읽을 정본

README → docs/status/project-state.md → docs/plan/README.md → 해당 영역의 docs/architecture·docs/design 계약.

우선순위: 사용자 최신 지시 → 이 파일 → ADR 0014 → 계획 2.0 → 보존된 제품/도메인/디자인 계약. ADR 0012·0013과 그 이전의 실행 순서, 카드 체계, Core 실험 방향은 역사 기록이며 적용하지 않는다. 새 계획도 원본·권한·출처·공개 안전 불변식을 약화하지 않는다.

## 범위와 의존 방향

이음은 개인 관리 웹과 백엔드다. 기록(원문·출처)·맥락·할일·일정·위키가 현재 범위다. 외부 블로그 화면은 별도다. 지능 보조(비슷한 기록, 자연어 추출)는 실사용에서 필요가 확인될 때 PostgreSQL 검색에 임베딩·LLM 호출을 얇게 붙인다. 자체 판단 엔진, 평가 Lab, 합성 품질 지표를 다시 만들지 않는다.

Backend: controller → backend 기능 모듈. controller는 HTTP 변환·인증 문맥만 다루고 SQL·transaction을 갖지 않는다. port/infrastructure 분리는 provider·파일 저장소·clock처럼 교체·격리가 필요한 경계에 둔다. 1,000줄을 넘는 소스 파일은 수정할 때 기능 단위로 나눈다. API/worker는 업무 package를 재사용한다. ORM row를 HTTP 타입으로 노출하지 않는다. generic Repository/Service 프레임워크를 만들지 않는다.

Web: app은 조립, pages는 화면 조합, features는 사용자 동작·미저장 편집, entities는 query key/서버 상태, shared는 기술 공통이다. query cache·폼 draft·URL 필터·local modal을 구분한다. 모든 상태를 전역 store 또는 page hook 하나에 넣지 않는다. 프론트 권한 표시는 보조이고 최종 검사는 서버다.

필요한 패키지·테이블·화면만 해당 마일스톤에서 만든다. 빈 화면·가짜 provider·미래 기능용 모듈을 미리 만들지 않는다. 미래 명령을 실행 가능한 것처럼 README에 올리지 않는다.

## 보존해야 할 불변식

1. 원문과 불변 revision/span을 보존한다. 정규화·요약이 원문을 덮어쓰지 않는다. 사용자 삭제 권리와 과거 출처 경고는 별도로 관리한다.
2. Unit은 여러 Context에 연결되며 primary는 선택이고 최대 하나다. SUPERSEDED Context는 단일 후속(`superseded_by_id`)을 가진다.
3. 의미 변경은 명시적 사용자 명령으로만 적용한다. 현재 revision·권한을 검증하고 변경·감사·receipt·outbox를 원자적으로 저장한다.
4. 외부 provider 장애가 기록 저장·할일 완료·일정 변경·위키 편집을 막지 않는다. 외부 호출 중 DB transaction을 붙잡지 않는다.
5. Task·Event·Document는 독립 수명을 가진다. 원문 수정으로 완료 상태나 기존 발행본을 덮어쓰지 않는다. 자동저장·IME·응답 순서·충돌은 첫 편집기부터 구현한다.
6. Operator와 Owner를 구분한다. 세션·계정·공간·action·resource·재인증을 서버·DB·worker·검색·첨부·cache·export·로그에 일관되게 적용한다. 권한 밖 자료를 외부 모델에 보낸 뒤 거르는 방식은 금지한다.
7. 공개본은 검토한 revision의 허용 필드·출처·첨부 snapshot이다. Delivery에 private 원문·내부 credential이 섞이지 않는다. Draft 개정과 공개본은 독립이다.
8. export와 backup/restore를 구분한다. 운영 DB·배포는 미확인 상태이며 별도 허가·inventory·backup 없이 변경하지 않는다.

## Paper/Dark 디자인

정본: design-system/ieum.tokens.json, themes.json, lock, recipes.css.in 및 docs/design의 디자인·상태 계약. 생성 CSS/TS를 직접 수정하지 않는다. 색·반경·그림자·임의 appearance/!important·화면별 token 덮어쓰기를 금지한다. 공통 wrapper와 adapter를 사용한다.

token 수치 검사 성공을 React/브라우저 전체 접근성 통과로 보고하지 않는다. 새 상태에는 keyboard/focus/invalid/busy/disabled/readOnly/long text/IME/mobile/reduced-motion/forced-colors와 두 테마를 검증한다.

## 구현·검증·커밋

마일스톤 체크리스트의 정상·실패·충돌 사례를 먼저 정하고 필요한 코드만 구현한다. 큰 작업은 기능 단위 커밋으로 나누되 마일스톤의 필수 항목을 뒤로 미루지 않는다. 실패하는 중간 상태를 원격 main에 올리지 않는다. 커밋 메시지에 마일스톤 ID(M1 등)를 넣는다.

공유 contract·migration·lock·token·root CI는 한 번에 한 writer가 직렬로 반영한다. 한 main working tree를 여러 writer가 동시에 수정하지 않는다.

검증을 마친 main 커밋은 별도 허락 없이 `origin/main`에 fast-forward push할 수 있다. push 직전에 원격 SHA와 로컬 선행 관계를 확인한다. force push·타인 변경 덮어쓰기·실패하는 중간 상태의 push는 금지한다. 운영 배포·Migration 적용·데이터 삭제 같은 외부 변경은 별도 승인 범위다.

마일스톤을 닫을 때 실제 명령·exit code·환경·결과·미검증을 `docs/evidence/m<N>.md`에 짧게 기록한다. 구현됨과 검증됨과 사용자 인수를 구분한다. 없는 테스트를 passWithNoTests로 성공 처리하지 않는다.

현재 검사: `npm run prep:check`, `pnpm contracts:check`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm api:smoke`, `pnpm --filter @ieum/backend test:db`, `pnpm --filter @ieum/api test:identity`, `pnpm test:web`. private 원문·secret·token·prompt·export는 공개 Git이나 로그에 넣지 않는다.
