# IEUM · 이음

**일정·생각·경험·외부지식을 기록하고 정리하여 개인의 일정·할일·위키를 관리하고, 축적된 자료에서 통찰이 담긴 문서를 만들어 발행하는 개인 관리 웹·앱.**

이음은 내부 프론트엔드와 관리 백엔드가 있는 제품이다. Judgement Core는 정리·연결·구조화·파생에 필요한 일부 판단을 맡는다. 외부 독자용 블로그는 별도로 만들고 이음의 Delivery API에서 승인된 발행본을 받아 표시한다.

## 현재 상태

2026-09-22 제품·웹 기반 설계에 이어 **와이어프레임·ERD·누락 검토·구현 백로그**를 구성했다. 실제 Core/API/DB/내부 앱/발행 API는 아직 구현하지 않았다. 화면 시연 검사와 논리 모델 검사는 제품 보안·기능·성능 검증과 다르다.

최신 읽기 시작점: [화면·ERD 설계 패키지](docs/design/README.md).

- W01–W27의 화면 배치, 권한·행동·엔터티 연결.
- 전체 관계 개요와 7개 상세 ERD, 66개 논리 엔터티·141개 FK 계약.
- R01–R18의 누락 보완과 실제로 남은 검증.
- I00–I14의 구현 의존성, 단계별 산출물과 release gate.

클릭형 HTML/PDF/상세 SVG/JSON/DBML과 검사·재생성 스크립트는 해당 설계 작업의 전달 패키지로 제공한다. 저장소에서는 Markdown 와이어프레임과 Mermaid 도식을 직접 검토할 수 있다. 인증/작업/버전/연결 테이블까지 합한 전체 모델을 최초 migration에 한 번에 만들지 않는다.

## 제품 흐름

```text
일정 / 생각 / 경험 / 외부자료 기록
  → 원본과 출처 보존
  → 개인 내부 앱에서 일정·할일·위키·맥락 관리
  → 실행 결과와 새 경험을 다시 기록
  → 여러 경험·외부 관점에서 문서 작성·정제
  → 검토한 특정 버전 발행
  → Delivery API
  → 별도 외부 블로그·공개 사이트
```

일정·할일·위키는 상태와 편집 흐름이 있는 실제 관리 대상이다. 캘린더·보드는 뷰이며 통합 기록 풀은 모든 데이터를 한 테이블에 넣으라는 뜻이 아니다. 원문 변경이 완료한 작업 상태를 뒤집거나 공개 글을 자동 덮어쓰지 않는다.

Core가 꺼지거나 실패해도 기록 저장, 일정 편집, 할일 완료, 위키·문서 수동 작성과 명시적 발행은 권한·도메인 검증을 거쳐 작동하도록 설계한다. 추천 품질을 검증하는 것과 기본 관리 기능의 존재를 구분한다.

## 문서 지도

### 최신 화면·데이터·구현 계약

| 문서 | 책임 |
| --- | --- |
| [화면·ERD 시작점](docs/design/README.md) | 산출물·범위·실행한 설계 검사 |
| [와이어프레임](docs/design/wireframes.md) | W01–W27, 화면 배치·사용자 경로·실패·모바일 |
| [ERD](docs/design/erd.md) | 계정·지식·실행·문서·공개·첨부·운영 관계 |
| [schema 제약](docs/design/schema-contracts.md) | 이름 통일, typed FK, 검토 manifest, publication/key/slug 수명 |
| [검토 결과](docs/review/wireframe-erd-review-2026-09-22.md) | 누락 R01–R18, 반영 사항과 미검증 범위 |
| [구현 백로그](docs/plan/implementation-backlog.md) | I00–I14, 선행 계약·완료 조건·최초 작업 지시 |

### 제품과 웹 기반

| 문서 | 책임 |
| --- | --- |
| [제품 목적](docs/product/vision-and-scope.md) | 이음의 최종 제품과 실험 범위 |
| [웹 기능 명세](docs/product/web-functional-spec.md) | 로그인·회원·글·데이터·권한·로그와 추가 기능 |
| [앱·코어·발행 경계](docs/architecture/application-and-publishing.md) | 내부 관리와 외부 블로그, 공개본 제공 |
| [인증·회원·권한](docs/architecture/identity-and-access.md) | 계정·Workspace, Operator와 Owner, 세션·MFA·격리 |
| [웹 구조](docs/architecture/web-application-design.md) | UI 상태·컴포넌트, application 모듈·API 계약 |
| [데이터·운영](docs/architecture/data-and-operations.md) | 파일·이식·휴지통·로그·작업·백업·복원 |
| [웹 제품 상위 계획](docs/plan/web-product-implementation-plan.md) | F/P/D/R 구현 단계와 기본 release gate |

### 판단 실험

[제로베이스 검토](docs/review/zero-base-review-2026-09-22.md) · [Core 구조](docs/architecture/judgement-core.md) · [기록·판단 도메인](docs/architecture/domain-model.md) · [검색·점수](docs/architecture/retrieval-and-scoring.md) · [구조·파생](docs/architecture/structure-and-derivation.md) · [런타임·성능](docs/architecture/runtime-and-performance.md) · [Core Lab 및 상위 계획](docs/plan/core-lab-experiment-plan.md) · [AGENTS.md](AGENTS.md)

## 범위와 구현 순서

초기 운영은 1인 자가 호스팅, 확장은 초대된 계정별 개인 공간이다. 서비스 초대는 내 공간 공유가 아니다. 공개 가입·협업 ACL·과금 SaaS는 첫 범위 밖이다. 운영자 역할을 다른 사람의 콘텐츠 소유권으로 취급하지 않는다.

첫 Core 구현 지시는 기존 M0/M1(CLI 실험)로 유지한다. 웹 구현을 명시적으로 시작하면 I00 인증·DTO 계약과 작은 통합 시험부터 진행한다. 제품 단계는 F(웹·계정·권한·감사), P(기록·일정·할일·위키), D(문서 정제·검토), R(발행·Delivery)이며 UI를 개발용 Inspector로 대신하지 않는다.

설계 범위는 ADR 0007/0008, 최신 화면·관계 계약은 [ADR 0009](docs/adr/0009-wireframes-and-relational-contracts.md)가 보완한다. 최신 상세 계약이 기존 대표 필드·가칭보다 구체적인 기준이다. Core/Lab 문서의 UI/발행 제외는 첫 판단 실험에만 적용한다.

## 기술·품질 원칙

TypeScript 중심, PostgreSQL 운영 저장소, React/Vite 내부 웹, Fastify API와 같은 코드베이스 worker의 모듈형 모놀리스를 유지한다. Core는 순수 계산 경계를 갖는다. 인증 어댑터와 라이브러리의 실제 버전·schema·보안 설정은 구현 때 검증·고정한다.

rankScore는 확률이 아니다. 원본과 정제본, 개인 자료와 공개본, 사용자 명령과 추론 제안을 분리한다. 실제 대화·개인 기록·embedding·credential은 공개 저장소에 커밋하지 않는다. 설계 그림·API 예시·정책값은 구현·실측·보안 인증 완료를 뜻하지 않는다.

설계 결정 전체: [ADR 디렉터리](docs/adr/).
