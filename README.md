# IEUM · 이음

**기록을 보존하고, 생각의 맥락을 연결하고, 그 근거를 잃지 않은 채 결정과 글로 발전시키는 개인 사고 시스템.**

이음의 중심은 일정도, 폴더도, 자동 블로그 생성도 아니다. 생각·관찰·질문·결정·행동·결과를 한 기록 풀에 남기고, 필요할 때 다시 찾고 연결하여 결과물로 이어 가는 흐름이다. 하나의 기록은 여러 맥락에 속할 수 있으며, 연결하지 않은 상태도 정상이다.

## 현재 상태

2026-09-22 제로베이스 재검토에 따라 설계 문서를 전면 개정했다. **현재 저장소는 설계 단계이며, 실행 가능한 Core·API·DB·UI와 실측 벤치마크는 아직 없다.** 아래 기술 선택과 목표치는 구현·실험 계획이지 구현 완료나 성능 보장이 아니다.

첫 질문은 다음과 같다.

> 사용자가 직접 검색하고 정리하는 것보다, 근거가 보이는 연결 후보와 원본 기반 정리 재료가 실제로 더 도움이 되는가?

이를 검증하기 위해 **파일 기반 Core Lab → 의미 검색 비교 실험 → 저장·승인 UI → 구조와 파생 실험** 순으로 진행한다. 단어 검색이 목표를 통과해야만 임베딩을 시험할 수 있는 구조로 만들지 않는다.

## 설계의 중심

| 영역 | 질문 | 첫 구현의 경계 |
| --- | --- | --- |
| 연결 판단 | 이 기록을 어떤 맥락들과 함께 볼 것인가? | 다중 후보, 근거, 보류; 자동 연결 없음 |
| 구조 판단 | 맥락을 나누거나 합칠 가치가 있는가? | 후속 단계의 변경 미리보기; 자동 변경 없음 |
| 파생 지원 | 어떤 근거로 정리본·결정·글을 만들 것인가? | 원본 참조가 있는 정리 재료부터; 자동 발행 없음 |

`rankScore`는 정렬 점수이고 정답 확률이 아니다. `evidenceCoverage`는 증거의 가용성이며 사실의 진실성이 아니다. 보정·검증 전에는 `matchProbability`를 제공하지 않는다. 1·2위 점수 차이는 대표 맥락 선택에만 사용하며, 정상적인 다중 연결을 억제하지 않는다.

## 문서 지도

처음 읽는 순서:

1. [제품 목적과 범위](docs/product/vision-and-scope.md)
2. [제로베이스 검토와 변경 이유](docs/review/zero-base-review-2026-09-22.md)
3. [Core 전체 구조](docs/architecture/judgement-core.md)
4. [Core Lab 실험·구현 계획 및 Codex 최초 지시](docs/plan/core-lab-experiment-plan.md)

세부 계약:

| 문서 | 책임 |
| --- | --- |
| [도메인·데이터 모델](docs/architecture/domain-model.md) | 원본, revision, 다중 연결, 출처, 승인·취소 |
| [후보 검색·점수·정책](docs/architecture/retrieval-and-scoring.md) | 한국어, 임베딩, 가중치 실험, 결측, 보류, 피드백 |
| [구조 변경·글 정제](docs/architecture/structure-and-derivation.md) | 분리·병합·상위 맥락, 근거 묶음, 문장별 출처 |
| [런타임·성능·보안](docs/architecture/runtime-and-performance.md) | 스택, 연산 비용, 측정 범위, 지연 예산, 로컬 운영 |
| [AGENTS.md](AGENTS.md) | 구현 에이전트의 작업 경계와 검증 의무 |

설계 결정:
[PostgreSQL](docs/adr/0001-use-postgresql.md) ·
[순수 TS 계산 코어](docs/adr/0002-pure-typescript-core.md) ·
[승인 후 의미 변경](docs/adr/0003-no-semantic-auto-execute.md) ·
[시점 기반 Replay](docs/adr/0004-replay-first-experimentation.md) ·
[폐기된 AI 일괄 배제](docs/adr/0005-no-ai-in-v1.md) ·
[초기 의미 검색 비교](docs/adr/0006-early-semantic-experiments.md)

## 기술 선택

첫 실험은 Node.js 24 LTS 계열, TypeScript 6 계열, pnpm, Vitest, JSONL만으로 시작한다. 설치 버전은 최초 구현 시 호환성을 확인하고 lockfile에 고정한다. 저장 기능 단계에서 PostgreSQL 18 + Drizzle, HTTP 단계에서 Fastify, 필요한 경우 React + Vite를 추가한다. 임베딩은 선택적 어댑터이며 DB나 생성형 LLM 없이도 비교할 수 있다.

패키지 상세와 공식 근거는 [런타임 문서](docs/architecture/runtime-and-performance.md)에 있다. 지금 존재하지 않는 실행 명령을 설치 안내처럼 제공하지 않는다. 계획서의 CLI 명령은 구현할 계약이다.

## 첫 완료 조건

합성 fixture에서 계약과 누수 방지를 확인하고, 허가된 실제 데이터에서 검색·판단·사용자 수고 감소를 따로 측정한다. 쉬운 예제의 높은 정확도, 추천하지 않아 얻은 높은 정밀도, 임베딩을 제외한 속도만으로 성공을 선언하지 않는다.

이 저장소는 공개 저장소다. 실제 대화, 개인 기록, 원본 파생 임베딩, 비공개 평가셋, 인증정보를 커밋하지 않는다. 문서의 사례와 수치는 별도 표시가 없으면 설계 예시이며 실사용 결과가 아니다.
