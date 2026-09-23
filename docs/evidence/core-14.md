# CORE-14 · 문서 목적·관점·개요·readiness

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux CI 성공; 사용자 ACCEPTED 전.
- 선행: CORE-08 VERIFIED. 작업 기준 main `44a58ca`.
- 기능 커밋: `b430f09`; [GitHub Actions 실행](https://github.com/orot11955/ieum/actions/runs/35861700083) `completed success` (Linux).
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 사용자 원문이나 모델을 사용하지 않았다.

## 구현·계약

Core의 `planDocument`는 CORE-08 Evidence Pack과 사용자가 지정한 목적(`guide`, `experiment_note`, `decision_record`, `comparison`), 독자, 출처별 관점, 작성자 해석, 충돌하는 관점을 입력받는다. 목적별 checklist의 모든 항목을 outline에 남기고, 각 항목을 `sourced`/`author_draft`/`missing`으로 표시한다. 결과 readiness는 누락 항목·근거 없는 작성자 초안 항목·반론 인용 누락·해결하지 않은 충돌 목록과 실제로 인용한 독립 origin family를 반환한다. 모든 결과는 작성자 검토가 필요하며 단일 성숙도 점수나 발행 준비 완료 판정을 만들지 않는다.

인용은 pack manifest에 포함되고 실제 섹션에도 존재하는 source ref만 허용한다. 반론으로 표시한 인용은 pack의 반론 섹션에 있어야 한다. 개인 관찰·외부 주장·반론은 사용자가 지정한 역할로 따로 보존하고, 작성자 해석은 인용으로 위장하지 않는다. 역할 분류 자체는 작성자 입력이며 외부 출처의 사실성·의미 일치를 자동 검증하지 않는다. Outline은 기존 ref와 사용자 작성 문구만 보존하고 새 사실·성공 결과·요약 문장을 만들지 않는다. 구조화된 Core 반환값이며 제품 DB·Web·공개 export 연결은 후속 카드 범위다.

## 실제 로컬 명령·반례

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `pnpm test:unit` | 0 | Core 42개, contracts 3개, Lab 21개. 근거 없는 요약 항목, 한 origin 재인용 과대 가산, 실패 실험의 작성자 해석, 상충 관점, 인용 위조·반론 역할 오류, 직렬화된 pack 반례 포함 |
| `pnpm lint`, `pnpm format:check` | 모두 0 | 소스 lint·형식 검사 통과 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 경계·타입·빌드·smoke 통과 |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획·디자인·공백 검사 통과 |

검증은 합성 Core fixture에 한정된다. 실제 문서 작성자 검토 시간, 관점 충돌의 의미적 적절성, 문서 품질·공개 안전성은 측정하지 않았다. 제품 데이터나 외부 서비스를 변경하지 않았다.
