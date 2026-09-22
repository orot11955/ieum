# ieum

**ieum**은 개인의 생각, 관찰, 질문, 결정, 행동, 결과가 하나의 기록 풀에서 연결되고,
그 흐름이 프로젝트·정리본·글감·블로그·지식으로 파생될 수 있는지를 실험하는 프로젝트입니다.

현재 단계의 목표는 완성된 개인 관리 웹을 만드는 것이 아닙니다.

> 새로운 기록이 들어왔을 때, 기존 사고 흐름 중 어디와 관련되는지
> 설명 가능한 방식으로 제안할 수 있는가?

이를 검증하기 위해 먼저 **Judgement Core Lab**을 구현합니다.

## 현재 범위

- Capture / ThoughtUnit / Context / Relation
- Candidate Finder
- 설명 가능한 판단 근거(Evidence)
- Replay / Gold Dataset
- 향후 Evaluator / Proposal / Feedback 확장

현재는 일정 관리, 블로그 편집기, AI/LLM, Embedding, 자동 Split/Merge를 구현하지 않습니다.

## 문서

- [Judgement Core 설계서](docs/architecture/judgement-core.md)
- [Core Lab 실행 계획서](docs/plan/core-lab-experiment-plan.md)
- [ADR](docs/adr/)

## 기본 기술 스택

- Node.js 24 LTS
- TypeScript 6.x
- pnpm workspace
- Fastify 5.x
- PostgreSQL 18
- Drizzle ORM
- React 19 + Vite
- Vitest + Testcontainers + Playwright

## 핵심 원칙

1. 원본 기록은 보존한다.
2. 의미 판단은 자동 실행보다 제안을 우선한다.
3. 모든 판단은 근거를 설명할 수 있어야 한다.
4. Core는 Framework/DB와 독립적인 Pure TypeScript로 유지한다.
5. Replay를 통해 같은 입력은 같은 결과를 내야 한다.
6. AI는 필요해질 경우 Evaluator 하나로 추가한다.
7. Core 가능성이 검증되기 전까지 바깥 제품 기능을 확장하지 않는다.
