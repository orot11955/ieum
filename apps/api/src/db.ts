import {Pool, type PoolClient} from 'pg';
import {drizzle as pgDrizzle} from 'drizzle-orm/node-postgres';
import {drizzle as liteDrizzle} from 'drizzle-orm/pglite';
import {authSchema} from './auth-schema';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {PGlite,Transaction} from '@electric-sql/pglite';
export interface Result<T=Record<string,unknown>>{rows:T[];rowCount:number}
export interface Executor{query<T=Record<string,unknown>>(text:string,params?:unknown[]):Promise<Result<T>>}
export interface Database extends Executor{
 kind:'postgres'|'pglite';orm:ReturnType<typeof pgDrizzle<typeof authSchema>>|ReturnType<typeof liteDrizzle<typeof authSchema>>;
 transaction<T>(fn:(tx:Executor)=>Promise<T>):Promise<T>;
 scoped<T>(workspaceId:string,actorId:string,fn:(tx:Executor)=>Promise<T>):Promise<T>;
 close():Promise<void>;
}
function pgExecutor(client:Pool|PoolClient):Executor{return {async query<T>(text:string,params:unknown[]=[]){const r=await client.query(text,params);return {rows:r.rows as T[],rowCount:r.rowCount??0};}};}
function liteExecutor(client:PGlite|Transaction):Executor{return {async query<T>(text:string,params:unknown[]=[]){const r=await client.query<T>(text,params);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};}};}
export async function connectDatabase(url:string):Promise<Database>{
 let core:Omit<Database,'scoped'>;
 if(url.startsWith('pglite:')){
  const {PGlite}=await import('@electric-sql/pglite');const location=url.slice('pglite:'.length)||undefined;
  const client=new PGlite(location);await client.waitReady;
  core={kind:'pglite',orm:liteDrizzle(client,{schema:authSchema}),...liteExecutor(client),transaction:fn=>client.transaction(tx=>fn(liteExecutor(tx))),close:()=>client.close()};
 }else{
  const pool=new Pool({connectionString:url,max:8,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
  core={kind:'postgres',orm:pgDrizzle(pool,{schema:authSchema}),...pgExecutor(pool),async transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');const value=await fn(pgExecutor(client));await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},close:()=>pool.end()};
 }
 return {...core,scoped:(workspaceId,actorId,fn)=>core.transaction(async tx=>{
  await tx.query('SET LOCAL ROLE ieum_scoped');
  await tx.query("SELECT set_config('ieum.workspace_id',$1,true),set_config('ieum.actor_id',$2,true)",[workspaceId,actorId]);
  return fn(tx);
 })};
}
export async function migrate(db:Database){
 const root=fileURLToPath(new URL('../../../db/migrations/',import.meta.url));
 await db.query('CREATE TABLE IF NOT EXISTS ieum_migration (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of (await readdir(root)).filter(x=>x.endsWith('.sql')).sort()){
  const body=await readFile(root+name,'utf8');const hash=createHash('sha256').update(body).digest('hex');
  await db.transaction(async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(4782901)');
   const old=(await tx.query<{checksum:string}>('SELECT checksum FROM ieum_migration WHERE name=$1',[name])).rows[0];
   if(old){if(old.checksum!==hash)throw Error(`Migration drift: ${name}`);return;}
   // Migrations are trusted repository files; application input never reaches this method.
   // PGlite's extended protocol accepts one statement. This delimiter is explicit in authored migrations.
   for(const statement of body.split('\n-- statement-breakpoint\n').map(x=>x.trim()).filter(Boolean))await tx.query(statement);
   await tx.query('INSERT INTO ieum_migration(name,checksum) VALUES($1,$2)',[name,hash]);
  });
 }
}
