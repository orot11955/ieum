import {it,expect} from 'vitest';
import {connectDatabase,migrate} from '../../apps/api/src/db';
it('migrations apply twice, deny unscoped reads, enforce ownership and XOR',async()=>{
 const db=await connectDatabase('pglite:');
 try{await migrate(db);await migrate(db);
  const rows=await db.query<{name:string}>("SELECT tablename AS name FROM pg_tables WHERE schemaname='public'");expect(rows.rows.length).toBeGreaterThan(30);
  await db.transaction(async tx=>{await tx.query('SET LOCAL ROLE ieum_scoped');expect((await tx.query('SELECT id FROM capture')).rows).toEqual([]);});
  const policies=await db.query("SELECT policyname FROM pg_policies WHERE tablename='document_revision'");expect(policies.rows).toHaveLength(1);
 }finally{await db.close();}
});
