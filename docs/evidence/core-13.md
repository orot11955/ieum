# CORE-13 · 분리·병합·상위 묶음 변경안

- 상태: **IMPLEMENTED**. 로컬 검증 완료, 원격 Linux CI 대기; 사용자 ACCEPTED 전.
- 선행: CORE-12 VERIFIED. 작업 기준 main `7d78e18`.
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 사용자 기록·DB를 사용하지 않았다.

## 구현·계약

`compareStructureOptions`는 같은 승인 snapshot과 CORE-12 진단을 기준으로 KEEP, LINK, CREATE_PARENT, SPLIT, MERGE 다섯 안의 **읽기 전용 미리보기**를 만든다. 각 안에 base identity/membership revision, 새 Context 정의, Unit별 변경 전후 소속, 유지/이동/중복 표시, primary 재선택 필요 여부, 이전 문서의 Context 출처 영향, 추가 관계와 역방향 복구 재료가 있다. 어떤 안도 Context를 물리 삭제하거나 primary를 자동 변경하지 않으며 `requiresExplicitCommand=true`다. 실제 적용 시에는 제품 서버가 해당 revision·권한·출처 사용을 다시 원자적으로 검사해야 한다.

SPLIT은 명시적 Unit별 mapping으로 모든 기존 멤버를 다루며, 기존 Context에 남는 멤버와 신규 Context로 중복 소속되는 bridge를 허용한다. MERGE는 소스 Context 정체성을 보존한 채 멤버의 대상 Context 이동안을 보여준다. 다른 목적의 유사 Context 또는 부모·자식 관계인 Context의 MERGE는 blocked다. CREATE_PARENT는 기존 부모 graph와 새 parent link의 순환을 검사한다. 표본이 부족한 진단에서는 구조 변경안을 blocked로 두되 KEEP은 계속 볼 수 있다. 기각 signature가 같으면 suppressed로 돌려 반복 노출을 억제한다. 구조 제안 평가는 routing precision과 별개이며 이 함수는 구조 변경의 실제 품질 점수를 생성하지 않는다.

Context 목적, 기존 parent/related 관계, primary 및 과거 문서의 출처 사용은 현재 snapshot 타입에 없으므로 호출자가 검증된 상태로 공급해야 한다. 서명·권한·동시성 검사는 후속 제품 명령 경계의 책임이다.

## 반례와 검증

- 잔여 Unit, 두 Context에 남는 bridge, 신규 Context로 이동한 Unit, 이전 출처가 영향을 받는 문서, primary 재선택 필요 여부와 inverse-preview를 확인했다.
- 목적이 다른 peer, 기존 부모·자식 관계, 새 parent 순환, 기존 입력 graph 순환, stale 진단 revision, 기각 signature 재노출 억제, 누락된 split mapping을 검사했다.
- 다른 Context 소속이 아닌 Unit을 과거 출처 사용으로 위조한 입력을 거부했다.
- 기능 CI 성공 뒤 diff 검토에서 새 parent를 제3 Context 아래에 붙일 때 해당 Context revision이 base set에 빠지는 점을 발견했다. attach 대상의 identity/membership revision도 base set에 포함하고 테스트했다.
- 첫 전체 lint는 부모 관계 검사에 남은 미사용 callback 인자로 실패했다. 직접 경로 검사로 정리하고 lint·format·Core 테스트를 재실행해 통과했다.

| 실제 명령 | exit | 결과 |
| --- | ---: | --- |
| `pnpm test:unit` | 0 | Core 65개, contracts 3개, Lab 25개 통과 |
| `pnpm lint`, `pnpm format:check`, `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 정적 검사·계약 경계·빌드·smoke 통과 |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획 75개·링크·디자인과 공백 검사 통과 |

실제 구조 제안의 효용·정확도, 제품 데이터의 parent/primary/문서 출처 조회, 원자적 적용·감사·되돌리기는 미검증이다. DB·HTTP·운영 설정을 변경하지 않았다.
