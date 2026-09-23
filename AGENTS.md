# IEUM 구현 작업 규칙

## 현재 작업 정책

- **main에서 직접 작업한다. 새 브랜치·PR을 만들지 않는다.** 원격 main을 force 이동하거나 hard reset, 사용자 미커밋 변경 덮어쓰기, 과거 제품 패치 전체 재적용을 하지 않는다.
- BASE-02 최소 workspace/CI, BASE-03 계약 예제, CORE-01–07 원본·snapshot·검색·관찰 판단·Lab 실행/평가는 Linux 원격 CI와 로컬 검증까지 VERIFIED다. CORE-07 평가는 합성 자료에 한정된다. 다음 카드의 선행·완료 기준을 지키며 구현한다. 문서/정리 요청만으로 제품 기능이나 DB/배포를 변경하지 않는다.
- 다음 카드 전 git status·원격 main·현재 prep 검사와 선행 카드 증거를 확인한다. **다음 권장 카드는 CORE-08**이다. CORE-09·BE-01·FE-01도 각 선행 조건에 따라 착수할 수 있다. main이 변경됐다면 diff를 재검토하고 사용자 변경을 보존한다.

## 반드시 읽을 정본

README → docs/status/project-state.md → docs/plan/README.md → docs/plan/01-master-roadmap.md → docs/plan/07-codex-execution-playbook.md → 해당 영역 카드.

75개 작업 카드의 정본은 **docs/plan/backlog.json**이다. 범위·선행·완료 기준·상태를 여기서 수정하고 `node scripts/plan/render.mjs`를 실행한다. 생성 카드/목록을 독립 수정하지 않는다.

우선순위: 사용자 최신 지시 → 이 파일 → ADR 0012 → 새 실행 계획 → 보존된 제품/도메인/디자인 계약. 역사적 ADR의 변경 경위는 보존하되 옛 M/S/I 실행 순서, 다크 후속, 삭제된 브랜치로 시작하라는 지시를 적용하지 않는다. 새 계획도 원본·권한·출처·공개 안전 불변식을 약화하지 않는다.

## 범위와 의존 방향

이음은 내부 관리 웹과 백엔드를 가진 제품이다. 일정·할일·위키·맥락·문서 정제·승인 발행·Delivery가 최종 범위다. 외부 블로그 화면은 별도다. Core Lab 통과나 수동 CRUD 구현만으로 최종 완성을 선언하지 않는다.

Core: packages/core에 DB·네트워크·Nest·React·모델 SDK·실시간 clock I/O를 넣지 않는다. snapshot/config/time/seed를 주입한다. 계산과 후보 검색용 데이터 준비를 구분한다.

Backend: controller → application → domain/core, infrastructure → ports. API/worker는 업무 package를 재사용한다. ORM row를 HTTP/Core 타입으로 노출하지 않는다. Fastify 수동 라우터 거대 파일이나 generic Repository/Service 프레임워크를 만들지 않는다.

Web: app은 조립, pages는 화면 조합, features는 사용자 동작·미저장 편집, entities는 query key/서버 상태, shared는 기술 공통이다. query cache·폼 draft·URL 필터·local modal을 구분한다. 모든 상태를 전역 store 또는 page hook 하나에 넣지 않는다. 프론트 권한 표시는 보조이고 최종 검사는 서버다.

필요한 패키지/테이블/화면만 해당 카드에서 만든다. 아직 없는 66개 엔터티·27개 빈 화면·가짜 provider·새 agent harness를 선행 생성하지 않는다. 미래 명령은 실행 가능한 것처럼 README에 올리지 않는다.

## 보존해야 할 불변식

