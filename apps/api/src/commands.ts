import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Database,Executor} from './db';
import type {Principal} from './auth';
import {invariant,AppError} from './errors';
export function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
}
export const fingerprint=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export async function assertActor(tx:Executor,actor:Principal){
 await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['actor:'+actor.userId]);
 const ok=await tx.query('SELECT u.id FROM auth_user u JOIN workspace_member m ON m.user_id=u.id WHERE u.id=$1 AND u.status=\'ACTIVE\' AND m.workspace_id=$2',[actor.userId,actor.workspaceId]);
 invariant(ok.rows.length===1,'ACCESS_REVOKED','계정 또는 공간 접근이 변경되었습니다.',403);
}
export async function readScoped<T>(db:Database,actor:Principal,fn:(tx:Executor)=>Promise<T>){return db.scoped(actor.workspaceId,actor.userId,async tx=>{await assertActor(tx,actor);return fn(tx);});}
export async function command<T>(db:Database,actor:Principal,action:string,key:unknown,payload:unknown,fn:(tx:Executor,commandId:string)=>Promise<T>):Promise<T>{
 const idempotencyKey=z.string().min(8).max(128).regex(/^[\w:.-]+$/).parse(key);const hash=fingerprint(payload);
 return db.scoped(actor.workspaceId,actor.userId,async tx=>{
  await assertActor(tx,actor);
  const id=randomUUID();const inserted=await tx.query<{id:string}>('INSERT INTO command_receipt(id,workspace_id,actor_id,action,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id,actor_id,action,idempotency_key) DO NOTHING RETURNING id',[id,actor.workspaceId,actor.userId,action,idempotencyKey,hash]);
  if(!inserted.rows.length){
   const row=(await tx.query<{request_hash:string;response:T}>('SELECT request_hash,response FROM command_receipt WHERE workspace_id=$1 AND actor_id=$2 AND action=$3 AND idempotency_key=$4',[actor.workspaceId,actor.userId,action,idempotencyKey])).rows[0];
   if(!row||row.request_hash!==hash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','같은 요청 키를 다른 내용에 사용할 수 없습니다.');
   return row.response;
  }
  const result=await fn(tx,id);
  await tx.query('UPDATE command_receipt SET response=$1::jsonb WHERE id=$2',[JSON.stringify(result),id]);return result;
 });
}
export async function audit(tx:Executor,actor:Principal,action:string,targetType:string,targetId:string,version:number|null,commandId:string){
 await tx.query('INSERT INTO audit_event(id,workspace_id,actor_id,action,target_type,target_id,version,command_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),actor.workspaceId,actor.userId,action,targetType,targetId,version,commandId]);
}
export function checkVersion(current:number,expected:number){invariant(current===expected,'VERSION_CONFLICT','다른 기기에서 수정되었습니다. 입력을 보존하고 최신 버전과 비교해 주세요.',409);}
export const likePattern=(q:string)=>'%'+q.replace(/[\\%_]/g,'\\$&')+'%';
