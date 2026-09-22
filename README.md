# IEUM · 이음

**일정·생각·경험·외부지식을 기록하고 정리하여 개인의 일정·할일·위키를 관리하고, 축적된 자료에서 통찰이 담긴 문서를 만들어 발행하는 개인 관리 웹·앱.**

이음에는 내부 프론트엔드와 관리 백엔드가 있다. Judgement Core는 일부 정리·연결·구조화·파생 판단만 맡는다. 외부 독자용 블로그는 별도이며 Delivery API의 승인된 발행본을 표시한다. Core 실패가 명시적 저장·편집·완료·발행 명령을 막아서는 안 된다.

## 최신 상태 · 2026-09-22

**Paper Terminal 1.0.0 디자인을 고정했다. 구현 착수 판단은 S0 기반 개발 GO, 공개 운영 NO-GO다.** 제품 React 앱·인증·API·DB migration은 아직 없다. 실행 가능한 디자인 token 생성·검사 도구와 네 화면 표본은 제공한다.

사용자가 제시한 크림색 종이, 검정 문자, 형광 초록 행동, 각진 컨트롤을 내부 UI 기준으로 삼는다. 이전 파란색 시연·요약 이미지보다 이 기준을 우선한다. W01–W27의 업무 흐름과 기존 ERD는 유지한다. 외부 블로그에 내부 UI 스타일을 강제하지 않는다.

### 먼저 읽기

| 문서 | 목적 |
| --- | --- |
| [디자인 자산과 실행 명령](design-system/README.md) | 원본 JSON, 생성 CSS/TS, 고정 lock, 표본 HTML |
| [디자인 계약](docs/design/design-system-contract.md) | 색·글자·간격·포커스·반응형·변경 규칙 |
| [컴포넌트와 상태](docs/design/component-state-contract.md) | 겹친 상태, 모바일·IME·충돌·권한·외부 UI adapter |
| [최종 구현 착수 판단](docs/plan/final-implementation-readiness.md) | S0–S5의 수정된 실행 순서와 시작/공개 gate |
| [실제 검사와 보완](docs/review/ui-freeze-readiness-review-2026-09-22.md) | 실행한 디자인/표본 검사와 미검증 범위 |

디자인은 247개 토큰, 31개 대비 검사 쌍, W01–W27 상태 매핑을 갖는다. 이는 제품 전체의 접근성·보안 검증을 뜻하지 않는다. 원본 hash와 생성 결과를 검사하며, Git에서는 생성 파일을 직접 편집하지 않는다. 독립 HTML·생성 CSS/TS·검사 결과·PNG는 동반 전달 패키지에도 포함한다.

```bash
node scripts/design/build.mjs
node --test scripts/design/test.mjs
node scripts/design/check.mjs
```

위 명령은 실제 제공한다. 디자인 도구는 Node 22 이상, 제품 runtime 계획은 Node 24다. 제품 web build·공유 React wrapper·AST lint·시각 회귀 연결은 S0 작업이다. CI workflow를 추가했지만 required check/branch protection은 별도 설정이며 자동으로 변경하지 않았다.

## 제품과 상세 설계

`기록 → 원본·출처 보존 → 일정·할일·위키·맥락 관리 → 실행 결과·경험 → 문서 정제 → 검토 버전 발행 → Delivery API → 별도 블로그`의 흐름이다. 통합 기록 풀은 하나의 거대한 테이블을 뜻하지 않는다. 원문 수정이 완료 상태나 기존 공개본을 자동 덮어쓰지 않는다.

| 영역 | 문서 |
| --- | --- |
| 제품 범위 | [목적](docs/product/vision-and-scope.md), [웹 기능](docs/product/web-functional-spec.md), [앱·Core·발행 경계](docs/architecture/application-and-publishing.md) |
| 웹 기반 | [인증·권한](docs/architecture/identity-and-access.md), [웹 구조](docs/architecture/web-application-design.md), [데이터·운영](docs/architecture/data-and-operations.md) |
| 화면·데이터 | [설계 시작점](docs/design/README.md), [와이어프레임](docs/design/wireframes.md), [ERD](docs/design/erd.md), [schema 제약](docs/design/schema-contracts.md) |
| 이전 검토 | [제로베이스](docs/review/zero-base-review-2026-09-22.md), [화면·ERD 누락 R01–R18](docs/review/wireframe-erd-review-2026-09-22.md) |
| 판단 | [Core](docs/architecture/judgement-core.md), [도메인](docs/architecture/domain-model.md), [검색·점수](docs/architecture/retrieval-and-scoring.md), [구조·파생](docs/architecture/structure-and-derivation.md), [성능](docs/architecture/runtime-and-performance.md) |
| 구현 | [Core Lab](docs/plan/core-lab-experiment-plan.md), [웹 상위 계획](docs/plan/web-product-implementation-plan.md), [I00–I14 백로그](docs/plan/implementation-backlog.md), [최신 S0–S5](docs/plan/final-implementation-readiness.md), [AGENTS](AGENTS.md) |

27개 화면과 66개 논리 엔터티·141개 FK는 전체 제품의 설계 범위다. vendor 인증 테이블과 실제 연결·revision까지 포함한 수이며 한 번에 migration하거나 화면 stub을 모두 만들지 않는다. 실제 인증 어댑터의 schema는 S1 통합 시험에서 대응시킨다.

## 구현 순서와 범위

제품 구현을 요청받으면 **S0 최소 실행·디자인 기반 → S1 인증 통합 → S2 계정·개인 공간 → S3 기록·행동·위키 → S4 자료·정제 → S5 공개 API**를 따른다. S0/S1은 이전 I01/I00의 선행 관계를 구체화했고, 위키의 자동저장·충돌은 I07부터 구현한다. 검토만 요청한 상태에서 제품 구현·배포를 자동 실행하지 않는다.

Core만 연구하라는 요청은 기존 M0/M1 CLI 실험을 따른다. 초기 운영은 1인 자가 호스팅이며 확장은 초대별 개인 공간이다. 서비스 초대는 공간 공유가 아니다. Operator와 Owner, 편집과 발행, 관리 API와 Delivery를 분리한다. 공개 가입·다크 모드·협업 ACL·과금·네이티브 앱은 후속이다.

최신 시각·작업 순서의 우선순위는 [ADR 0010](docs/adr/0010-frozen-paper-terminal-design.md)을 따른다. 제품 범위 ADR 0007/0008, 관계 계약 ADR 0009와 기존 안전 원칙은 유지한다. 모든 결정: [ADR](docs/adr/).

TypeScript, PostgreSQL, React/Vite, Fastify와 같은 코드베이스 worker의 모듈형 모놀리스를 유지한다. 라이브러리·인증·RLS·공개 제약·복원은 실제 시험 후 확정한다. 개인 원문·embedding·credential·private export를 공개 저장소에 넣지 않는다. 디자인 검사와 시연은 제품 기능·보안·성능 인증이 아니다.
