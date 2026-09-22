# 데이터 관리 · 로그 · 작업 · 백업 · 운영

- 개정: 2026-09-22
- 상태: 제품 운영 설계안. 보존 기간·용량·RPO/RTO는 잠정 운영값이며 법적 기준 또는 실측 보장이 아니다.

## 1. 데이터의 종류와 경계

| 종류 | source of truth | 접근 원칙 |
| --- | --- | --- |
| 개인 원본·일정·할일·위키·초안 | PostgreSQL + private asset | Workspace 소유 범위 |
| 불변 문서 revision·출처 | revision/source mapping | 공개본과 별도, private 기본 |
| 검색 profile·embedding | 원본에서 재생성 가능한 artifact | 원본과 같은 개인정보 범위 |
| 공개 콘텐츠 | 승인한 publication snapshot·public asset | 명시한 공개 정책과 철회 검사 |
| 인증·provider secret | auth 저장소/secret store | 일반 앱 DTO·export·로그에서 제외 |
| 감사/보안/운영/판단 기록 | 목적별 log/trace store | 로그라는 이유로 전 사용자 열람 허용하지 않음 |
| Import/Export/Backup | manifest를 가진 작업 결과 | 서로 다른 권한·수명·보관 범위 |

제품 데이터 관리 화면은 목록·필터·사용처·용량·무결성·휴지통·이식 작업을 제공한다. 임의 SQL 실행이나 전체 DB table 편집기를 넣지 않는다.

## 2. 파일·첨부

파일 metadata에 workspace, uploader, originalName, opaque storageKey, detectedType, size, checksum, validationState, usage refs, createdAt을 둔다. 파일명/경로는 사용자 입력으로 저장 위치를 결정하지 않는다. 저장 구현은 로컬 volume 또는 S3-compatible adapter 중 하나로 시작하고 API 계약은 asset ID를 사용한다.

초기 허용안은 Markdown/plain text, PNG/JPEG/WebP, PDF다. 파일별 20 MiB, 이미지 pixel 한도, 사용자별 quota 등은 설정값 예시이며 실제 장비와 사용성 시험에서 조정한다. 확장자·선언 MIME·signature를 함께 검사하고 실행 파일, HTML, SVG, MDX, 임의 archive는 일반 첨부로 기본 차단한다. 허용 PDF도 무해하다는 뜻은 아니며 private download 또는 격리 preview로 처리한다.

