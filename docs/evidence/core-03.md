# CORE-03 · 한국어·식별자 lexical 기준선

- 상태: **IMPLEMENTED**. 로컬 검증 완료; 원격 Linux CI 검증 전.
- 선행: CORE-02 VERIFIED. 작업 기준 main `5274bbe36538cee67cad7d144c6bda94b01297cd`.
- 환경: macOS arm64, Node 24.18.0, pnpm 11.24.0. 테스트 입력은 합성 문자열이며 사용자 자료가 아니다.

## 구현·계약

`computeLexicalFeatures`는 이미 검증된 고정 snapshot의 Unit 본문만 읽는다. NFKC·소문자 정규화 결과는 검색용이며 원문, revision, UTF-16 source span을 수정하지 않는다. 한국어 연속 음절의 2/3-gram, 영문 word와 C++/C#/버전/경로/CLI 옵션 식별자 토큰을 만든다. 고정 설정의 normalizer/tokenizer/IDF 버전을 출력에 포함한다.

IDF corpus는 query를 제외한 후보 Unit을 원본 `originKey`별로 묶은 집합이다. 하나의 원본에서 여러 Unit이 나와도 각 토큰의 문서 빈도는 최대 한 번 증가한다. `idf = ln((origin count + 1) / (document frequency + 1)) + 1`, TF는 raw count, 결과는 Unit별 TF-IDF cosine이다. Unit ID/revision 정렬과 토큰 정렬로 입력 배열 순서가 바뀌어도 결과를 고정한다. 빈 query/candidate는 `cosine: null`과 별도 상태로, 공유 토큰이 없는 비교는 `cosine: 0`과 `no_shared_terms`로 나타낸다. 부정문에는 `negation_unmodeled` slice를 붙인다. cosine은 의미 일치 확률이나 사실 정확도가 아니다.

## 로컬 검증

| 명령 | exit | 결과 |
| --- | ---: | --- |
| `npm run prep:check` | 0 | 계획·디자인 검사 통과 |
| `pnpm --filter @ieum/core test` | 0 | Core 22개 통과. C++/C#, 버전·경로·CLI 옵션, 한영 혼용, 조사·띄어쓰기, 빈 벡터, 부정문, 같은 원본의 DF, query 배제, 입력 순서, 원문 span 보존 포함 |
| `pnpm --filter @ieum/core typecheck` | 0 | Core 타입 검사 통과 |
| `pnpm lint`, `pnpm format:check` | 각각 0 | lint·포맷 통과 |
| `pnpm test:unit` | 0 | Core 22개, contracts 3개, Lab adapter/CLI 1개 통과 |
| `npm run plan:check`, `pnpm contracts:check` | 각각 0 | 75개 카드 정합성·생성 계약·Core 경계 검사 통과 |
| `pnpm typecheck`, `pnpm build`, `pnpm lab:smoke` | 모두 0 | workspace 타입·빌드와 기존 smoke 통과 |
| `git diff --check` | 0 | 공백 오류 없음 |

첫 Core 테스트와 타입 검사는 식별자 정규식의 잘못된 반복 기호로 exit 1/2였다. 정규식을 수정한 뒤 위 명령이 통과했다.

## 한계·데이터 영향

문자 n-gram은 조사·띄어쓰기 차이에 대한 겹침을 제공하지만 형태소·의미·부정을 해석하지 않는다. 부정 탐지는 제한된 표면형 진단이다. 실제 검색 품질, 권한 범위의 backend 적용, DB, 운영 데이터는 검증하지 않았다. 원문·스키마·운영 데이터 변경은 없다.
