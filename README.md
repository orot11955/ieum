# IEUM · 이음

**일정·생각·경험·외부지식을 기록하고 정리하여 개인의 일정·할일·위키를 관리하고, 축적된 자료에서 통찰이 담긴 문서를 만들어 발행하는 개인 관리 웹·앱.**

이음은 백엔드만 있는 서비스도, 판단 엔진만 있는 라이브러리도 아니다. 사용자가 매일 기록하고 관리하는 내부 웹·앱이 제품이며, **Judgement Core는 그중 정리·연결·구조화·파생에 필요한 일부 판단을 맡는 구성요소**다.

## 제품의 전체 흐름

```text
일정 / 생각 / 경험 / 관찰 / 외부지식 기록
  → 원본과 출처 보존
  → 개인 내부 앱에서 정리·연결·관리
      ├─ 일정과 할일
      ├─ 개인 위키·지식·경험
      └─ 프로젝트·맥락·관계
  → 여러 기록·경험·외부 관점에서 통찰 문서 작성·정제
  → 사용자가 검토한 문서 버전 발행
  → 이음 Delivery API
  → 별도로 만든 외부 블로그·공개 사이트
```

일정·할일·위키는 단순 출력 목록이나 코어 실험의 장식이 아니라 **실제 관리 기능**이다. 통합 기록에서 파생되거나 사용자가 직접 만들 수 있으며, 각각 상태와 편집 흐름을 갖는다. 캘린더·보드는 그 데이터를 보여주는 뷰다.

외부 블로그의 디자인·페이지·렌더링은 이음 밖에서 만든다. **문서 작성·정제·발행 관리와 발행본 제공 API는 이음 안에 있다.** 외부 블로그는 내부 DB나 비공개 관리 API가 아니라 명시된 Delivery API 계약을 사용한다.

## 현재 상태와 첫 검증

2026-09-22 제품 범위와 웹 기반 설계를 보완했다. 현재 저장소는 설계 단계이며 실행 가능한 Core·API·DB·내부 앱·발행 API와 실측 벤치마크는 아직 없다. 기술 선택·보존 기간·보안 정책·수치는 구현 계획 또는 잠정 운영값이다.

Core Lab은 판단 가능성을 먼저 시험하는 개발 수단이다. **첫 실험을 CLI로 한다는 것이 최종 제품에 UI가 없다는 뜻은 아니다.** 첫 작업은 파일 기반 M0/M1, 다음은 의미 검색 비교이며, 제품 구현에서는 내부 관리 웹과 발행 API를 명시적인 산출물로 둔다.

Core가 없거나 멈춰도 기록 저장, 일정 편집, 할일 완료, 위키·문서 수동 작성과 권한 검증을 거친 발행 명령은 작동하도록 설계한다. 추천 품질이 검증되어야 하는 것은 자동화이지 기본적인 개인 관리 기능의 존재가 아니다.

## 기본 웹과 운영 기능

제품에는 로그인·복구·MFA·기기별 세션, 초대형 회원 관리, 개인 Workspace와 권한, 글 자동저장·버전·검토, 통합 검색, 첨부·데이터 이식·휴지통, 로그·작업·백업·설정이 포함된다. 상세 기능 ID와 완료 조건은 [웹 기능 명세](docs/product/web-functional-spec.md)를 따른다.

초기 운영안은 1인 자가 호스팅이며 여러 계정은 초대로 확장한다. 계정마다 별도의 개인 공간을 두고 운영자 권한과 콘텐츠 소유권을 분리한다. 공개 가입·공동 편집·과금 SaaS는 첫 제품 범위 밖이다. 계정 초대는 다른 사람의 개인 기록을 공유하는 동작이 아니다.

제품 구현은 M3-A/F(웹·인증·권한·감사), M3-B/P(기록·일정·할일·위키·데이터), M4/D(문서 정제·검토), M5/R(발행·Delivery)로 구체화했다. 인증 라이브러리는 통합·보안 시험 후 고정하며, API 예시와 보안 요구를 구현 완료로 표시하지 않는다.

## 문서 지도

### 제품과 웹 구현

