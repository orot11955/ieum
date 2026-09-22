> 2026-09-23 기준: 보존된 세부 설계 또는 과거 검토입니다. 현재 실행 순서·런타임·작업 상태는 [단일 실행 계획](../plan/README.md)과 [ADR 0012](../adr/0012-main-zero-base-execution.md)를 우선합니다. 옛 M/S/I 단계와 예시 명령은 현재 구현 상태를 뜻하지 않습니다. 원본·출처·권한·디자인 안전 계약은 유지하며 Paper/Dark 모두 현재 기준입니다.

# 인증 · 회원 · 소유 범위 · 권한

- 개정: 2026-09-22
- 상태: 설계안. 보안성 검증 완료 또는 특정 표준 준수를 의미하지 않는다.

## 1. 계정과 데이터 소유를 분리한다

User는 로그인 계정, Workspace는 개인 데이터 경계, WorkspaceMembership은 그 공간에서의 역할이다. 초기에는 계정당 기본 개인 Workspace 하나와 Owner membership을 만든다. 서비스 초대는 새로운 계정을 허용하는 것이지 초대한 사람의 공간을 공유하는 것이 아니다.

첫 제품은 Owner-only 개인 공간으로 시작한다. Editor/Viewer와 publish capability는 후속 명시적 공유를 위한 계약이며 공유 UI/API가 검증되기 전에는 grant를 생성할 수 없다. 여러 사용자 계정을 수용하는 것과 협업 SaaS를 만드는 것은 다르다.

InstanceOperator는 계정·운영 설정·장애·백업 상태를 관리한다. 이 역할만으로 개인 콘텐츠를 읽거나 발행할 권한을 주지 않는다. 운영자에게도 자기 공간의 Owner membership을 별도로 준다. 단, 서버/DB를 직접 통제하는 운영자를 암호학적으로 차단하는 종단간 암호화 설계는 아니다. 애플리케이션 권한 경계와 인프라 신뢰 경계를 혼동하지 않는다.

## 2. 인증 기본안

관리 웹과 관리 API는 가능한 한 동일 origin으로 제공하고 **서버 DB 세션 + HttpOnly 쿠키**를 쓴다. 브라우저 localStorage의 장기 JWT를 기본안으로 삼지 않는다. 서비스 간 Delivery 키는 이 로그인 세션과 별도다.