상태는 PENDING→VERIFIED/REJECTED다. 악성 콘텐츠 검사/안전한 이미지 재인코딩/metadata 제거를 적용하고 public upload를 켜기 전 필수 검사기를 검증한다. 검사 전 본문 삽입·공개·model ingestion을 허용하지 않는다. 저장소는 webroot 밖에 두고 private 다운로드마다 권한을 검사한다. [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

문서의 `asset://id`를 내부 renderer가 허용된 asset 조회로 바꾸는 안을 사용한다. 발행은 검증한 public derivative와 별도 공개 ID를 만든다. private 파일 signed URL을 공개 본문에 영구 저장하지 않는다. 썸네일·preview·export도 동일한 권한을 갖는다. 직접 파일 URL이 철회를 우회하는지 테스트한다.

파일 삭제는 사용 중인 문서/공개본/원본 근거를 보여준다. 공개 사용처가 있으면 철회·교체 없이 영구 삭제하지 않고 명시적 충돌로 처리한다. 고아 파일 정리는 참조 확인과 유예기간 후 수행한다. deduplication은 Workspace 내에서만 시작하며 다른 사용자의 동일 파일 존재를 노출하지 않는다.

## 3. 외부자료 수집

P 단계는 URL·저자·제목·발췌·내 해석을 수동 저장하는 것부터 완성한다. URL 저장이 자동 네트워크 요청을 뜻하지 않는다. 자동 fetch는 기능 플래그 뒤의 별도 worker로 추가한다.

fetch worker는 HTTP(S) 목적지·redirect·DNS/IP를 검증하고 loopback/private/link-local/metadata 범위를 차단한다. 정규식 URL 검사 하나로 끝내지 않고 egress 제한·DNS rebinding 대응·응답 크기·timeout·redirect 예산을 둔다. 일반 인터넷 수집과 관리자가 설정한 로컬 모델 endpoint는 별도 신뢰 경계다. 사용자가 문서 URL로 내부 모델/관리 포트에 접근할 수 없어야 한다. webhook 호출에도 동일하게 적용한다. [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

수집 내용은 untrusted text이며 모델에 실행 지시로 전달하지 않는다. 출처·저자·접근일·원문 발췌와 새 해석을 분리한다. 외부 페이지 전체를 저장했다는 이유로 그 전체를 공개 재배포하지 않는다. private 자료와 publication의 공개 필드 선택을 별도로 수행한다.

## 4. 가져오기·내보내기

초기 portable format은 Markdown + JSON manifest + assets다. manifest에 schema version, source IDs, revision, 관계, timezone/date 표현, checksum을 넣는다. 기존 인증 token·provider secret·session·다른 공간의 source는 포함하지 않는다. 임베딩·캐시는 기본 제외하고 재생성한다.

Import는 업로드→schema/size/경로 검사→dry-run→건수/중복/충돌 preview→사용자 적용→job 결과 순서다. 한 import batch의 재시도는 sourceKey/manifest hash로 중복을 막는다. 기존 ID와 겹치면 안전한 remapping 또는 사용자가 선택한 merge를 수행한다. title이 같다는 이유만으로 위키를 덮어쓰지 않는다. 입력에 READY/PUBLISHED가 있더라도 자동 발행하지 않는다.

zip bundle은 일반 첨부와 다른 제한된 import 기능이다. path traversal·절대 경로·symlink·압축 폭탄·해제 후 총량/파일 수·중첩 archive를 검증한다. 실패는 항목별 상태와 rollback 또는 명시적인 부분 성공으로 보고한다. `commit 모두 성공`을 주장하려면 실제 transaction/batch 경계가 그 의미를 보장해야 한다.

Export 생성과 다운로드 둘 다 현재 권한을 확인한다. 완료 알림만 보내고 private download는 인증된 단기 경로로 제공한다. 초안·기록이 담긴 결과물을 공개 object URL로 노출하지 않는다. 초기 결과물 만료 24시간은 운영 기본값 제안이다. owner의 전체 export에는 최근 재인증을 요구한다. 읽기 가능한 문서의 복제 자체를 기술적으로 완전히 막겠다는 의미는 아니다.

## 5. 휴지통·보존·삭제

휴지통 보존은 초기 30일 제안이다. 삭제 즉시 정상 목록·검색·후속 판단에서 제외하고 profile/cache/index를 무효화한다. 작업 중인 job이 삭제 전 snapshot을 사용해 결과를 다시 살아나게 하지 못하도록 적용 직전에 source revision/deleted 상태를 확인한다.

복원은 같은 ID의 충돌·깨진 source·삭제된 parent를 검사한다. Undo는 무제한 타임머신이 아니다. source가 삭제된 문서는 unresolved reference를 표시한다. 영구 삭제는 영향 목록·재인증·명시 동의·감사 후 처리한다.

백업에 남은 자료는 별도 만료 정책을 따른다. 삭제 직후 모든 이전 백업 파일을 즉시 다시 쓰겠다고 약속하지 않는다. 복원할 때 삭제/철회 이력의 reconciliation 절차를 적용하여 제거한 데이터나 발행본을 실수로 재공개하지 않는다.

## 6. 로그를 다섯 종류로 분리한다

| 종류 | 주요 내용 | 기본 조회자 / 초기 보존 제안 |
| --- | --- | --- |
| Audit | 누가 어떤 명령으로 어떤 대상/version을 바꿨는지 | Owner의 자기 공간; 180일 |
| Security | 로그인 실패, MFA/복구, 세션/권한/키 변경, 접근 거부 | 자신의 세션 + 운영자에게 마스킹된 계정 사건; 90일 |
| Application | request route·status·duration, error code·stack | 운영자; 14일 |
| Job/Delivery | 작업 attempt·실패·재시도·webhook 결과 | 작업 소유자와 운영자의 내용 없는 운영정보; 30일 |
| Judgement trace | candidate/evidence refs, score, config/model, latency | source를 볼 수 있는 사용자; 30일 |

기간은 비용·민감도에 맞춰 설정하고 법적 보존 기간이라고 표시하지 않는다. 문서 revision과 source provenance는 로그의 짧은 TTL을 그대로 적용하지 않는다. 보존해야 하는 판단의 최소 replay manifest는 별도 정책으로 유지한다.

Audit 기본 필드: eventId, occurredAt, actorId/type, workspaceId, action, targetType/id, beforeVersion/afterVersion, changedFieldNames, result, reasonCode, requestId, commandId, jobId?. 필드 변경의 실제 원문 diff는 기본 감사 row에 복제하지 않고 접근 통제된 revision으로 참조한다.

원문·prompt 전체·password·session/API token·reset URL token·DB 연결문자열·secret을 일반 로그에 기록하지 않는다. 사용자 입력은 구조화·길이 제한·마스킹하여 로그 인젝션을 막는다. 로그 조회와 export도 감사한다. [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

핵심 변경의 감사 row는 데이터 변경과 같은 transaction에 insert한다. 일반 app role이 과거 audit row를 UPDATE/DELETE하지 못하게 하고, retention job은 별도 제한된 권한으로 삭제한다. 외부 append-only 수집은 후속 방어다. DB/서버 운영자가 통제하는 로그를 절대 변조 불가라고 주장하지 않는다.

로그 UI는 기간·유형·actor·action·대상·결과·연관 ID로 검색하고 권한 없는 본문은 표시하지 않는다. Core 상세 trace는 운영자 콘솔의 일반 오류 상세 화면으로 연결하지 않는다. 공개 Delivery access log는 query/token/header 마스킹과 집계 우선으로 처리한다.

## 7. 비동기 작업과 알림

초기 작업 종류는 profile/embedding 갱신, import/export, 파일 검증, 문서 보조, 알림이다. 공개본 생성은 transaction으로 끝내고 캐시 갱신/webhook 전달만 후속 job으로 분리한다. 예약 발행은 X다.

PostgreSQL job/outbox table로 시작할 수 있다. job은 type, workspace, actor, payload refs, base revisions, status, attempt, runAfter, leaseUntil, dedupeKey, lastErrorCode를 가진다. 정상 commit 뒤 작업이 사라지지 않도록 outbox를 같은 transaction에 기록한다.

실행은 at-least-once를 전제로 idempotent하게 만든다. lease·heartbeat·timeout, retry 가능한 오류 구분, 지수 backoff+jitter, 최대 attempt, cancel, 수동 retry, 처리 불가 상태를 제공한다. 같은 payload로 재시도해 중복 Task/Publication을 만들지 않는다. 메모리 큐만으로 완료를 보장하지 않는다.

actor 계정/Workspace 권한과 source 상태는 enqueue·실행·결과 적용 시 재검사한다. 모델 장애는 일반 CRUD readiness를 실패로 만들지 않는다. bounded concurrency와 workspace별 quota를 적용하여 긴 정제 작업이 원문 저장을 독점하지 않게 한다.

인앱 Notification은 eventId+recipient로 dedupe하고 읽음/보관 상태를 가진다. 작업 완료·실패·의미 있는 제안·보안 사건을 우선한다. 추천마다 즉시 알림을 쌓지 않고 빈도·묶음·끄기 설정을 제공한다. 이메일은 계정 복구/초대부터, 일반 푸시는 후속이다.

## 8. 백업·복원

개인 Export와 전체 인스턴스 Backup은 다른 기능이다. 웹 운영 콘솔은 백업 성공 시각·범위·checksum·실패·복원 시험 상태를 우선 보여준다. 임의 경로 복사, shell 실행, 전체 DB dump 다운로드, 운영 환경 원클릭 덮어쓰기를 기본 관리 API로 열지 않는다. 복원은 제한된 서버 운영 절차로 수행한다.

전체 Backup에는 같은 시점의 DB, immutable asset/manifest, 필요한 설정과 별도 보호한 secret 복구 절차가 필요하다. DB dump만 있고 첨부가 없으면 완전한 복원이 아니다. 서비스의 쓰기 정지 구간 또는 일관된 manifest를 사용하고 실행 방법을 runbook에 기록한다.

초기 운영 목표 예시: 일일 암호화 백업, 최근 7개 일일+4개 주간본, 다른 장애 영역의 사본, RPO 24시간/RTO 4시간. 이는 허용할 손실·복원 시간의 제안이며 복원 시험 전 달성했다고 표시하지 않는다. 더 짧은 손실 목표는 PITR 등 별도 결정으로 확장한다. 실시간 PostgreSQL data directory를 일반 파일 동기화만으로 백업하지 않는다.

복원 시험은 새 격리 환경에서 DB migration/version·첨부 checksum·원본 수·위키 열람·문서 version·검색 재생성을 확인한다. 공개 Delivery는 기본 차단한 채 삭제/철회 이력을 대조하고 세션/token을 재검토·철회한 뒤 켠다. 인증 비밀 복원과 key rotation의 영향을 점검한다.

## 9. 운영 상태·설정·배포

건강 상태는 liveness와 readiness를 분리한다. 공개 health는 세부 버전/경로/secret을 반환하지 않는다. DB·저장소 실패, error rate, p95, queue age, job 실패, 디스크/quota, 마지막 백업/복원 시험을 운영자에게 보여준다. 모델 provider의 장애는 별도 보조 상태다.

Pino 구조화 JSON stdout와 제한된 DB 감사/작업 화면부터 시작한다. 이미 관측 인프라가 있다면 collector로 보내되 로그 수집 도구 전체를 이음의 필수 의존성으로 넣지 않는다. 장애 알림 기준은 부하 시험에서 정하고 백업 실패·디스크 부족·반복 job 실패를 우선한다.

설정은 개인(시간대·locale·표시·알림), Workspace(Core 허용·export·quota), 인스턴스(origin·mail·storage·auth·retention)로 분리한다. secret 값은 암호화 저장소나 환경/secret 파일을 사용하고 `설정됨/교체/제거`만 보여준다. 설정 변경은 version·actor·영향·rollback 범위를 남긴다.

배포 전 schema migration, dependency/advisory 검사, 공개 DTO 누출 테스트, backup 확인을 수행한다. HTTP body/업로드 제한은 proxy와 app 양쪽에 일관되게 적용한다. 내부망도 인증·TLS·권한을 생략할 근거가 아니다. 디버그 endpoint, 임의 SQL, shell 작업, 미완성 public signup은 운영에 노출하지 않는다.

## 10. 릴리스 전 운영 반례

작업 중 프로세스 종료, object 쓰기 후 DB 실패, duplicate job delivery, 파일 checksum 불일치, export 중 권한 철회, soft-delete 후 stale embedding, 백업에 남은 철회 문서, private signed URL의 공개 유출, 로그 수집기 장애를 시험한다. 실패를 발견하면 복구 동작과 사용자 표시까지 완료한 후 해당 기능을 켠다.