| 문서 | 책임 |
| --- | --- |
| [제품 목적과 범위](docs/product/vision-and-scope.md) | 제품 요구, 사용자 흐름, 최종 제품과 실험 범위 |
| [웹 기능 명세](docs/product/web-functional-spec.md) | 화면, 로그인·회원·글·데이터·권한·로그와 추가 기능의 완료 조건 |
| [내부 앱·코어·발행 경계](docs/architecture/application-and-publishing.md) | 내부 관리와 외부 블로그, 공개본과 Delivery API |
| [인증·회원·권한](docs/architecture/identity-and-access.md) | 계정과 Workspace, 운영자 분리, 세션·MFA, 권한 matrix와 격리 |
| [웹 애플리케이션 구조](docs/architecture/web-application-design.md) | 프론트 상태·컴포넌트, 업무 모듈, 요청 순서, DB·API 계약 |
| [데이터·로그·운영](docs/architecture/data-and-operations.md) | 파일, Import/Export, 휴지통, 로그, job, 백업·복원, 설정 |
| [웹 제품 구현 계획](docs/plan/web-product-implementation-plan.md) | F/P/D/R 단계, 릴리스 gate, 웹 기반 최초 구현 지시 |

### 판단 실험과 공통 도메인

| 문서 | 책임 |
| --- | --- |
| [제로베이스 검토](docs/review/zero-base-review-2026-09-22.md) | 판단 알고리즘의 유지·수정·폐기 이유 |
| [Judgement Core](docs/architecture/judgement-core.md) | 판단 파이프라인과 계산 코어의 책임 |
| [기록·판단 도메인](docs/architecture/domain-model.md) | 원본, revision, 연결, 승인·취소, 출처 |
| [후보 검색·점수](docs/architecture/retrieval-and-scoring.md) | 가중치 실험, 결측, 보류, 피드백 |
| [구조·파생](docs/architecture/structure-and-derivation.md) | 분리·병합, 근거 묶음, 문서 정제와 문장별 출처 |
| [런타임·성능](docs/architecture/runtime-and-performance.md) | Core/Lab 스택, 측정 범위와 지연 예산 |
| [실험·제품 상위 계획](docs/plan/core-lab-experiment-plan.md) | M0/M1 최초 실험과 M2~M5 전체 단계 |
| [AGENTS.md](AGENTS.md) | 구현 에이전트의 범위·불변식·검증 규칙 |

### 문서 범위를 읽는 기준

제품 범위는 제품 목적, 앱·발행 경계, ADR 0007을 따른다. 웹 기반의 구체 계약은 웹 기능 명세와 인증·웹 구조·데이터 운영 문서 및 ADR 0008이 보완한다. 새 웹 계획은 기존 M3/M4/M5를 상세화하며 M0/M1의 기본 작업 범위를 바꾸지 않는다.

Core/Lab 문서의 엔터티 목록은 제품 전체의 완성된 데이터 모델이 아니다. 기존 검토의 UI/발행 제외와 런타임 문서의 선택적 Lab UI는 첫 판단 실험에만 적용한다. 실제 웹의 인증·내부 UI·문서 편집·승인 발행·Delivery API를 생략하는 규칙으로 사용하지 않는다.

설계 결정:
[PostgreSQL](docs/adr/0001-use-postgresql.md) ·
[순수 TS 계산 코어](docs/adr/0002-pure-typescript-core.md) ·
[승인 후 의미 변경](docs/adr/0003-no-semantic-auto-execute.md) ·
[시점 기반 Replay](docs/adr/0004-replay-first-experimentation.md) ·
[대체된 AI 일괄 배제](docs/adr/0005-no-ai-in-v1.md) ·
[초기 의미 검색 비교](docs/adr/0006-early-semantic-experiments.md) ·
[개인 앱과 발행 경계](docs/adr/0007-personal-app-with-judgement-and-delivery.md) ·
[웹 기반과 데이터 격리](docs/adr/0008-web-foundation-and-isolation.md)

## 기술·품질 원칙

TypeScript 중심과 PostgreSQL 운영 저장소를 유지한다. Core Lab은 Node.js·pnpm·Vitest·JSONL로 시작한다. 제품은 React/Vite 내부 웹, Fastify API, 같은 코드베이스 worker의 모듈형 모놀리스로 설계한다. 정확한 패키지 버전과 호환성은 구현 때 확인·고정한다. 처음부터 별도 네이티브 앱·여러 microservice·분산 broker를 요구하지 않는다.

rankScore는 정렬 점수이지 정답 확률이 아니다. 원본과 정제본, 개인 자료와 공개본, 사용자 명령과 추론 제안을 분리한다. 실제 대화·개인 기록·임베딩·인증정보를 공개 저장소에 커밋하지 않는다. 문서의 예시·API 경로·정책값은 별도 표시가 없으면 설계안이며 실측·구현·보안 인증 완료를 뜻하지 않는다.
