import {beforeAll,afterAll,it,expect} from 'vitest';import {randomUUID} from 'node:crypto';
import {fixture,testConfig,credentials} from '../helpers/fixture';import {buildApp} from '../../apps/api/src/app';
let f:Awaited<ReturnType<typeof fixture>>,api:Awaited<ReturnType<typeof buildApp>>;
beforeAll(async()=>{f=await fixture();api=await buildApp(f.db,testConfig);await api.app.ready();});afterAll(async()=>{await api.app.close();await f.close();});
const headers=()=>({cookie:f.cookie,origin:testConfig.origin,'x-ieum-request':'1','idempotency-key':randomUUID()});
it('serves real session identity but never exposes the session token',async()=>{const r=await api.app.inject({method:'GET',url:'/api/v1/me',headers:headers()});expect(r.statusCode,r.body).toBe(200);expect(r.json().workspace.id).toBe(f.actor.workspaceId);expect(r.body).not.toContain('session_token');expect(r.json()).not.toHaveProperty('token');});
it('rejects cross-origin mutations, anonymous operations, vendor signup and foreign workspace',async()=>{
 const b='/api/v1/workspaces/'+f.actor.workspaceId+'/captures';const payload={title:'기록',body:'본문'};
 expect((await api.app.inject({method:'POST',url:b,payload,headers:{...headers(),origin:'https://evil.example'}})).statusCode).toBe(403);
 expect((await api.app.inject({method:'POST',url:b,payload,headers:{origin:testConfig.origin,'x-ieum-request':'1'}})).statusCode).toBe(401);
 expect((await api.app.inject({method:'POST',url:'/api/auth/sign-up/email',payload:credentials,headers:headers()})).statusCode).toBe(404);
 expect((await api.app.inject({method:'GET',url:b,headers:{cookie:f.otherCookie}})).statusCode).toBe(404);
});
it('supports authenticated business routes and masked audit without private body',async()=>{const b='/api/v1/workspaces/'+f.actor.workspaceId;const r=await api.app.inject({method:'POST',url:b+'/captures',headers:headers(),payload:{title:'API 기록',body:'로그에 숨길 본문'}});expect(r.statusCode,r.body).toBe(200);const list=await api.app.inject({url:b+'/captures',headers:headers()});expect(list.json().items).toHaveLength(1);const audit=await api.app.inject({url:b+'/audit',headers:headers()});expect(audit.statusCode,audit.body).toBe(200);expect(audit.body).not.toContain('로그에 숨길');});
it('runs a durable export and rejects public delivery without a credential',async()=>{const b='/api/v1/workspaces/'+f.actor.workspaceId;const r=await api.app.inject({method:'POST',url:b+'/exports',headers:headers(),payload:{}});expect(r.statusCode,r.body).toBe(200);await api.ops.runOne();const jobs=await api.app.inject({url:b+'/jobs',headers:headers()});expect(jobs.json().items[0].state, jobs.body).toBe('SUCCEEDED');const download=await api.app.inject({url:b+'/exports/'+r.json().id+'/download',headers:headers()});expect(download.statusCode,download.body).toBe(200);expect(download.json().format).toBe('ieum-portable/v1');expect((await api.app.inject({url:'/delivery/v1/publications'})).statusCode).toBe(401);});
