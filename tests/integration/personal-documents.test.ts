import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fixture} from '../helpers/fixture';
import {PersonalService} from '../../apps/api/src/personal';
import {DocumentService} from '../../apps/api/src/documents';
import {PublishingService} from '../../apps/api/src/publishing';
let f:Awaited<ReturnType<typeof fixture>>,p:PersonalService,d:DocumentService,pub:PublishingService;
beforeAll(async()=>{f=await fixture();p=new PersonalService(f.db);d=new DocumentService(f.db);pub=new PublishingService(f.db);});afterAll(async()=>{await f.close();});
it('stores immutable capture revisions, deduplicates commands and enforces tenant scope',async()=>{
 const key=randomUUID(),input={title:'테스트 기록',body:'원문 경험',tags:['코드']};const c=await p.createCapture(f.actor,input,key);expect(await p.createCapture(f.actor,input,key)).toEqual(c);
 await expect(p.createCapture(f.actor,{...input,title:'다름'},key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 await expect(p.getCapture(f.other,c.id)).rejects.toMatchObject({status:404});expect((await p.listCaptures(f.other,{})).items).toHaveLength(0);
 await p.updateCapture(f.actor,c.id,{...input,body:'새 경험',baseVersion:1},randomUUID());await expect(p.updateCapture(f.actor,c.id,{...input,baseVersion:1},randomUUID())).rejects.toMatchObject({code:'VERSION_CONFLICT'});
 const rows=await f.db.scoped(f.actor.workspaceId,f.actor.userId,tx=>tx.query('SELECT body FROM capture_revision WHERE capture_id=$1 ORDER BY revision',[c.id]));expect(rows.rows.map(x=>x.body)).toEqual(['원문 경험','새 경험']);
});
it('completes a task, stores its result as a record and rejects invalid event date combinations',async()=>{
 const t=await p.createTask(f.actor,{title:'검증',due:{kind:'DATE',date:'2026-09-30'}},randomUUID());await p.updateTask(f.actor,t.id,{title:'검증',status:'DONE',baseVersion:1},randomUUID());const c=await p.recordResult(f.actor,t.id,{title:'결과',body:'테스트 통과'},randomUUID());expect((await p.getCapture(f.actor,c.id)).kind).toBe('RESULT');
 expect(()=>p.createEvent(f.actor,{title:'역전',kind:'ALL_DAY',startDate:'2026-09-30',endDate:'2026-09-29'},randomUUID())).toThrow();
 const e=await p.createEvent(f.actor,{title:'종일',kind:'ALL_DAY',startDate:'2026-09-30',endDate:'2026-10-01',taskId:t.id},randomUUID());expect((await p.listEvents(f.actor)).items[0]?.id).toBe(e.id);
});
it('seals reviewed publications, keeps drafts private, rejects revoked review and supports withdrawal/key rotation',async()=>{
 const c=await p.createCapture(f.actor,{title:'근거',body:'개인 원문 비밀'},randomUUID());const doc=await d.create(f.actor,{title:'통찰',kind:'ARTICLE'},randomUUID());const meta={slug:'first-insight',summary:'공개 요약',author:'작성자',tags:['경험'],publicSources:[]};
 const draft={title:'통찰',body:'공개하기로 한 해석',baseVersion:1,sources:[{type:'UNIT',id:c.unitId,revision:1,claim:'내 경험',relation:'AUTHOR_INTERPRETATION'}],publicMeta:meta};await d.save(f.actor,doc.id,draft,randomUUID());await expect(d.save(f.actor,doc.id,draft,randomUUID())).rejects.toMatchObject({code:'VERSION_CONFLICT'});
 const seal=await d.seal(f.actor,doc.id,{baseVersion:2},randomUUID());await d.review(f.actor,doc.id,{revision:seal.revision,manifestHash:seal.manifestHash,decision:'READY'},randomUUID());const published=await pub.publish(f.actor,{documentId:doc.id,revision:seal.revision,manifestHash:seal.manifestHash},randomUUID());
 await d.save(f.actor,doc.id,{...draft,baseVersion:2,body:'미공개 수정 비밀'},randomUUID());const publicDoc=await pub.deliveryGet(published.channelId,published.id);expect(publicDoc.body).toBe('공개하기로 한 해석');expect(JSON.stringify(publicDoc)).not.toContain('개인 원문');expect(publicDoc).not.toHaveProperty('document_id');
 await d.review(f.actor,doc.id,{revision:seal.revision,manifestHash:seal.manifestHash,decision:'CHANGES_REQUIRED'},randomUUID());await expect(pub.publish(f.actor,{documentId:doc.id,revision:seal.revision,manifestHash:seal.manifestHash},randomUUID())).rejects.toMatchObject({code:'REVIEW_REQUIRED'});
 const k=await pub.issueKey(f.actor,{name:'블로그'});expect(await pub.deliveryScope('Bearer '+k.token,false,undefined)).toBe(published.channelId);const k2=await pub.issueKey(f.actor,{name:'블로그',clientId:k.clientId});await pub.revokeKey(f.actor,k.id,randomUUID());await expect(pub.deliveryScope('Bearer '+k.token,false,undefined)).rejects.toMatchObject({status:401});expect(await pub.deliveryScope('Bearer '+k2.token,false,undefined)).toBe(published.channelId);
 await pub.withdraw(f.actor,published.id,randomUUID());await expect(pub.deliveryGet(published.channelId,published.id)).rejects.toMatchObject({status:404});
});
it('rejects inaccessible and self evidence before draft persistence',async()=>{
 const c=await p.createCapture(f.actor,{title:'private',body:'private'},randomUUID());const doc=await d.create(f.other,{title:'other',kind:'WIKI'},randomUUID());await expect(d.save(f.other,doc.id,{title:'other',body:'x',baseVersion:1,sources:[{type:'UNIT',id:c.unitId,revision:1}]},randomUUID())).rejects.toMatchObject({code:'INVALID_EVIDENCE'});
});
