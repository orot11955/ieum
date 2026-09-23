# CORE-11 · 자유 기록에서 관리 항목 추출 계약

- 상태: **VERIFIED**. 로컬 검증과 원격 Linux CI 성공; 사용자 ACCEPTED 전.
- 선행: CORE-08·CORE-10 VERIFIED. 작업 기준 main `8ee07f6`.
- 기능 커밋: `a129b68`; [GitHub Actions 실행](https://github.com/orot11955/ieum/actions/runs/35865808881) `completed success` (Linux).
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 사용자 기록·모델 provider·DB를 사용하지 않았다.

## 구현·계약

`validateExtractProposals`는 외부 추출 후보를 불변 Capture revision의 UTF-16 source span과 대조해 `ExtractProposal[]`만 만든다. 후보에는 origin revision·originKey·원문·target kind(Task/Event/ThoughtUnit/Context)·제안 제목/본문·시간 표현/기준 시각/시간대/모호성·미해결 필드가 남는다. 상대 날짜의 기준은 Capture의 `occurredAt` 또는 `recordedAt`과 같아야 한다. 시간대가 없거나 날짜가 모호하면 확정 instant를 허용하지 않는다. Core는 실시간 clock·DB·모델 SDK를 읽거나 명령을 실행하지 않는다.

같은 origin family·target kind·원문 구간에서 나온 반복 후보는 title 재표현과 revision 변화에도 안정된 decision key로 묶는다. 호출자가 전달한 이전 거절/수락/완료 결정을 확인해 재노출을 막는다. 별도의 proposal ID는 revision·span·제안 필드에 묶여 stale 편집을 드러낸다. 이 억제는 제품이 결정 이력을 완전하게 전달한다는 조건에서만 성립한다.

`prepareExtractCommand`는 사용자 확인값, 현재 source revision, 호출자가 확인한 권한과 기존 완료 Task 상태를 받아 **명령 입력만** 만든다. Event에는 확정 시간이, 시간 표현이 있는 항목에는 확인된 시간대가 필요하다. 사용자 폼 저장·업무 명령 실행·감사 기록은 이 카드의 대상이 아니다. 서버가 실제 권한과 중복 상태를 원자적으로 다시 검사해야 한다.

## 반례와 검증

- `내일 10시`의 시간대·instant·모호성을 미해결로 남기고, `다음 주`의 요일을 임의로 결정하지 않았다.
- 동일 후보 중복, 제목 표현을 바꾼 거절 후보의 다음 revision 재노출, 완료 Task 재개방을 막았다.
- 다른 revision, 범위 밖 span, 다른 원문, source와 다른 시간 기준, 시간대 없이 확정한 instant, stale/권한 없는 명령 입력을 거부했다.
- 첫 테스트 실행은 fixture의 한국어 문자열 UTF-16 길이를 잘못 세어 4건 실패했다. 문자열 길이로 span을 수정한 뒤 재실행했고, 이후 `node:crypto` 타입을 사용할 수 없는 Core 테스트 오류를 순수 테스트 hash로 교체했다.

| 실제 명령 | exit | 결과 |
| --- | ---: | --- |
| `pnpm test:unit` | 0 | Core 53개, contracts 3개, Lab 25개 통과 |
| `pnpm lint`, `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 정적 검사·계약 경계·빌드·smoke 통과 |
| `pnpm format:check` | 0 | Prettier 형식 통과 (첫 실행은 새 파일 2개의 형식 오류, 수정 후 재실행) |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획 75개·링크·디자인과 공백 검사 통과 |

실제 모델 추출 품질, 날짜 해석 정확도, DB 명령의 동시성·권한 경계는 미검증이다. 실제 자료·DB·HTTP·운영 설정을 변경하지 않았다.
