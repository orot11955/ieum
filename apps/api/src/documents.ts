import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Database,Executor} from './db';
import type {Principal} from './auth';
import {requireFresh} from './auth';
import {audit,command,readScoped,checkVersion,fingerprint,likePattern} from './commands';
import {requireValue,invariant} from './errors';
import {documentInput,draftInput,pageQuery,uuid,publicMeta,type Evidence} from '../../../packages/contracts/src';

export async function validateEvidence(tx:Executor,entries:Evidence[],documentId?:string){
 for(const e of entries){
  invariant(e.type!=='DOCUMENT'||e.id!==documentId,'SELF_EVIDENCE','자기 문서는 근거로 추가할 수 없습니다.');
  const sql=e.type==='UNIT'?'SELECT r.revision FROM unit_revision r JOIN thought_unit u ON u.workspace_id=r.workspace_id AND u.id=r.unit_id JOIN capture c ON c.workspace_id=u.workspace_id AND c.id=u.capture_id WHERE r.unit_id=$1 AND r.revision=$2 AND c.deleted_at IS NULL':e.type==='SOURCE'?'SELECT r.revision FROM source_revision r JOIN source s ON s.workspace_id=r.workspace_id AND s.id=r.source_id WHERE r.source_id=$1 AND r.revision=$2 AND s.deleted_at IS NULL':'SELECT r.revision FROM document_revision r JOIN document d ON d.workspace_id=r.workspace_id AND d.id=r.document_id WHERE r.document_id=$1 AND r.revision=$2 AND d.deleted_at IS NULL';
  invariant((await tx.query(sql,[e.id,e.revision])).rows.length===1,'INVALID_EVIDENCE','접근 가능한 원본 버전을 확인해 주세요.',422);
 }
}
export class DocumentService{
 constructor(private db:Database){}
 list(actor:Principal,value:unknown){const p=pageQuery.extend({kind:z.enum(['WIKI','ARTICLE','NOTE']).optional()}).parse(value);return readScoped(this.db,actor,async tx=>({items:(await tx.query('SELECT d.id,d.kind,f.title,f.version,d.current_revision,d.updated_at FROM document d JOIN document_draft f ON f.workspace_id=d.workspace_id AND f.document_id=d.id WHERE d.deleted_at IS NULL AND ($1::text IS NULL OR d.kind=$1) AND (f.title ILIKE $2 OR f.body ILIKE $2) ORDER BY d.updated_at DESC,d.id LIMIT $3 OFFSET $4',[p.kind??null,likePattern(p.q),p.limit,p.offset])).rows}));}
 create(actor:Principal,value:unknown,key:unknown){const p=documentInput.parse(value);return command(this.db,actor,'document.create',key,p,async(tx,cid)=>{const id=randomUUID();await tx.query('INSERT INTO document(id,workspace_id,title,kind,created_by) VALUES($1,$2,$3,$4,$5)',[id,actor.workspaceId,p.title,p.kind,actor.userId]);await tx.query("INSERT INTO document_draft(workspace_id,document_id,title,body,public_meta) VALUES($1,$2,$3,$4,'null'::jsonb)",[actor.workspaceId,id,p.title,p.body]);await audit(tx,actor,'DOCUMENT_CREATED','document',id,1,cid);return {id,version:1};});}
 get(actor:Principal,id:string){uuid.parse(id);return readScoped(this.db,actor,async tx=>{
  const item=requireValue((await tx.query('SELECT d.id,d.kind,d.current_revision,f.title,f.body,f.version,f.sources,f.public_meta FROM document d JOIN document_draft f ON f.workspace_id=d.workspace_id AND f.document_id=d.id WHERE d.id=$1 AND d.deleted_at IS NULL',[id])).rows[0]);
  const revisions=(await tx.query('SELECT r.revision,r.title,r.created_at,r.manifest_hash,(SELECT decision FROM document_review v WHERE v.workspace_id=r.workspace_id AND v.document_id=r.document_id AND v.document_revision=r.revision ORDER BY review_no DESC LIMIT 1) AS review_state FROM document_revision r WHERE r.document_id=$1 ORDER BY revision DESC',[id])).rows;
  return {...item,revisions};
 });}
 save(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=draftInput.parse(value);return command(this.db,actor,'document.save',key,{id,...p},async(tx,cid)=>{
  requireValue((await tx.query('SELECT id FROM document WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0]);
  const current=requireValue((await tx.query<{version:number}>('SELECT version FROM document_draft WHERE document_id=$1 FOR UPDATE',[id])).rows[0]);checkVersion(current.version,p.baseVersion);
  await validateEvidence(tx,p.sources,id);const version=current.version+1;
  await tx.query('UPDATE document_draft SET title=$1,body=$2,sources=$3::jsonb,public_meta=$4::jsonb,version=$5,updated_at=now() WHERE document_id=$6',[p.title,p.body,JSON.stringify(p.sources),JSON.stringify(p.publicMeta),version,id]);
  await tx.query('UPDATE document SET title=$1,updated_at=now() WHERE id=$2',[p.title,id]);
  await tx.query('DELETE FROM document_link WHERE from_document_id=$1',[id]);
  for(const target of [...new Set(p.sources.filter(e=>e.type==='DOCUMENT').map(e=>e.id))])await tx.query('INSERT INTO document_link(workspace_id,from_document_id,to_document_id) VALUES($1,$2,$3)',[actor.workspaceId,id,target]);
  await audit(tx,actor,'DRAFT_SAVED','document',id,version,cid);return {id,version};
 });}
 seal(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=z.object({baseVersion:z.number().int().positive()}).strict().parse(value);return command(this.db,actor,'document.seal',key,{id,...p},async(tx,cid)=>{
  const doc=requireValue((await tx.query<{current_revision:number|null}>('SELECT current_revision FROM document WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0]);
  const draft=requireValue((await tx.query<{version:number;title:string;body:string;sources:Evidence[];public_meta:unknown}>('SELECT version,title,body,sources,public_meta FROM document_draft WHERE document_id=$1 FOR UPDATE',[id])).rows[0]);checkVersion(draft.version,p.baseVersion);await validateEvidence(tx,draft.sources,id);
  const revision=(doc.current_revision??0)+1,manifest=fingerprint({title:draft.title,body:draft.body,sources:draft.sources,publicMeta:draft.public_meta});
  await tx.query('INSERT INTO document_revision(workspace_id,document_id,revision,title,body,sources,public_meta,manifest_hash,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)',[actor.workspaceId,id,revision,draft.title,draft.body,JSON.stringify(draft.sources),JSON.stringify(draft.public_meta),manifest,actor.userId]);
  for(const e of draft.sources)await tx.query('INSERT INTO document_evidence(id,workspace_id,document_id,document_revision,unit_id,unit_revision,source_id,source_revision,source_document_id,source_document_revision,claim,relation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[randomUUID(),actor.workspaceId,id,revision,e.type==='UNIT'?e.id:null,e.type==='UNIT'?e.revision:null,e.type==='SOURCE'?e.id:null,e.type==='SOURCE'?e.revision:null,e.type==='DOCUMENT'?e.id:null,e.type==='DOCUMENT'?e.revision:null,e.claim,e.relation]);
  await tx.query('UPDATE document SET current_revision=$1,updated_at=now() WHERE id=$2',[revision,id]);await audit(tx,actor,'DOCUMENT_SEALED','document',id,revision,cid);return {id,revision,manifestHash:manifest};
 });}
 revision(actor:Principal,id:string,rev:number){uuid.parse(id);z.number().int().positive().parse(rev);return readScoped(this.db,actor,async tx=>requireValue((await tx.query('SELECT r.title,r.body,r.revision,r.sources,r.public_meta,r.manifest_hash,r.created_at FROM document_revision r JOIN document d ON d.workspace_id=r.workspace_id AND d.id=r.document_id WHERE r.document_id=$1 AND r.revision=$2 AND d.deleted_at IS NULL',[id,rev])).rows[0]));}
 review(actor:Principal,id:string,value:unknown,key:unknown){uuid.parse(id);const p=z.object({revision:z.number().int().positive(),manifestHash:z.string().length(64),decision:z.enum(['READY','CHANGES_REQUIRED'])}).strict().parse(value);return command(this.db,actor,'document.review',key,{id,...p},async(tx,cid)=>{
  requireValue((await tx.query('SELECT id FROM document WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0]);
  const r=requireValue((await tx.query<{manifest_hash:string;public_meta:unknown;sources:Evidence[]}>('SELECT manifest_hash,public_meta,sources FROM document_revision WHERE document_id=$1 AND revision=$2',[id,p.revision])).rows[0]);invariant(r.manifest_hash===p.manifestHash,'MANIFEST_CONFLICT','검토하는 버전이 변경되었습니다.',409);
  if(p.decision==='READY'){publicMeta.parse(r.public_meta);await validateEvidence(tx,r.sources,id);}
  const n=(await tx.query<{n:number}>('SELECT COALESCE(max(review_no),0)::int+1 AS n FROM document_review WHERE document_id=$1 AND document_revision=$2',[id,p.revision])).rows[0]!.n,reviewId=randomUUID();
  await tx.query('INSERT INTO document_review(id,workspace_id,document_id,document_revision,manifest_hash,review_no,decision,reviewer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[reviewId,actor.workspaceId,id,p.revision,p.manifestHash,n,p.decision,actor.userId]);await audit(tx,actor,'DOCUMENT_REVIEWED','document',id,p.revision,cid);return {reviewId,decision:p.decision};
 });}
 async restoreRevision(actor:Principal,id:string,value:unknown,key:unknown){const p=z.object({revision:z.number().int().positive(),baseVersion:z.number().int().positive()}).strict().parse(value);const r=await this.revision(actor,id,p.revision);return this.save(actor,id,{baseVersion:p.baseVersion,title:r.title,body:r.body,sources:r.sources,publicMeta:r.public_meta},key);}
}
