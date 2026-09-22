# 08 · 출처와 요구사항 추적

## 검토 방법과 제한

이 문서의 라이브러리/역사적 코드 검토는 계획 1.0의 2026-09-22 기록이다. 2026-09-23 계획 채택·정리의 실제 확인 범위는 ../status/project-state.md와 ../evidence/base-01.md를 따른다.

기획의 사용자 목표는 저장소의 제품 목적·Core Lab·구조/정제 문서와 이번 요청에서 추출했다. main과 다크 기준선은 고정 SHA로 구분해 읽었다. 일부 긴 GitHub 응답은 필요한 범위로 다시 읽었고, 전체 repository 모든 파일을 실행 감사한 것으로 확대하지 않았다. 이번 세션에는 실제 product build/DB/E2E/model evaluation을 수행하지 않았다.

Nest 전환, task 카드 분할, pg-boss 도입, editor canonical JSON과 P0–P9 실행 순서는 **이번 재계획의 설계 결정**이다. 저장소가 이미 그 구조로 변경되었다는 사실 서술이 아니다. 라이브러리 문서는 2026-09-22에 확인했으며 존재하는 통합 문서가 IEUM 설정의 검증을 대신하지 않는다.

## 요구사항→작업

| 요구 | 의미 | 구현·검증 작업 |
|---|---|---|
| R01 | 기록·원본·출처 보존 | CORE-01, CORE-02, BE-07, FE-05 |
| R02 | 실제 개인 관리 | BE-09, BE-10, BE-11, FE-07, FE-08, FE-09, QA-04 |
| R03 | 다중 맥락·관련성 | CORE-04, CORE-10, BE-08, BE-13, FE-06, FE-12 |
| R04 | 근거·보류·재현 | CORE-05, CORE-06, CORE-07, BE-12, QA-02 |
| R05 | 관리 항목 추출 | CORE-11, BE-14, FE-13, QA-05 |
| R06 | 묶기·나누기·역변경 | CORE-12, CORE-13, BE-15, FE-14, QA-06 |
| R07 | 다중 관점 문서 | CORE-08, CORE-14, BE-16, FE-15, QA-06 |
| R08 | 선택적 모델 정제 | CORE-15, BE-17, FE-16, QA-06 |
| R09 | 승인 발행·개정·철회 | BE-19, FE-18, QA-07 |
| R10 | 독립 Delivery | BE-20, QA-07 |
| R11 | 전 영역 개인 공간 격리 | BE-02, BE-03, BE-04, BE-05, BE-18, BE-26, QA-03, QA-07 |
| R12 | 이식·삭제·복원·운영 | BE-21, BE-22, BE-23, BE-24, FE-19, FE-20, QA-08 |
| R13 | Paper/Dark 일관성 | FE-01, FE-02, FE-21, QA-01 |
| R14 | Core 장애와 수동 기능 분리 | BE-06, BE-12, BE-17, QA-04, QA-05 |

## 기존 화면→새 작업

W01–W27의 화면 ID와 범위는 기존 screen matrix를 기준으로 유지한다. FE 카드가 여러 화면을 맡을 수 있지만 구현 commit은 사용자 기능과 검증 가능 범위로 나눈다. 권한 W23은 초기 읽기 전용 capability이며 협업 ACL 편집을 추가한 것이 아니다. 화면 포함은 구현 완료를 의미하지 않는다.