1. 원문과 불변 revision/span을 보존한다. 정규화/요약이 원문을 덮어쓰지 않는다. 사용자 삭제 권리와 과거 출처 경고는 별도 관리한다.
2. Unit은 다중 Context에 연결되며 primary는 선택적이고 최대 하나다. source origin 중복을 독립 근거로 세지 않는다.
3. 후보 검색·순위·제안/보류·대표 선택은 별개다. score/승인률을 확률이나 사실 정확도로 표시하지 않는다. missing/zero/error/미응답을 구분한다.
4. query 자신·동일 원본 파생·gold·미래 자료·권한 밖 자료가 snapshot/profile/model 입력에 누수되지 않게 한다.
5. 의미 변경은 명시적 명령 또는 승인된 Proposal만 적용한다. 실제 Unit ID/revision·모든 전제·현재 권한을 검증하고 원자적 변경/감사/receipt/outbox를 저장한다.
6. Core/provider 장애가 기록 저장·할일 완료·일정 변경·위키 편집·명시적 발행을 막지 않는다. 모델 호출 중 DB transaction을 붙잡지 않는다.
7. Task/Event/Document는 독립 수명을 가진다. 원문 수정으로 완료 상태나 기존 발행본을 덮어쓰지 않는다. 자동저장·IME·응답 순서·충돌은 첫 편집기부터 구현한다.
8. Operator와 Owner를 구분한다. 세션·계정·공간·action·resource·재인증을 서버/DB/worker/검색/첨부/cache/export/로그에 일관 적용한다. 모델에 보낸 뒤 필터링하는 방식은 금지한다.
9. 공개본은 검토한 revision/manifest의 허용 필드·출처·첨부 snapshot이다. Delivery에 private 원문·trace·내부 credentials가 섞이지 않는다. Draft 개정과 공개본은 독립이다.
10. export와 backup/restore를 구분한다. 운영 DB/배포는 미확인 상태이며 별도 허가·inventory·backup 없이 변경하지 않는다.

## Paper/Dark 디자인

정본: design-system/ieum.tokens.json, themes.json, lock, recipes.css.in 및 docs/design의 디자인/상태 계약. 생성 CSS/TS를 직접 수정하지 않는다. 색·반경·그림자·임의 appearance/!important·화면별 token 덮어쓰기를 금지한다. 공통 wrapper와 adapter를 사용한다.

보존된 UI 소스는 FE-01 검증 대상이다. token 수치 검사 성공을 React/브라우저 전체 접근성 통과로 보고하지 않는다. 새 상태에는 keyboard/focus/invalid/busy/disabled/readOnly/long text/IME/mobile/reduced-motion/forced-colors와 두 테마를 검증한다.

## 구현·검증·커밋

카드의 선행이 VERIFIED/ACCEPTED인지 확인한다. 정상·실패·충돌 반례를 먼저 정하고 필요한 코드만 구현한다. 큰 카드는 하위 기능 커밋으로 쪼개되 현재 카드의 필수 완료 기준을 후속으로 미루지 않는다. 실패 테스트만 있는 중간 상태를 원격 main에 올리지 않는다.

공유 contract/migration/lock/token/root CI는 조정자가 직렬 반영한다. 한 main working tree를 여러 writer가 동시에 수정하지 않는다. 기능별 commit에 작업 ID를 포함한다.

검증을 마친 정상적인 main 커밋은 별도 허락 없이 `origin/main`에 fast-forward push할 수 있다. push 직전에 원격 SHA와 로컬 선행 관계를 확인한다. force push·타인 변경 덮어쓰기·실패하는 중간 상태의 push는 금지한다. 운영 배포·Migration·데이터 삭제 같은 외부 변경은 별도 승인 범위다.

실제 명령/exit code/환경/결과/미검증/데이터 영향을 docs/evidence/<id>.md에 기록한다. IMPLEMENTED와 VERIFIED와 사용자 ACCEPTED를 구분한다. 없는 테스트를 passWithNoTests로 성공 처리하지 않는다. 실제 데이터 품질과 합성 fixture 결과를 구분한다.

현재 검사: `npm run prep:check`와 `pnpm contracts:check`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm lab:smoke`. 제품 DB/E2E/판단 Lab 명령은 해당 카드에서 실제 생긴 범위만 추가한다. 버전/인증/MFA/CSRF/RLS/restore는 통합 gate 전 완료로 표시하지 않는다. private 원문·embedding·secret·token·prompt·export는 공개 Git/로그에 넣지 않는다.
