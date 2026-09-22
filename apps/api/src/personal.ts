import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Database,Executor} from './db';
import type {Principal} from './auth';
import {audit,command,readScoped,checkVersion,likePattern} from './commands';
import {requireValue,invariant} from './errors';
import {captureInput,captureUpdate,contextInput,sourceInput,taskInput,taskUpdate,eventInput,pageQuery,uuid} from '../../../packages/contracts/src';

export async function createCaptureIn(tx:Executor,actor:Principal,p:z.infer<typeof captureInput>){
 const id=randomUUID(),unitId=randomUUID();
 await tx.query('INSERT INTO capture(id,workspace_id,title,kind,created_by) VALUES($1,$2,$3,$4,$5)',[id,actor.workspaceId,p.title,p.kind,actor.userId]);
 await tx.query('INSERT INTO capture_revision(workspace_id,capture_id,revision,body) VALUES($1,$2,1,$3)',[actor.workspaceId,id,p.body]);
 await tx.query('INSERT INTO thought_unit(id,workspace_id,capture_id) VALUES($1,$2,$3)',[unitId,actor.workspaceId,id]);
 await tx.query('INSERT INTO unit_revision(workspace_id,unit_id,revision,capture_id,capture_revision,start_offset,end_offset,text) VALUES($1,$2,1,$3,1,0,$4,$5)',[actor.workspaceId,unitId,id,p.body.length,p.body]);
 for(const name of [...new Set(p.tags)]){
  const tag=await tx.query<{id:string}>('INSERT INTO tag(id,workspace_id,name) VALUES($1,$2,$3) ON CONFLICT(workspace_id,name) DO UPDATE SET name=excluded.name RETURNING id',[randomUUID(),actor.workspaceId,name]);
  await tx.query('INSERT INTO capture_tag(workspace_id,capture_id,tag_id) VALUES($1,$2,$3)',[actor.workspaceId,id,tag.rows[0]!.id]);
 }
 if(p.sourceId){const src=requireValue((await tx.query<{version:number}>('SELECT version FROM source WHERE id=$1 AND deleted_at IS NULL',[p.sourceId])).rows[0]);await tx.query('INSERT INTO capture_source(workspace_id,capture_id,source_id,source_revision) VALUES($1,$2,$3,$4)',[actor.workspaceId,id,p.sourceId,src.version]);}
 return {id,version:1,unitId,unitRevision:1};
}
export class PersonalService{
 constructor(private db:Database){}
 listCaptures(actor:Principal,q:unknown){const p=pageQuery.parse(q);return readScoped(this.db,actor,async tx=>({items:(await tx.query('SELECT c.id,c.title,c.kind,c.version,c.created_at,c.updated_at,r.body,u.id AS unit_id FROM capture c JOIN capture_revision r ON r.workspace_id=c.workspace_id AND r.capture_id=c.id AND r.revision=c.version LEFT JOIN thought_unit u ON u.workspace_id=c.workspace_id AND u.capture_id=c.id WHERE c.deleted_at IS NULL AND (c.title ILIKE $1 OR r.body ILIKE $1) ORDER BY c.created_at DESC,c.id LIMIT $2 OFFSET $3',[likePattern(p.q),p.limit,p.offset])).rows}));}
 getCapture(actor:Principal,id:string):Promise<Record<string,unknown>>{uuid.parse(id);return readScoped(this.db,actor,async tx=>{
  const item=requireValue((await tx.query('SELECT c.id,c.title,c.kind,c.version,c.created_at,c.updated_at,r.body,u.id AS unit_id FROM capture c JOIN capture_revision r ON r.workspace_id=c.workspace_id AND r.capture_id=c.id AND r.revision=c.version LEFT JOIN thought_unit u ON u.workspace_id=c.workspace_id AND u.capture_id=c.id WHERE c.id=$1 AND c.deleted_at IS NULL',[id])).rows[0]);
  const memberships=(await tx.query('SELECT m.context_id,m.role,c.name FROM context_membership m JOIN context c ON c.workspace_id=m.workspace_id AND c.id=m.context_id JOIN thought_unit u ON u.workspace_id=m.workspace_id AND u.id=m.unit_id WHERE u.capture_id=$1 AND m.ended_at IS NULL AND c.deleted_at IS NULL',[id])).rows;
  return {...item,memberships};
 });}
 createCapture(actor:Principal,value:unknown,key:unknown){const p=captureInput.parse(value);return command(this.db,actor,'capture.create',key,p,async(tx,cid)=>{const out=await createCaptureIn(tx,actor,p);await audit(tx,actor,'CAPTURE_CREATED','capture',out.id,1,cid);return out;});}
 updateCapture(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=captureUpdate.parse(value);return command(this.db,actor,'capture.update',key,{id,...p},async(tx,cid)=>{
  const current=requireValue((await tx.query<{version:number}>('SELECT version FROM capture WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0]);checkVersion(current.version,p.baseVersion);const v=current.version+1;
  await tx.query('INSERT INTO capture_revision(workspace_id,capture_id,revision,body) VALUES($1,$2,$3,$4)',[actor.workspaceId,id,v,p.body]);
  const unit=requireValue((await tx.query<{id:string}>('SELECT id FROM thought_unit WHERE capture_id=$1 ORDER BY id LIMIT 1',[id])).rows[0]);
  await tx.query('INSERT INTO unit_revision(workspace_id,unit_id,revision,capture_id,capture_revision,start_offset,end_offset,text) VALUES($1,$2,$3,$4,$3,0,$5,$6)',[actor.workspaceId,unit.id,v,id,p.body.length,p.body]);
  await tx.query('UPDATE capture SET title=$1,kind=$2,version=$3,updated_at=now() WHERE id=$4',[p.title,p.kind,v,id]);
  await audit(tx,actor,'CAPTURE_REVISED','capture',id,v,cid);return {id,version:v};
 });}
 listContexts(actor:Principal){return readScoped(this.db,actor,async tx=>({items:(await tx.query('SELECT id,name,purpose,kind,version FROM context WHERE deleted_at IS NULL ORDER BY name,id')).rows}));}
 createContext(actor:Principal,value:unknown,key:unknown){const p=contextInput.parse(value);return command(this.db,actor,'context.create',key,p,async(tx,cid)=>{const id=randomUUID();await tx.query('INSERT INTO context(id,workspace_id,name,purpose,kind) VALUES($1,$2,$3,$4,$5)',[id,actor.workspaceId,p.name,p.purpose,p.kind]);await audit(tx,actor,'CONTEXT_CREATED','context',id,1,cid);return {id,version:1};});}
 attachContext(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=z.object({contextId:uuid,role:z.enum(['PRIMARY','SECONDARY']).default('SECONDARY')}).strict().parse(value);return command(this.db,actor,'capture.attach',key,{id,...p},async(tx,cid)=>{
  requireValue((await tx.query('SELECT id FROM capture WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0]);requireValue((await tx.query('SELECT id FROM context WHERE id=$1 AND deleted_at IS NULL',[p.contextId])).rows[0]);
  const unit=requireValue((await tx.query<{id:string}>('SELECT id FROM thought_unit WHERE capture_id=$1 ORDER BY id LIMIT 1 FOR UPDATE',[id])).rows[0]);
  if(p.role==='PRIMARY')await tx.query("UPDATE context_membership SET role='SECONDARY' WHERE unit_id=$1 AND ended_at IS NULL AND role='PRIMARY'",[unit.id]);
  await tx.query('INSERT INTO context_membership(id,workspace_id,unit_id,context_id,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,unit_id,context_id) WHERE ended_at IS NULL DO UPDATE SET role=excluded.role',[randomUUID(),actor.workspaceId,unit.id,p.contextId,p.role]);
  await audit(tx,actor,'CONTEXT_ATTACHED','capture',id,null,cid);return {attached:true};
 });}
 listSources(actor:Principal){return readScoped(this.db,actor,async tx=>({items:(await tx.query('SELECT s.id,s.title,s.version,r.url,r.author,r.excerpt,r.interpretation FROM source s JOIN source_revision r ON r.workspace_id=s.workspace_id AND r.source_id=s.id AND r.revision=s.version WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC,s.id LIMIT 100')).rows}));}
 createSource(actor:Principal,value:unknown,key:unknown){const p=sourceInput.parse(value);return command(this.db,actor,'source.create',key,p,async(tx,cid)=>{const id=randomUUID();await tx.query('INSERT INTO source(id,workspace_id,title,created_by) VALUES($1,$2,$3,$4)',[id,actor.workspaceId,p.title,actor.userId]);await tx.query('INSERT INTO source_revision(workspace_id,source_id,revision,url,author,excerpt,interpretation) VALUES($1,$2,1,$3,$4,$5,$6)',[actor.workspaceId,id,p.url??null,p.author,p.excerpt,p.interpretation]);await audit(tx,actor,'SOURCE_CREATED','source',id,1,cid);return {id,version:1};});}
 listTasks(actor:Principal){return readScoped(this.db,actor,async tx=>({items:(await tx.query('SELECT id,title,description,status,due_kind,due_date,due_at,time_zone,version,completed_at,created_at FROM task WHERE deleted_at IS NULL ORDER BY created_at DESC,id LIMIT 200')).rows}));}
 createTask(actor:Principal,value:unknown,key:unknown){const p=taskInput.parse(value);return command(this.db,actor,'task.create',key,p,async(tx,cid)=>{
  const id=randomUUID(),d=p.due;await tx.query('INSERT INTO task(id,workspace_id,title,description,due_kind,due_date,due_at,time_zone) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,actor.workspaceId,p.title,p.description,d.kind,d.kind==='DATE'?d.date:null,d.kind==='TIMED'?d.at:null,d.kind==='TIMED'?d.timeZone:null]);
  if(p.origin){const o=p.origin;await tx.query('INSERT INTO task_origin(id,workspace_id,task_id,unit_id,unit_revision,document_id,document_revision) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),actor.workspaceId,id,o.type==='UNIT'?o.id:null,o.type==='UNIT'?o.revision:null,o.type==='DOCUMENT'?o.id:null,o.type==='DOCUMENT'?o.revision:null]);}
  if(p.contextId)await tx.query('INSERT INTO task_context(workspace_id,task_id,context_id) VALUES($1,$2,$3)',[actor.workspaceId,id,p.contextId]);
  await audit(tx,actor,'TASK_CREATED','task',id,1,cid);return {id,version:1};
 });}
 updateTask(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=taskUpdate.parse(value);return command(this.db,actor,'task.update',key,{id,...p},async(tx,cid)=>{
  const current=requireValue((await tx.query<{version:number;completed_at:Date|null}>('SELECT version,completed_at FROM task WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0]);checkVersion(current.version,p.baseVersion);const d=p.due,v=current.version+1;
  await tx.query('UPDATE task SET title=$1,description=$2,status=$3,due_kind=$4,due_date=$5,due_at=$6,time_zone=$7,completed_at=$8,version=$9,updated_at=now() WHERE id=$10',[p.title,p.description,p.status,d.kind,d.kind==='DATE'?d.date:null,d.kind==='TIMED'?d.at:null,d.kind==='TIMED'?d.timeZone:null,p.status==='DONE'?current.completed_at??new Date():null,v,id]);
  await audit(tx,actor,'TASK_UPDATED','task',id,v,cid);return {id,version:v};
 });}
 recordResult(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=captureInput.parse(value);return command(this.db,actor,'task.result',key,{id,...p},async(tx,cid)=>{requireValue((await tx.query('SELECT id FROM task WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0]);const result=await createCaptureIn(tx,actor,{...p,kind:'RESULT'});await tx.query('INSERT INTO task_result(workspace_id,task_id,capture_id) VALUES($1,$2,$3)',[actor.workspaceId,id,result.id]);await audit(tx,actor,'TASK_RESULT_RECORDED','capture',result.id,1,cid);return result;});}
 listEvents(actor:Principal){return readScoped(this.db,actor,async tx=>({items:(await tx.query('SELECT id,title,kind,starts_at,ends_at,time_zone,start_date,end_date,status,version FROM calendar_event WHERE deleted_at IS NULL ORDER BY COALESCE(starts_at,start_date::timestamptz),id LIMIT 200')).rows}));}
 createEvent(actor:Principal,value:unknown,key:unknown){const p=eventInput.parse(value);return command(this.db,actor,'event.create',key,p,async(tx,cid)=>{
  const id=randomUUID();await tx.query('INSERT INTO calendar_event(id,workspace_id,title,kind,starts_at,ends_at,time_zone,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,actor.workspaceId,p.title,p.kind,p.kind==='TIMED'?p.startsAt:null,p.kind==='TIMED'?p.endsAt:null,p.kind==='TIMED'?p.timeZone:null,p.kind==='ALL_DAY'?p.startDate:null,p.kind==='ALL_DAY'?p.endDate:null]);
  if(p.taskId)await tx.query('INSERT INTO task_event(workspace_id,task_id,event_id) VALUES($1,$2,$3)',[actor.workspaceId,p.taskId,id]);await audit(tx,actor,'EVENT_CREATED','event',id,1,cid);return {id,version:1};
 });}
 updateEvent(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=z.object({baseVersion:z.number().int().positive(),event:eventInput,status:z.enum(['CONFIRMED','CANCELED'])}).strict().parse(value);return command(this.db,actor,'event.update',key,{id,...p},async(tx,cid)=>{
  const row=requireValue((await tx.query<{version:number}>('SELECT version FROM calendar_event WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0]);checkVersion(row.version,p.baseVersion);const e=p.event,v=row.version+1;
  await tx.query('UPDATE calendar_event SET title=$1,kind=$2,starts_at=$3,ends_at=$4,time_zone=$5,start_date=$6,end_date=$7,status=$8,version=$9 WHERE id=$10',[e.title,e.kind,e.kind==='TIMED'?e.startsAt:null,e.kind==='TIMED'?e.endsAt:null,e.kind==='TIMED'?e.timeZone:null,e.kind==='ALL_DAY'?e.startDate:null,e.kind==='ALL_DAY'?e.endDate:null,p.status,v,id]);await audit(tx,actor,'EVENT_UPDATED','event',id,v,cid);return {id,version:v};
 });}
 search(actor:Principal,value:unknown){const p=pageQuery.parse(value);return readScoped(this.db,actor,async tx=>({items:(await tx.query(`SELECT id,title,kind FROM (
 SELECT c.id,c.title,'CAPTURE' AS kind FROM capture c JOIN capture_revision r ON r.workspace_id=c.workspace_id AND r.capture_id=c.id AND r.revision=c.version WHERE c.deleted_at IS NULL AND (c.title ILIKE $1 OR r.body ILIKE $1)
 UNION ALL SELECT d.id,f.title,d.kind AS kind FROM document d JOIN document_draft f ON f.workspace_id=d.workspace_id AND f.document_id=d.id WHERE d.deleted_at IS NULL AND (f.title ILIKE $1 OR f.body ILIKE $1)
 UNION ALL SELECT id,title,'TASK' AS kind FROM task WHERE deleted_at IS NULL AND (title ILIKE $1 OR description ILIKE $1)
 UNION ALL SELECT id,name,'CONTEXT' AS kind FROM context WHERE deleted_at IS NULL AND (name ILIKE $1 OR purpose ILIKE $1)) x ORDER BY title,id LIMIT $2 OFFSET $3`,[likePattern(p.q),p.limit,p.offset])).rows}));}
 dashboard(actor:Principal){return readScoped(this.db,actor,async tx=>{
  const counts=(await tx.query(`SELECT (SELECT count(*) FROM capture WHERE deleted_at IS NULL)::int AS captures,(SELECT count(*) FROM task WHERE deleted_at IS NULL AND status IN ('TODO','IN_PROGRESS'))::int AS tasks,(SELECT count(*) FROM document WHERE deleted_at IS NULL AND kind='WIKI')::int AS wiki,(SELECT count(*) FROM document WHERE deleted_at IS NULL AND kind='ARTICLE')::int AS documents,(SELECT count(*) FROM proposal WHERE state='PENDING')::int AS proposals`)).rows[0];
  return {counts,recent:(await tx.query('SELECT id,title,kind,updated_at FROM capture WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 5')).rows,upcoming:(await tx.query("SELECT id,title,kind,start_date,starts_at FROM calendar_event WHERE deleted_at IS NULL AND status='CONFIRMED' AND COALESCE(starts_at,start_date::timestamptz)>=now()-interval '1 day' ORDER BY COALESCE(starts_at,start_date::timestamptz) LIMIT 5")).rows};
 });}
}
