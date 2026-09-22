import Fastify,{type FastifyRequest,type FastifyReply} from 'fastify';
import helmet from '@fastify/helmet';import rateLimit from '@fastify/rate-limit';
import {randomUUID} from 'node:crypto';import {z} from 'zod';
import type {Database} from './db';import type {Config} from './config';
import {createAuth,authenticate,acceptInvitation,issueInvitation,reauthenticate,requireFresh,touchSession,type Principal,type Mailer} from './auth';
import {AppError,invariant,requireValue} from './errors';
import {PersonalService} from './personal';import {DocumentService} from './documents';import {PublishingService} from './publishing';import {JudgementService} from './judgement';import {OperationsService} from './operations';
import {uuid} from '../../../packages/contracts/src';
export function requestHeaders(req:FastifyRequest){const h=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)h.set(k,Array.isArray(v)?v.join(', '):v);return h;}
function safeAuthJson(value:unknown):unknown{if(Array.isArray(value))return value.map(safeAuthJson);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='token').map(([k,v])=>[k,safeAuthJson(v)]));return value;}
const authPaths=new Set(['/sign-in/email','/sign-out','/change-password','/request-password-reset','/reset-password','/two-factor/enable','/two-factor/disable','/two-factor/get-totp-uri','/two-factor/verify-totp','/two-factor/verify-backup-code','/two-factor/generate-backup-codes']);
export async function buildApp(db:Database,config:Config,mailer?:Mailer){
 const app=Fastify({logger:config.environment==='test'?false:{level:'info',redact:['req.headers.authorization','req.headers.cookie','res.headers["set-cookie"]','password','token']},disableRequestLogging:true,bodyLimit:2*1048576,trustProxy:false,requestIdHeader:false,genReqId:()=>randomUUID()});
 await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}}});
 await app.register(rateLimit,{max:config.environment==='test'?10000:120,timeWindow:'1 minute'});
 const auth=createAuth(db,config,mailer),personal=new PersonalService(db),documents=new DocumentService(db),publishing=new PublishingService(db),judgement=new JudgementService(db),ops=new OperationsService(db,config.assetDir);
 app.addHook('onRequest',async(req,reply)=>{reply.header('x-request-id',req.id);if(req.url.startsWith('/api/'))reply.header('cache-control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){invariant(req.headers.origin===config.origin,'ORIGIN_REJECTED','허용되지 않은 요청 출처입니다.',403);invariant(req.headers['x-ieum-request']==='1','CSRF_REJECTED','요청 확인 정보가 없습니다.',403);}
 });
 app.addHook('onResponse',async(req,reply)=>{if(config.environment!=='test')req.log.info({route:req.routeOptions.url,method:req.method,status:reply.statusCode,durationMs:reply.elapsedTime,requestId:req.id},'request completed');});
 app.setErrorHandler((error,req,reply)=>{
  let status=500,code='INTERNAL_ERROR',detail='요청을 처리하지 못했습니다. 요청 ID로 확인해 주세요.';let fieldErrors:{path:string;message:string}[]|undefined;
  if(error instanceof AppError){status=error.status;code=error.code;detail=error.message;}else if(error instanceof z.ZodError){status=422;code='VALIDATION_ERROR';detail='입력 내용을 확인해 주세요.';fieldErrors=error.issues.map(i=>({path:i.path.join('.'),message:i.message}));}else{const e=error as {code?:string;statusCode?:number};if(['23503','23505','23514','42501'].includes(e.code??'')){status=e.code==='42501'?403:409;code='DATA_CONSTRAINT';detail='접근 범위, 중복 또는 연결 상태를 확인해 주세요.';}else if([413,429,400].includes(e.statusCode??0)){status=e.statusCode!;code=status===429?'RATE_LIMITED':'REQUEST_REJECTED';detail='요청 크기·형식 또는 요청 빈도를 확인해 주세요.';}else req.log.error({code:e.code,requestId:req.id},'request failed');}
  reply.code(status).type('application/problem+json').send({type:'urn:ieum:error:'+code,title:code,status,detail,code,requestId:req.id,...(fieldErrors?{fieldErrors}:{})});
 });
 const actor=(req:FastifyRequest,allow=false)=>authenticate(auth,db,config,requestHeaders(req),allow);
 const params=(req:FastifyRequest)=>req.params as Record<string,string>;const key=(req:FastifyRequest)=>req.headers['idempotency-key'];
 app.get('/health/live',async()=>({status:'alive'}));
 app.get('/health/ready',async()=>{await db.query('SELECT 1');return {status:'ready'};});
 app.get('/api/v1/capabilities',async()=>({mailEnabled:Boolean(mailer),requireMfa:config.requireMfa,publicSignup:false}));
 app.route({method:['GET','POST'],url:'/api/auth/*',handler:async(req,reply)=>{
  const path=new URL(req.url,config.origin).pathname.slice('/api/auth'.length);invariant(authPaths.has(path),'NOT_FOUND','경로를 찾을 수 없습니다.',404);
  if(path==='/request-password-reset'||path==='/reset-password')invariant(Boolean(mailer),'MAIL_NOT_CONFIGURED','메일 복구는 미설정입니다. 서버 운영 복구 절차를 이용해 주세요.',503);
  if(path==='/two-factor/disable'&&config.requireMfa)throw new AppError(403,'MFA_REQUIRED','현재 운영 정책에서 2단계 인증을 해제할 수 없습니다.');
  if(['/two-factor/enable','/two-factor/disable','/two-factor/get-totp-uri','/two-factor/generate-backup-codes','/change-password'].includes(path))await actor(req,true);
  const headers=requestHeaders(req);const response=await auth.handler(new Request(new URL(req.url,config.origin),{method:req.method,headers,...(req.method==='POST'?{body:JSON.stringify(req.body??{})}:{})}));
  for(const cookie of response.headers.getSetCookie())reply.header('set-cookie',[...(Array.isArray(reply.getHeader('set-cookie'))?reply.getHeader('set-cookie') as string[]:[]),cookie]);
  reply.code(response.status);const body=await response.text();if(response.headers.get('content-type')?.includes('json')){return reply.send(safeAuthJson(JSON.parse(body)));}const location=response.headers.get('location');if(location)reply.header('location',location);return reply.type('text/plain').send(body);
 }});
 app.post('/api/v1/invitations/accept',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async req=>acceptInvitation(db,req.body));
 app.get('/api/v1/me',async req=>{const a=await actor(req,true);const u=requireValue((await db.query('SELECT id,name,email,two_factor_enabled FROM auth_user WHERE id=$1',[a.userId])).rows[0]);const w=requireValue((await db.query('SELECT id,name FROM workspace WHERE id=$1',[a.workspaceId])).rows[0]);return {user:{id:u.id,name:u.name,email:u.email,twoFactorEnabled:u.two_factor_enabled},workspace:w,operator:a.operator,requiresMfa:config.requireMfa&&!a.twoFactorEnabled,mailEnabled:Boolean(mailer),deliveryPublic:config.publicDelivery};});
 app.post('/api/v1/me/reauthenticate',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async req=>{const a=await actor(req,true),p=z.object({password:z.string()}).strict().parse(req.body);return reauthenticate(db,a,p.password);});
 app.post('/api/v1/me/activity',async req=>{await touchSession(db,await actor(req,true));return {recorded:true};});
 app.get('/api/v1/me/preferences',async req=>ops.preferences(await actor(req,true)));
 app.put('/api/v1/me/preferences',async req=>ops.savePreferences(await actor(req,true),req.body));
 app.get('/api/v1/me/sessions',async req=>{const a=await actor(req,true);return {items:(await db.query('SELECT id,created_at,updated_at,expires_at,user_agent FROM auth_session WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC',[a.userId])).rows.map(s=>({...s,current:s.id===a.sessionId}))};});
 app.post('/api/v1/me/sessions/:id/revoke',async req=>{const a=await actor(req,true);await requireFresh(db,a);await db.transaction(async tx=>{const r=await tx.query('DELETE FROM auth_session WHERE id=$1 AND user_id=$2 RETURNING id',[params(req).id,a.userId]);requireValue(r.rows[0]);await tx.query("INSERT INTO instance_audit_event(id,actor_id,action,target_id) VALUES($1,$2,'SESSION_REVOKED',$3)",[randomUUID(),a.userId,params(req).id]);});return {revoked:true};});
 app.get('/api/v1/admin/users',async req=>ops.operatorUsers(await actor(req)));
 app.get('/api/v1/admin/logs',async req=>ops.operatorLogs(await actor(req)));
 app.get('/api/v1/admin/health',async req=>ops.health(await actor(req)));
 app.post('/api/v1/admin/users/:id/status',async req=>ops.setUserStatus(await actor(req),params(req).id!,req.body));
 app.post('/api/v1/admin/invitations',async req=>{const a=await actor(req);await requireFresh(db,a);return issueInvitation(db,a,z.object({email:z.email()}).strict().parse(req.body).email);});
 const base='/api/v1/workspaces/:wid';
 const scoped=async(req:FastifyRequest)=>{const a=await actor(req);invariant(params(req).wid===a.workspaceId,'NOT_FOUND','공간을 찾을 수 없습니다.',404);return a;};
 function get(path:string,handler:(a:Principal,req:FastifyRequest,reply:FastifyReply)=>unknown){app.get(base+path,async(req,reply)=>handler(await scoped(req),req,reply));}
 function post(path:string,handler:(a:Principal,req:FastifyRequest,reply:FastifyReply)=>unknown){app.post(base+path,async(req,reply)=>handler(await scoped(req),req,reply));}
 function put(path:string,handler:(a:Principal,req:FastifyRequest,reply:FastifyReply)=>unknown){app.put(base+path,async(req,reply)=>handler(await scoped(req),req,reply));}
 get('/dashboard',a=>personal.dashboard(a));get('/search',(a,r)=>personal.search(a,r.query));
 get('/captures',(a,r)=>personal.listCaptures(a,r.query));get('/captures/:id',(a,r)=>personal.getCapture(a,params(r).id!));post('/captures',(a,r)=>personal.createCapture(a,r.body,key(r)));put('/captures/:id',(a,r)=>personal.updateCapture(a,params(r).id!,r.body,key(r)));post('/captures/:id/context',(a,r)=>personal.attachContext(a,params(r).id!,r.body,key(r)));
 get('/contexts',a=>personal.listContexts(a));post('/contexts',(a,r)=>personal.createContext(a,r.body,key(r)));get('/sources',a=>personal.listSources(a));post('/sources',(a,r)=>personal.createSource(a,r.body,key(r)));
 get('/tasks',a=>personal.listTasks(a));post('/tasks',(a,r)=>personal.createTask(a,r.body,key(r)));put('/tasks/:id',(a,r)=>personal.updateTask(a,params(r).id!,r.body,key(r)));post('/tasks/:id/result',(a,r)=>personal.recordResult(a,params(r).id!,r.body,key(r)));
 get('/events',a=>personal.listEvents(a));post('/events',(a,r)=>personal.createEvent(a,r.body,key(r)));put('/events/:id',(a,r)=>personal.updateEvent(a,params(r).id!,r.body,key(r)));
 get('/documents',(a,r)=>documents.list(a,r.query));post('/documents',(a,r)=>documents.create(a,r.body,key(r)));get('/documents/:id',(a,r)=>documents.get(a,params(r).id!));put('/documents/:id/draft',(a,r)=>documents.save(a,params(r).id!,r.body,key(r)));post('/documents/:id/revisions',(a,r)=>documents.seal(a,params(r).id!,r.body,key(r)));get('/documents/:id/revisions/:revision',(a,r)=>documents.revision(a,params(r).id!,Number(params(r).revision)));post('/documents/:id/review',(a,r)=>documents.review(a,params(r).id!,r.body,key(r)));post('/documents/:id/restore',(a,r)=>documents.restoreRevision(a,params(r).id!,r.body,key(r)));
 get('/publications',a=>publishing.list(a));post('/publications',(a,r)=>publishing.publish(a,r.body,key(r)));post('/publications/:id/withdraw',(a,r)=>publishing.withdraw(a,params(r).id!,key(r)));get('/delivery-clients',a=>publishing.clients(a));post('/delivery-keys',(a,r)=>publishing.issueKey(a,r.body));post('/delivery-keys/:id/revoke',(a,r)=>publishing.revokeKey(a,params(r).id!,key(r)));
 get('/proposals',a=>judgement.list(a));post('/captures/:id/judge',async(a,r)=>{const pref=await ops.preferences(a);invariant(pref.core_enabled,'CORE_DISABLED','설정에서 정리 보조를 활성화해 주세요.',409);return judgement.evaluate(a,params(r).id!,key(r));});post('/proposals/:id/action',(a,r)=>judgement.apply(a,params(r).id!,r.body,key(r)));
 get('/assets',a=>ops.assets(a));post('/assets',(a,r)=>ops.uploadText(a,r.body));get('/assets/:id/download',async(a,r,reply)=>{const f=await ops.downloadAsset(a,params(r).id!);return reply.type('application/octet-stream').header('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`).send(f.data);});
 get('/trash',a=>ops.trash(a));post('/resources/:kind/:id/trash',(a,r)=>ops.deleteOrRestore(a,params(r).kind!,params(r).id!,false,key(r)));post('/resources/:kind/:id/restore',(a,r)=>ops.deleteOrRestore(a,params(r).kind!,params(r).id!,true,key(r)));
 post('/imports/preview',(a,r)=>ops.previewImport(a,r.body));post('/imports/:id/apply',(a,r)=>ops.applyImport(a,params(r).id!,r.body,key(r)));post('/exports',(a,r)=>ops.enqueueExport(a,key(r)));get('/jobs',a=>ops.jobs(a));post('/jobs/:id/action',(a,r)=>ops.jobAction(a,params(r).id!,r.body,key(r)));get('/exports/:id/download',async(a,r,reply)=>reply.type('application/json').header('content-disposition','attachment; filename="ieum-records-and-documents.json"').send(await ops.downloadExport(a,params(r).id!)));
 get('/audit',a=>ops.auditLog(a));get('/notifications',a=>ops.notifications(a));post('/notifications/:id/read',(a,r)=>ops.markRead(a,params(r).id!,key(r)));
 async function delivery(req:FastifyRequest){const q=req.query as {channelId?:string};return publishing.deliveryScope(req.headers.authorization,config.publicDelivery,q.channelId);}
 app.get('/delivery/v1/publications',async(req,reply)=>{reply.header('cache-control','no-store');return publishing.deliveryList(await delivery(req),req.query);});
 app.get('/delivery/v1/publications/:id',async(req,reply)=>{reply.header('cache-control','no-store');return publishing.deliveryGet(await delivery(req),params(req).id!);});
 return {app,auth,ops,services:{personal,documents,publishing,judgement}};
}
