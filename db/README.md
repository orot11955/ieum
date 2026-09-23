# PostgreSQL migration과 role 경계

현재 DB 파일은 인증 vendor의 `auth` schema와 최소 업무 소유 범위인 `business.workspace`, `business.workspace_member`만 만든다. 운영 DB에는 아직 적용하지 않았다.

## 적용 순서

격리/신규 DB와 기존 auth-only DB 모두 다음 순서다.

1. 별도 관리자 migration credential로 `apps/api/drizzle.config.ts`의 auth migration을 적용한다. `MIGRATION_DATABASE_URL`을 사용한다.
2. 같은 관리자 credential로 `db/admin/roles.sql`을 한 번 실행한다. 기존 역할이 위험한 속성(`LOGIN`, `SUPERUSER`, `BYPASSRLS` 등)을 가지면 실패한다.
3. `packages/backend/drizzle.config.ts`의 business migration을 적용한다. 이 migration은 auth schema가 이미 있는지와 네 privilege role이 존재하는지를 전제로 한다.
4. 애플리케이션·인증·Delivery용 실제 login credential을 별도로 발급하고 각각 `ieum_application`, `ieum_auth_runtime`, `ieum_delivery`에만 소속시킨다. 이 파일은 비밀번호나 login role을 생성하지 않는다. 기존 role·권한·배포 계정을 확인한 뒤에만 운영 적용한다.

BE-02 auth migration journal과 BE-03 business migration journal은 각각 `drizzle`, `drizzle_business` schema에 분리된다. Drizzle snapshot과 SQL 파일을 함께 관리한다. BE-03 SQL의 수동 FK·RLS·grant 절은 생성된 DDL 뒤에 의도적으로 추가했으므로 후속 `drizzle-kit generate` 출력과 diff를 검토한다.

## 권한과 transaction

`ieum_migrator`는 business schema/table owner인 NOLOGIN role이다. `ieum_application`은 owner가 아니고 `BYPASSRLS`도 없으며 business 테이블의 CRUD만 갖는다. `ieum_auth_runtime`은 auth vendor 테이블만 사용한다. `ieum_delivery`에는 아직 private 테이블 권한이 없다. 새 auth 테이블을 migration하면 auth runtime grant를 함께 검토해야 한다.

업무 쿼리는 검증된 membership/action을 받은 뒤 `withWorkspaceTransaction`으로 실행한다. 이 함수는 한 DB transaction 안에서 `ieum.workspace_id`를 transaction-local로 설정한다. scope가 없거나 다른 공간이면 RLS가 행을 숨기거나 쓰기를 거부한다. 임의 SQL을 실행할 권한이 있는 공격자에게는 custom GUC를 바꿀 수 있으므로 RLS는 애플리케이션 권한 검사를 대체하지 않는다. `assertApplicationDatabaseRole`은 앱 시작 시 admin/owner/BYPASSRLS/auth 겸용 URL을 거부하기 위한 경계다. 실제 API 연결은 BE-04에서 한다.

## 호환성·검증·복구

auth-only DB에서 auth 사용자 row를 남긴 채 업무 migration을 적용하고, 별도 빈 DB에서 두 migration을 순서대로 적용하는 Testcontainers 시험이 있다. 두 공간의 교차 SELECT/INSERT/UPDATE/owner 연결, 빈 scope, 한 연결 pool의 scope 잔류, role 격리를 실제 PostgreSQL 18.4에서 검사한다. PGlite 결과로 대체하지 않는다.

업무 migration은 기존 auth row를 변환/삭제하지 않는 추가형이다. 앱 코드만 되돌릴 때는 business schema를 사용하지 않아도 된다. 운영에서 schema를 되돌리거나 DB를 복원하려면 사전 inventory·backup·허가를 확인한 뒤 별도 절차를 만든다. 여기에는 파괴적 down migration을 제공하지 않는다.
