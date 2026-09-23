# CORE-15 · 모델 초안·claim map 검증

- 상태: **IMPLEMENTED**. 로컬 검증 완료, 원격 Linux CI 대기; 사용자 ACCEPTED 전.
- 선행: CORE-11·CORE-14 VERIFIED. 작업 기준 main `10c18f3`.
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 실제 모델/provider·사용자 자료·DB를 사용하지 않았다.

## 구현·계약

`validateDraftClaims`는 모델 초안의 고유 blockId/claimId, claim 종류(`quote`, `paraphrase`, `synthesis`, `author_added`), source index를 검토한다. Evidence Pack의 manifest/section 참조가 같고, 각 참조가 선택 Context 또는 question의 원본 snapshot에 존재하며, capture 본문의 SHA-256 hash가 pack과 일치해야 한다. 허용 source index 밖의 인용과 현재 revision/hash가 달라진 출처는 claim별 issue로 남긴다. 모델 초안은 원문이나 Evidence Pack을 수정하지 않는다.

직접 인용은 허용된 원문 span의 실제 문자열이어야 한다. `paraphrase`와 `synthesis`는 출처가 있어도 의미 검토가 필요하다. 같은 origin에서 나온 여러 Unit은 독립 근거 1개로 센다. `author_added`는 출처 인용으로 가장하지 않고 작성자 확인 상태로 분리한다. 모든 valid claim도 사실 검증 완료나 발행 가능 상태가 아니며 `reviewRequired=true`, `canPublish=false`다. 이전 mapping의 block/content hash와 새 내용이 다르면 `STALE_MAPPING`/`needs_remap`으로 표시한다. 이전 mapping은 제품이 신뢰 가능한 검토 기록에서 공급해야 한다.

모델 실패를 `draft=null`로 전달하면 `unavailable` 결과만 돌려준다. source 본문에 명령형 문구가 있어도 데이터로만 비교한다. 현재 source revision과 권한을 조회하는 제품 경계는 후속 구현 대상이다.

## 반례와 검증

- 위조 source index, 다른 원문을 직접 인용한 claim, 같은 origin의 복수 인용, 변경된 source revision/hash, 수정된 block의 stale mapping을 검증했다.
- 출처 본문의 `ignore instructions`를 명령으로 실행하지 않고 정확 인용 데이터로만 처리했다. 모델 실패 전후 pack JSON이 동일했다.
- 중복 claim ID와 pack/manifest의 출처 불일치는 거부했다.
- 첫 단위 테스트는 원문에 실제 포함된 부분 문자열을 잘못된 인용으로 기대했고, 수정된 source 상태와 block mapping 오류를 같은 claim에 섞었다. 반례 입력을 분리한 뒤 Core 테스트가 통과했다.

| 실제 명령 | exit | 결과 |
| --- | ---: | --- |
| `pnpm test:unit` | 0 | Core 62개, contracts 3개, Lab 25개 통과 |
| `pnpm lint`, `pnpm format:check`, `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | 정적 검사·계약 경계·빌드·smoke 통과 |
| `npm run prep:check`, `git diff --check` | 모두 0 | 계획 75개·링크·디자인과 공백 검사 통과 |

실제 모델의 claim 품질, 사람의 의미·사실 검토, 현재 source 조회의 권한/트랜잭션 경계, 발행 화면은 미검증이다. DB·HTTP·운영 설정을 변경하지 않았다.