| 화면 | 기존 이름 | 담당 작업 |
|---|---|---|
| W01 | 로그인 | FE-01, FE-04 |
| W02 | 초대·첫 설정 | FE-04 |
| W03 | 복구·MFA | FE-04 |
| W04 | 홈 | FE-03, FE-10 |
| W05 | 기록함 | FE-05 |
| W06 | 원문·출처 | FE-05, FE-12, FE-13 |
| W07 | 할일 | FE-07 |
| W08 | 일정 | FE-08 |
| W09 | 위키 | FE-09 |
| W10 | 맥락 | FE-06, FE-14 |
| W11 | 통합검색 | FE-11 |
| W12 | 문서목록 | FE-15 |
| W13 | 문서편집 | FE-02, FE-09, FE-15, FE-16 |
| W14 | 버전충돌 | FE-02, FE-09, FE-15 |
| W15 | 제안함 | FE-12, FE-13, FE-14, FE-16 |
| W16 | 발행검토 | FE-18 |
| W17 | 공개본 | FE-18 |
| W18 | API클라이언트 | FE-18 |
| W19 | 파일 | FE-17 |
| W20 | 이식 | FE-19 |
| W21 | 휴지통 | FE-19 |
| W22 | 회원 | FE-20 |
| W23 | 권한 | FE-03, FE-20 |
| W24 | 로그 | FE-20 |
| W25 | 작업 | FE-20 |
| W26 | 설정 | FE-01, FE-03, FE-04, FE-20 |
| W27 | 운영 | FE-20 |

## 기존 단계와 새 단계의 대응

| 기존 계획 | 새 실행 구간 | 정리한 차이 |
|---|---|---|
| M0/M1 | P0 일부 + P1 | 순수 core·파일 실험을 실제 첫 흐름으로 고정 |
| M2 | P4 CORE-09/10 | B0 측정 후 semantic/hybrid, 정확도 통과와 구분 |
| M3 / S0–S3 | P0·P2·P3·P4 일부 | 인증/수동 관리와 core integration 책임 분리 |
| M4 / S4 | P5·P6·P8 일부 | 구조 변경·문서 정제·이식·첨부를 별도 카드로 세분화 |
| M5 / S5 | P7 | 공개 snapshot/독립 Delivery/철회 검증 |
| I14 및 전 단계 hardening | P0–P9 검증 + P8/P9 | 끝에 한 번 검사하는 일이 아니라 매 기능의 완료 기준 |

기존 I00–I14를 새 카드와 기계적으로 1:1 매칭하지 않는다. 기존 범위를 잃지 않는지가 요구사항과 화면 표의 기준이다. 기존 문서 중 보존할 세부 불변식은 새 계약보다 더 약한 구현으로 대체하지 않는다.

## 저장소 출처

### S01 · 브랜치 조회

https://api.github.com/repos/orot11955/ieum/branches?per_page=100

2026-09-22 당시 main/archive와 replan/dark-baseline SHA를 확인한 역사적 출처다. 현재는 main 단일 브랜치이며 이 URL의 현재 응답을 과거 조회와 혼동하지 않는다.

### S02 · 다크 기준선 복원 commit

https://github.com/orot11955/ieum/commit/64be0e2e2afdf3f797d08b80bbea1533916efb59

원래 dark tree, 보존/제거 범위, 소스 rollback과 DB downgrade 구분은 commit message 근거.

### S03 · 기준선 tree

https://api.github.com/repos/orot11955/ieum/git/trees/64be0e2e2afdf3f797d08b80bbea1533916efb59?recursive=1

기준선의 디자인/테마/문서 및 남은 앱 기반 확인. 긴 tree 응답 일부는 표시 한계가 있으므로 전체 테스트 완료의 근거로 사용하지 않음.

### S04 · 제품 목적과 범위

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/product/vision-and-scope.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S05 · 과거 README · 2026-09-22

https://github.com/orot11955/ieum/blob/5cc3604d746f010b24399e1e8b4a3c05a36eaba7/README.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S06 · 기존 최소 lexical Core

https://github.com/orot11955/ieum/blob/5cc3604d746f010b24399e1e8b4a3c05a36eaba7/packages/core/src/index.ts

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S07 · 기존 판단 서비스

https://github.com/orot11955/ieum/blob/5cc3604d746f010b24399e1e8b4a3c05a36eaba7/apps/api/src/judgement.ts

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S08 · 기존 개인 관리 화면 구현

