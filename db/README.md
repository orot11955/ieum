# PostgreSQL migration과 role 경계

현재 DB 파일은 인증 vendor의 `auth` schema와 `business`의 workspace/member, BE-04 계정·초대·설정, BE-05 명령 receipt·감사·outbox 테이블을 만든다. 운영 DB에는 아직 적용하지 않았다.

## 적용 순서

격리/신규 DB와 기존 auth-only DB 모두 다음 순서다.

1. 별도 관리자 migration credential로 `apps/api/drizzle.config.ts`의 auth migration을 적용한다. `MIGRATION_DATABASE_URL`을 사용한다.
2. 같은 관리자 credential로 `db/admin/roles.sql`을 한 번 실행한다. 기존 역할이 위험한 속성(`LOGIN`, `SUPERUSER`, `BYPASSRLS` 등)을 가지면 실패한다.
3. `packages/backend/drizzle.config.ts`의 business migration을 적용한다. 이 migration은 auth schema가 이미 있는지와 네 privilege role이 존재하는지를 전제로 한다.
4. 애플리케이션·인증·Delivery용 실제 login credential을 별도로 발급하고 각각 `ieum_application`, `ieum_auth_runtime`, `ieum_delivery`에만 소속시킨다. 이 파일은 비밀번호나 login role을 생성하지 않는다. 기존 role·권한·배포 계정을 확인한 뒤에만 운영 적용한다.

BE-02 auth migration journal과 BE-03–05 business migration journal은 각각 `drizzle`, `drizzle_business` schema에 분리된다. Drizzle snapshot과 SQL 파일을 함께 관리한다. BE-03–05 SQL의 수동 FK·소유권·RLS·grant 절은 생성된 DDL 뒤에 의도적으로 추가했으므로 후속 `drizzle-kit generate` 출력과 diff를 검토한다. BE-04의 사용자/초대 테이블은 기존 auth 사용자 row를 수정하지 않으며, `auth.user` FK와 개인 workspace FK를 새로 건다. BE-05는 기존 설정 row에 `version=1`을 채우는 추가형 migration이다. 기존 데이터의 중복·참조 충돌은 적용 전 별도 inventory로 확인한다.

## 권한과 transaction

`ieum_migrator`는 business schema/table owner인 NOLOGIN role이다. `ieum_application`은 owner가 아니고 `BYPASSRLS`도 없다. BE-05 receipt·audit·outbox는 이 role에 `SELECT, INSERT`만 허용하고 `FORCE ROW LEVEL SECURITY`로 공간을 제한한다. `ieum_auth_runtime`은 auth vendor 테이블만 사용한다. `ieum_delivery`에는 아직 private 테이블 권한이 없다. 새 auth 테이블을 migration하면 auth runtime grant를 함께 검토해야 한다.

업무 쿼리는 검증된 membership/action을 받은 뒤 `withWorkspaceTransaction`으로 실행한다. 이 함수는 한 DB transaction 안에서 `ieum.workspace_id`를 transaction-local로 설정한다. scope가 없거나 다른 공간이면 RLS가 행을 숨기거나 쓰기를 거부한다. 임의 SQL을 실행할 권한이 있는 공격자에게는 custom GUC를 바꿀 수 있으므로 RLS는 애플리케이션 권한 검사를 대체하지 않는다. `assertApplicationDatabaseRole`은 앱 시작 시 admin/owner/BYPASSRLS/auth 겸용 URL을 거부한다. BE-04 API는 `AUTH_DATABASE_URL`과 별도 `APPLICATION_DATABASE_URL`이 모두 있어야 계정 기능을 조립한다. 인증 요청과 계정 정지·로컬 복구의 순서를 맞추는 전용 잠금 풀도 application login으로 연결한다.

## 호환성·검증·복구

auth-only DB에서 auth 사용자 row를 남긴 채 업무 migration을 적용하고, 별도 빈 DB에서 두 migration을 순서대로 적용하는 Testcontainers 시험이 있다. 두 공간의 교차 SELECT/INSERT/UPDATE/owner 연결, 빈 scope, 한 연결 pool의 scope 잔류, role 격리, BE-04 bootstrap/초대/정지와 인증 HTTP를 실제 PostgreSQL 18.4에서 검사한다. PGlite 결과로 대체하지 않는다.

업무 migration은 기존 auth row를 변환/삭제하지 않는 추가형이다. BE-05 명령은 권한 확인과 설정 version 잠금 뒤 변경·receipt·audit·outbox를 한 transaction에 저장한다. outbox 전달은 BE-06 전까지 실행되지 않는다. 앱 코드만 되돌릴 때는 새 테이블을 사용하지 않아도 되지만, 이전 API는 설정 version을 증가시키지 않으므로 BE-05 클라이언트와 함께 운영하지 않는다. 운영에서 schema를 되돌리거나 DB를 복원하려면 사전 inventory·backup·허가를 확인한 뒤 별도 절차를 만든다. 여기에는 파괴적 down migration을 제공하지 않는다.