인증 구현 우선 후보는 Better Auth의 Fastify/Drizzle 어댑터다. 공식 통합 문서는 존재하지만 IEUM의 초대 제한, 계정 정지, 즉시 세션 철회, MFA, 감사 요구까지 자동으로 충족하는 것은 아니다. F 단계의 작은 통합 시험과 적용되는 보안 advisory 검토 후 버전을 lockfile에 고정한다. 충족하지 못하면 인증 어댑터 결정부터 변경하고 인증 프로토콜을 임의 구현하지 않는다. [Fastify](https://better-auth.com/docs/integrations/fastify) · [Drizzle](https://better-auth.com/docs/adapters/drizzle) · [보안 공지](https://github.com/better-auth/better-auth/security/advisories)

필수 기본 기능은 이메일 식별자+비밀번호, 비밀번호 재설정, 기기별 세션·철회, TOTP와 일회용 복구 코드다. SSO, OAuth provider, device flow, billing 등의 불필요한 플러그인은 켜지 않는다. passkey는 검증 후 후속 추가한다. 라이브러리 admin/organization 플러그인이 이음의 소유 범위 정책을 대신한다고 가정하지 않는다.

비밀번호 정책 제안: 최소 15 code point, 적어도 64자 이상 허용, 공백·붙여넣기·password manager 허용, 유출/일반 비밀번호 차단, 임의 조합 강제·정기 변경 강제 없음. 해시는 검증된 라이브러리의 유지보수되는 KDF를 사용하고 비용을 대상 서버에서 측정한다. 수동 SHA hash나 가역 암호화로 대체하지 않는다. 이는 NIST password 지침을 참고한 제품 정책이며 IEUM의 NIST 인증을 뜻하지 않는다. [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)

## 3. 설치·가입·복구

최초 운영자는 서버에서 실행하는 일회성 대화형 bootstrap 명령으로 만든다. 고정 초기 비밀번호, 누구나 호출하는 첫 관리자 HTTP endpoint, 비밀번호의 shell history/로그 노출을 금지한다. 동시 초기화 요청으로 운영자가 중복 생기지 않도록 제약을 둔다.

공개 가입 endpoint는 기본 비활성이다. 초대는 발급자, 대상 이메일, 만료, 사용/취소 상태, 토큰 digest를 저장하며 수락을 원자적으로 한 번만 허용한다. 이메일 문자열만 같다고 외부 OAuth identity와 자동 연결하지 않는다. 최초 계정과 개인 Workspace 생성은 재시도해도 중복되지 않아야 한다.

설정값 초안: 초대 72시간, 비밀번호 재설정 30분, 민감 작업 재인증 10분. 이는 표준의 고정값이 아니라 배포 환경에서 조절할 제품 기본값이다. 토큰은 원문 로그를 남기지 않으며 URL의 token/query는 프록시와 앱 로그 모두 마스킹한다.

메일 전송이 가능한 경우 수신자 확인과 재설정 흐름을 사용한다. 메일 없는 로컬 설치는 이메일을 식별자로만 쓰고 검증됨으로 위장하지 않는다. 로컬 운영자 복구 CLI는 서버 접근을 요구하고, 새 복구 수단 등록·기존 세션/일회용 토큰 철회·감사 기록을 남긴다. 원격 숨은 master password나 임의 사용자 impersonation은 만들지 않는다.

TOTP 설정은 코드 확인 후 활성화한다. 복구 코드는 재사용 불가로 저장하고 등록/재발급/사용을 기록한다. 비밀번호나 MFA 변경·복구 시 관련 세션을 철회한다. 인터넷에서 관리 앱을 열기 전 운영자와 발행 가능 계정에 MFA를 요구하는 것을 릴리스 기준으로 한다. TOTP를 phishing-resistant라고 표시하지 않는다.

## 4. 세션 수명과 브라우저 경계

운영 쿠키는 Secure, HttpOnly, SameSite=Lax, Path=/, Domain 생략의 host-only를 기본으로 한다. 호환되는 경우 `__Host-` prefix를 사용한다. 내부 앱 쿠키를 외부 블로그 도메인과 공유하지 않는다. 로그인/MFA 완료·권한 상승 때 session fixation을 막고 오래된 세션을 폐기한다. [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

초기 세션 예산은 절대 수명 7일, 사용자 활동 없는 상태 12시간, 민감 작업 재인증 10분이다. 세 값은 별도이며 자동 polling/백그라운드 조회가 사용자 활동을 영구 연장해서는 안 된다. 서버에서 만료를 검증한다. 라이브러리의 sliding expiry만으로 절대 수명을 구현했다고 간주하지 않는다.

즉시 철회 요구 때문에 초기 cookie session cache는 비활성이다. 매 보호 요청에서 세션·계정 상태·공간 membership을 확인한다. 권한 변경/계정 정지 시 authzVersion을 갱신하고 캐시를 무효화한다. Better Auth 문서도 cookie cache 사용 시 다른 기기의 철회 반영이 지연될 수 있다고 명시한다. [Session cache](https://better-auth.com/docs/concepts/session-management)

변경 요청은 검증된 CSRF 보호와 정확한 Origin 검사를 적용한다. CORS나 SameSite만으로 권한/CSRF 검사가 끝났다고 보지 않는다. 프록시 host/header를 신뢰할 범위를 설정하고 임의 callback/returnTo를 허용하지 않는다. 인증 라이브러리의 자체 endpoint와 앱 endpoint 양쪽을 테스트한다. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

로그인·재설정·초대 요청은 계정과 IP 기반 제한을 조합하고 영구 계정 잠금 악용을 막는다. 초기 제한값은 부하·오탐 시험 후 config로 정한다. 세션 화면은 생성/마지막 활동/대략적인 기기와 직접 해제 기능을 제공하며 세션 token은 반환하지 않는다. 로그아웃 때 사용자별 Query cache·개인 임시 저장을 정리한다.

## 5. 회원 상태와 탈퇴

INVITED → ACTIVE ↔ SUSPENDED, ACTIVE/SUSPENDED → DELETION_PENDING → DELETED를 기본 전이로 둔다. 로그인 시도 제한은 별도 security 상태다. 정지는 세션·개인 API credential을 차단하고 미실행 민감 job은 보류한다. 보안 사고 시 공개 제공까지 막는 `deliveryBlocked`는 별도 명시 명령이며 감사한다. 정지 해제만으로 오래된 token을 되살리지 않는다.

탈퇴 요청은 원문·첨부·발행본·비밀키·백업 잔존 범위와 유예기간을 미리 보여준다. DELETION_PENDING은 일반 접근을 막되 복구/취소 전용 재인증 흐름을 둘 수 있다. 처리 후 auth credential을 제거하고 감사에 필요한 최소 식별자만 정책에 따라 남긴다. 영구 보존이나 완전한 즉시 삭제를 약속하지 않는다.

마지막 InstanceOperator 또는 Workspace Owner를 제거할 수 없다. 후속 공동 공간에서 소유권 이전은 후임의 동의와 원자적인 membership 변경이 필요하다. 운영자 정지가 사용자 콘텐츠의 자동 소유권 이전을 뜻하지 않는다.

## 6. 권한 모델

공식 규칙은 `계정 활성 ∧ 세션/credential 유효 ∧ membership ∧ action 허용 ∧ resource의 같은 workspace ∧ 상태 전이 허용 ∧ 필요한 재인증`이다. 조건 하나라도 불충족하면 deny다. 메뉴 숨김은 UX 보조이고 모든 요청과 데이터 접근에서 검증한다. [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

| 작업 | InstanceOperator만 | Workspace Owner | Editor (후속) | Viewer (후속) | DeliveryClient |
| --- | --- | --- | --- | --- | --- |
| 계정 초대·정지/운영 설정 | 가능 | 불가 | 불가 | 불가 | 불가 |
| 개인 기록·일정·위키 조회 | 불가 | 자기 공간 | 허용 공간 | 허용 공간 | 불가 |
| 개인 기록·일정·위키 편집 | 불가 | 가능 | 가능 | 불가 | 불가 |
| 문서 작성·revision 생성 | 불가 | 가능 | 가능 | 불가 | 불가 |
| 공개 발행·개정·철회 | 불가 | 가능 | publish capability가 추가된 경우만 | 불가 | 불가 |
| 공간 설정·멤버/키 관리 | 불가 | 가능 | 불가 | 불가 | 불가 |
| 공간 전체 export·영구 삭제 | 불가 | 재인증 후 | 불가 | 불가 | 불가 |
| 개인 상세 판단 trace | 불가 | 가능 | source 접근 범위 내 | 명시 허용한 read 범위 내 | 불가 |
| 허용된 발행본 조회 | 공개 정책에 따름 | 공개 정책에 따름 | 공개 정책에 따름 | 공개 정책에 따름 | client scope 내 |
| 운영 로그·전체 백업 상태 | 마스킹 범위 내 | 자기 작업만 | 자기 작업만 | 불가 | 불가 |

publish는 계층적으로 더 높은 역할이 아니라 Editor에 추가할 수 있는 좁은 capability다. Owner도 CSRF·revision·공개 검사·재인증을 생략하지 않는다. API key는 역할 승격 수단이 아니다. 첫 제품은 개인 공간 Owner만 활성화하고, 공유를 켤 때 matrix 전체를 테스트한다.

Action 예: `capture.read/write`, `task.write`, `wiki.write`, `document.write`, `publication.publish/withdraw`, `workspace.export/purge`, `workspace.members.manage`, `delivery.clients.manage`, `ops.users.manage`, `ops.logs.read`. 커스텀 정책 편집기·조직 hierarchy·문서별 ACL은 후속이다.

## 7. 저장·검색·worker의 격리

모든 개인 도메인 row, 첨부, judgement run, job, 알림, export manifest에 workspace_id를 둔다. 실제 행에 `(workspace_id,id)` unique와 같은 범위의 composite FK를 적용해 다른 공간의 Unit/Context/Document를 연결하지 못하게 한다. 전역 UUID가 추측하기 어렵다는 이유로 권한을 생략하지 않는다.

workspace ID는 클라이언트가 지정하더라도 서버가 membership을 검증한다. 조회 필터·총 개수·자동완성·벡터 후보·그래프·source pack·다운로드·export·cache key까지 같은 scope를 사용한다. 금지 자료를 모델에 보낸 뒤 결과에서 지우는 방식은 허용하지 않는다.

애플리케이션 정책을 기준으로 하되 PostgreSQL RLS를 방어 계층으로 도입한다. 운영 DB role은 owner/superuser/BYPASSRLS가 아니어야 하며 필요 시 FORCE ROW LEVEL SECURITY, transaction-local scope, connection pool 재사용·scope 미설정 거부를 검증한다. auth/system table의 별도 role과 공개 projection read role을 구분한다. RLS만으로 publish 권한이나 상태 전이를 검사할 수는 없다. [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)

job enqueue와 실행/결과 적용 때 각각 현재 권한과 base revision을 확인한다. 사용자 탈퇴/정지/권한 철회 뒤 오래된 worker가 공개·export를 완료하지 못하게 한다. Core에는 이미 필터링한 불변 snapshot만 전달한다.

## 8. 발행 credential과 테스트

DeliveryClient는 channel/workspace, scope, expiry, revokedAt, lastUsedAt을 가진다. 키 원문은 발급 때 한 번만 표시하고 digest로 검증하며 로그/URL/브라우저 bundle에 넣지 않는다. 서명용 webhook secret과 검증용 API key 저장 방식은 다르다. 공개 endpoint를 쓸 때는 비밀이 없는 명시적인 public-read 계약을 택한다.

필수 검사는 다른 계정의 ID 직접 요청·검색 요약·파일 URL·export/job ID·벡터 후보 차단, auth endpoint를 통한 초대 우회 차단, MFA 우회, token 재사용/철회, session fixation, 권한 변경 직후 접근, 운영자 콘텐츠 기본 접근 차단, Editor 발행 거부, 서비스 키 관리 API 거부다. 요구에 맞지 않는 라이브러리 기본값은 릴리스 전 수정한다.
