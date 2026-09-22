> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# ADR 0009 · 화면·버전·관계 계약을 구현 기준으로 사용한다

- Status: Accepted for implementation planning
- Date: 2026-09-22
- Context: 기본 웹 설계를 와이어프레임과 ERD로 대조하여 누락을 보완했다. 제품 구현 검증은 아직 하지 않았다.

## Decision

제품 화면은 W01–W27, 논리 모델은 66개 엔터티로 정리한다. 이 수는 인증 어댑터 계약, 작은 관계 테이블, 버전·작업 이력을 포함하며 일괄 구현 범위가 아니다. 기존 F/P/D/R과 Core Lab 분리는 유지한다.

Project는 context.kind로, Wiki/Article/Note는 document.kind와 공통 draft/revision으로 시작한다. 기존 source_link/asset_usage 가칭은 정확한 대상과 버전의 FK로 구체화한다. 사용자 계정과 외부 저자 attribution을 분리한다.

문서 검토는 특정 body/metadata/citation/asset manifest에 고정한다. 공개 revision은 같은 Publication·문서·review에 연결하고 최신 유효한 READY를 transaction에서 확인한다. 과거 READY/slug/공개 asset 경로로 철회를 우회하지 않는다.

작업 출처와 결과 Capture, 태그·맥락 링크, 발행 채널·slug 이력·키 교체, 개인/인스턴스 감사, command receipt·job attempt를 실제 관계로 표현한다. Core의 untrusted 자료/권한 경계와 수동 기본 기능의 독립성은 유지한다.

## Authoritative detail

[화면](../design/wireframes.md), [ERD](../design/erd.md), [schema 계약](../design/schema-contracts.md)이 기존 대표 필드 표보다 구체적인 기준이다. [검토](../review/wireframe-erd-review-2026-09-22.md)의 R01–R18과 [구현 백로그](../plan/task-index.md)의 I00–I14를 연결한다.

## Consequences

화면·API·권한·엔터티·실패·검사가 한 기능 단위로 이어져야 한다. 정적 FK 검사와 UI 시연 성공은 DB/RLS/인증/실제 사용자 품질 검증을 대신하지 않는다. 실제 auth 물리 schema와 migration은 구현 단계에서 검증한다. 과거 가칭과 새 이름을 동시에 별개 서비스로 구현하지 않는다.
