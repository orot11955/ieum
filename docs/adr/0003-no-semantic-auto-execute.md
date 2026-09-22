# ADR 0003 · 사용자 통제 아래 의미 구조 변경

- Status: Accepted, revised
- 최초 결정/개정: 2026-09-22

## Context

잘못된 연결·병합이 다음 판단의 근거가 되면 오류가 누적된다. 반대로 모든 단순한 기록 동작에 추가 승인을 요구하면 사용자가 기록 자체를 포기할 수 있다. 명시적 명령과 모델 추론을 구분해야 한다.

## Decision

사용자의 직접 입력/명령은 권한과 revision을 확인해 실행한다. 새 Capture 저장, 사용자가 선택한 소속, 명시적 관계가 이에 해당한다. 이는 자동 의미 판단의 성과로 집계하지 않는다.

시스템의 연결·primary 이동·분리·병합·상위 맥락 생성은 `Judgement → Proposal → 사용자 승인 → 원자적 Mutation`을 거친다. profile/index 재생성은 의미 구조가 아닌 파생 cache 변경으로 자동 수행할 수 있다.

생성 모델은 DB 쓰기나 외부 발행 권한을 갖지 않는다. evidence pack/초안 생성은 읽기 기반 제안이며, 공개 export는 별도 사용자 검토를 거친다. 날짜 parsing처럼 결정적으로 보이는 처리도 시간대·문맥이 모호하면 자동 확정하지 않는다.

초기 policy는 ABSTAIN/CANDIDATE/SUGGEST이며 기본 모드는 observe다. 검증되지 않은 STRONG_SUGGEST와 AUTO_EXECUTE를 만들지 않는다. 다중 attachment와 단일 primary 선택은 별도로 처리한다.

## Consequences

적용 전 revision 확인, idempotency, 감사 이력, 안전한 Undo가 필요하다. 승인 횟수와 노출을 최소화하는 것은 별도 UX 목표다. 사용자가 아무 응답을 하지 않은 것을 거절로 학습하지 않는다.

기준 계약: [도메인](../architecture/domain-model.md) · [구조·파생](../architecture/structure-and-derivation.md)