https://github.com/orot11955/ieum/blob/5cc3604d746f010b24399e1e8b4a3c05a36eaba7/apps/web/src/features/personal.tsx

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S09 · Judgement Core 설계

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/architecture/judgement-core.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S10 · 도메인 모델

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/architecture/domain-model.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S11 · 구조 변경·글 정제

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/architecture/structure-and-derivation.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S12 · Core Lab 실험 계획

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/plan/core-lab-experiment-plan.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S13 · 기존 S0–S5 착수 계획

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/plan/final-implementation-readiness.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S14 · W01–W27 화면 matrix

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/design-system/screen-matrix.json

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S15 · 기존 package와 script

https://github.com/orot11955/ieum/blob/5cc3604d746f010b24399e1e8b4a3c05a36eaba7/package.json

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S16 · 후보 검색·점수·정책

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/architecture/retrieval-and-scoring.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S17 · 웹·API 애플리케이션 구조

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/architecture/web-application-design.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S18 · 인증·개인 공간·권한

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/docs/architecture/identity-and-access.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

### S19 · 기존 작업 지침

https://github.com/orot11955/ieum/blob/64be0e2e2afdf3f797d08b80bbea1533916efb59/AGENTS.md

GitHub connector로 해당 commit의 내용을 읽어 검토. 긴 일부 문서는 필요한 범위를 읽었으며 실행 결과로 취급하지 않음.

## 공식 기술 자료

### O01 · Nest FastifyAdapter

https://docs.nestjs.com/techniques/performance

Nest가 Fastify adapter를 제공함. IEUM 속도 향상 수치의 증거가 아님.

### O02 · Better Auth Nest 통합

https://better-auth.com/docs/integrations/nestjs

community-maintained 및 Fastify beta 안내 확인. 채택 전 별도 spike 필요.

### O03 · Better Auth Fastify 통합

https://better-auth.com/docs/integrations/fastify

native handler/session 통합 방법. IEUM의 모든 초대·MFA·철회 정책 충족을 뜻하지 않음.

### O04 · Drizzle transaction

https://orm.drizzle.team/docs/transactions

DB transaction adapter 설계 참고.

### O05 · PostgreSQL row security

https://www.postgresql.org/docs/current/ddl-rowsecurity.html

RLS 정책과 owner/superuser 등 우회 조건. 구현 검증과 구분.

### O06 · pgvector

https://github.com/pgvector/pgvector

exact/ANN 및 hybrid 검색 참고. 모델/인덱스 품질은 별도 측정.

### O07 · PostgreSQL pg_trgm

https://www.postgresql.org/docs/18/pgtrgm.html

trigram 검색 adapter 참고. lab tokenizer와 동일 알고리즘이라고 가정하지 않음.

### O08 · pg-boss

https://github.com/timgit/pg-boss

PostgreSQL queue, 기존 transaction 연계·retry 지원 참고. 외부 부작용 exactly-once 보장은 별개.

### O09 · TanStack Query

https://tanstack.com/query/latest/docs/framework/react/overview

server state 관리의 도구 역할 확인. 개인 초안·권한 정책은 앱 책임.

### O10 · Tiptap persistence

https://tiptap.dev/docs/editor/core-concepts/persistence

JSON/HTML 출력과 저장 참고. IEUM 저장 정본은 JSON으로 결정.

### O11 · Tiptap UniqueID

https://tiptap.dev/docs/editor/extensions/functionality/uniqueid

block ID 기능과 읽기전용 불변 문서 옵션 참고. claim 의미 검증은 별도.

## 실행 중 추가해야 하는 증거

실제 작업자는 각 카드별 commit, 명령/exit code, 환경/버전, contract/migration 영향, CI/DB/browser artifact, private dataset 사용 허가와 집계, 미검증 기능을 남겨야 한다. 이 계획 자체의 링크 검사는 GitHub의 미래 가용성이나 library compatibility를 보장하지 않는다.
