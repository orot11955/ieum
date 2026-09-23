# CORE-08 · 모델 없는 evidence pack

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux CI 성공; 사용자 ACCEPTED 전.
- 선행: CORE-01·CORE-06 VERIFIED. 작업 기준 main `182083c06bb0fac5b3722efe638f504dccdd9fe3`.
- 기능 커밋: `8aa9a734d72834304672731b6dd5cc9a47249a54`; [GitHub Actions 실행](https://github.com/orot11955/ieum/actions/runs/35859299995) `completed success` (Linux).
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 사용자 자료는 읽거나 공개하지 않았다.

## 구현·계약

Core의 `createEvidencePack`은 사용자가 고른 제목·목적·맥락과 질문/관찰/반론/결정/미확인 섹션의 Unit revision·원문 인용을 입력받는다. 선택한 맥락에 속한 Unit 또는 질문 Unit인지 확인하고, `parseEvidenceRef`로 Capture revision·UTF-16 span·인용의 원문 일치를 검사한다. Core는 순수 계산이며 SHA-256 함수는 호출자가 주입한다. 결과 manifest에는 출처 ref, Capture 원문 hash, 중복 제거된 origin family, 목적과 snapshot hash를 기록한다. 빈 섹션은 `missingSections`와 Markdown의 `미확인`으로 표시한다. 같은 원문에서 나온 여러 Unit은 독립 출처 두 개로 세지 않는다.

Lab의 `pack <run-directory> <request.json> [--out <directory>]`는 기존 run의 artifact hash를 검증하고, 저장된 `direct_selection` commandId/contextId와 입력 snapshot hash가 일치해야 출력한다. 기본 경로는 저장소 밖 `~/.local/share/ieum-lab/packs/`다. 새 디렉터리에 private `pack.json`, `pack.md`, hash manifest를 쓰고 기존 디렉터리를 덮어쓰지 않는다. Markdown은 선택한 원문만 인용하며 새로운 사실·반론·결정을 생성하지 않는다. DB·웹·모델 호출은 없다.

## 실제 로컬 명령과 반례

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `pnpm test:unit` | 0 | Core 37개, contracts 3개, Lab 18개. 존재하지 않거나 stale인 Unit, 원문과 다른 인용, 같은 origin 재인용, 빈 반론, run 직접 선택 불일치, 원본 파일 수정 뒤 불변 pack, 기본 private CLI 경로를 포함 |
| `pnpm lint`, `pnpm format:check` | 모두 0 | 소스 lint·형식 검사 통과 |
| `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 계약 경계·타입·빌드·smoke 통과 |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획·디자인·공백 검사 통과 |

첫 Core 테스트는 fixture의 snapshot hash가 SHA-256 형식이 아니라서 실패했다. 64자리 digest로 fixture를 바로잡은 뒤 같은 테스트와 전체 로컬 검증이 통과했다. 실제 사용자 데이터·HTTP·DB·LLM·공개 export는 시험하거나 변경하지 않았다. Pack은 사용자가 택한 인용을 정리한 private 산출물이며 주장 사실성 검증이나 공개 승인 결과가 아니다.
