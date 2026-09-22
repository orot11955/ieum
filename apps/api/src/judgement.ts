import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {route,type ContextSnapshot} from '../../../packages/core/src';
import type {Database} from './db';import type {Principal} from './auth';
import {audit,command,readScoped} from './commands';import {invariant,requireValue} from './errors';import {uuid} from '../../../packages/contracts/src';
export class JudgementService{
 constructor(private db:Database){}
 evaluate(actor:Principal,id:string,key:unknown){uuid.parse(id);return command(this.db,actor,'judgement.evaluate',key,{id},async(tx,cid)=>{
  const c=requireValue((await tx.query<{version:number;body:string;title:string}>('SELECT c.version,r.body,c.title FROM capture c JOIN capture_revision r ON r.workspace_id=c.workspace_id AND r.capture_id=c.id AND r.revision=c.version WHERE c.id=$1 AND c.deleted_at IS NULL',[id])).rows[0]);
  const cs=(await tx.query<{id:string;name:string;purpose:string;version:number}>('SELECT id,name,purpose,version FROM context WHERE deleted_at IS NULL ORDER BY id LIMIT 1000')).rows;
  const members=(await tx.query<{context_id:string;id:string;origin_id:string;revision:number;text:string}>('SELECT m.context_id,u.id,c.id AS origin_id,c.version AS revision,r.body AS text FROM context_membership m JOIN thought_unit u ON u.workspace_id=m.workspace_id AND u.id=m.unit_id JOIN capture c ON c.workspace_id=u.workspace_id AND c.id=u.capture_id JOIN capture_revision r ON r.workspace_id=c.workspace_id AND r.capture_id=c.id AND r.revision=c.version WHERE m.ended_at IS NULL AND c.deleted_at IS NULL AND c.id<>$1 ORDER BY c.id LIMIT 10000',[id])).rows;
  const contexts:ContextSnapshot[]=cs.map(x=>({...x,members:members.filter(m=>m.context_id===x.id).map(m=>({id:m.id,originId:m.origin_id,revision:m.revision,text:m.text}))}));
  const snapshot={originId:id,text:c.title+' '+c.body,contexts};const result=route(snapshot),runId=randomUUID();
  await tx.query('INSERT INTO judgement_run(id,workspace_id,capture_id,capture_revision,config_version,snapshot,result) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[runId,actor.workspaceId,id,c.version,result.engineVersion,JSON.stringify(snapshot),JSON.stringify(result)]);
  await tx.query("UPDATE proposal SET state='STALE' WHERE capture_id=$1 AND state='PENDING'",[id]);
  for(const candidate of result.candidates.slice(0,5))await tx.query('INSERT INTO proposal(id,workspace_id,run_id,capture_id,capture_revision,context_id,context_version,score) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),actor.workspaceId,runId,id,c.version,candidate.contextId,candidate.contextVersion,candidate.rankScore]);
  await audit(tx,actor,'JUDGEMENT_CREATED','judgement',runId,null,cid);return {runId,...result};
 });}
 list(actor:Principal){return readScoped(this.db,actor,async tx=>({items:(await tx.query("SELECT p.id,p.state,p.score,p.capture_id,p.capture_revision,c.title,x.name AS context_name,x.id AS context_id,p.created_at,r.result FROM proposal p JOIN capture c ON c.workspace_id=p.workspace_id AND c.id=p.capture_id JOIN context x ON x.workspace_id=p.workspace_id AND x.id=p.context_id JOIN judgement_run r ON r.workspace_id=p.workspace_id AND r.id=p.run_id WHERE c.deleted_at IS NULL AND x.deleted_at IS NULL ORDER BY p.created_at DESC,p.id LIMIT 100")).rows}));}
 apply(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=z.object({action:z.enum(['ACCEPT','REJECT','DISMISS'])}).strict().parse(value);return command(this.db,actor,'proposal.apply',key,{id,...p},async(tx,cid)=>{
  const proposal=requireValue((await tx.query<{state:string;capture_id:string;capture_revision:number;context_id:string;context_version:number}>('SELECT state,capture_id,capture_revision,context_id,context_version FROM proposal WHERE id=$1 FOR UPDATE',[id])).rows[0]);
  invariant(proposal.state==='PENDING','STALE_PROPOSAL','이미 처리되었거나 오래된 제안입니다.',409);
  const capture=(await tx.query<{version:number}>('SELECT version FROM capture WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[proposal.capture_id])).rows[0];const context=(await tx.query<{version:number}>('SELECT version FROM context WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[proposal.context_id])).rows[0];
  if(!capture||!context||capture.version!==proposal.capture_revision||context.version!==proposal.context_version){await tx.query("UPDATE proposal SET state='STALE' WHERE id=$1",[id]);return {state:'STALE'};}
  if(p.action==='ACCEPT'){const unit=requireValue((await tx.query<{id:string}>('SELECT id FROM thought_unit WHERE capture_id=$1 ORDER BY id LIMIT 1 FOR UPDATE',[proposal.capture_id])).rows[0]);await tx.query("INSERT INTO context_membership(id,workspace_id,unit_id,context_id,role) VALUES($1,$2,$3,$4,'SECONDARY') ON CONFLICT(workspace_id,unit_id,context_id) WHERE ended_at IS NULL DO NOTHING",[randomUUID(),actor.workspaceId,unit.id,proposal.context_id]);}
  const state=p.action==='ACCEPT'?'ACCEPTED':p.action==='REJECT'?'REJECTED':'DISMISSED';await tx.query('UPDATE proposal SET state=$1 WHERE id=$2',[state,id]);await tx.query('INSERT INTO feedback(id,workspace_id,proposal_id,actor_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor.workspaceId,id,actor.userId,p.action]);await audit(tx,actor,'PROPOSAL_'+state,'proposal',id,null,cid);return {state};
 });}
}
