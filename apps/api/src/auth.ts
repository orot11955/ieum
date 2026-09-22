import {betterAuth,APIError} from 'better-auth';
import {drizzleAdapter} from '@better-auth/drizzle-adapter';
import {twoFactor} from 'better-auth/plugins';
import {hashPassword,verifyPassword} from 'better-auth/crypto';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Config} from './config';
import type {Database,Executor} from './db';
import {authSchema} from './auth-schema';
import {AppError,invariant,requireValue} from './errors';
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const credentialInput=z.object({email:z.email().max(254).transform(s=>s.trim().toLowerCase()),name:z.string().trim().min(1).max(100),password:z.string().min(15).max(128)}).strict();
export type Mailer=(message:{to:string;url:string;kind:'password-reset'})=>Promise<void>;
export function createAuth(db:Database,config:Config,mailer?:Mailer){
 return betterAuth({
  appName:'IEUM',baseURL:config.origin,basePath:'/api/auth',secret:config.secret,trustedOrigins:[config.origin],
  database:drizzleAdapter(db.orm,{provider:'pg',schema:authSchema}),
  emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:15,maxPasswordLength:128,autoSignIn:false,revokeSessionsOnPasswordReset:true,
   ...(mailer?{sendResetPassword:async({user,url}:{user:{email:string};url:string})=>{await mailer({to:user.email,url,kind:'password-reset'});}}:{}),
  },
  user:{additionalFields:{status:{type:'string',defaultValue:'ACTIVE',input:false}}},
  session:{expiresIn:7*86400,updateAge:86400,freshAge:600,cookieCache:{enabled:false}},
  advanced:{useSecureCookies:config.origin.startsWith('https:'),defaultCookieAttributes:{httpOnly:true,sameSite:'lax',path:'/'}},
  rateLimit:{enabled:true,window:60,max:60,customRules:{'/sign-in/email':{window:60,max:10},'/request-password-reset':{window:60,max:3}}},
  plugins:[twoFactor({issuer:'IEUM',skipVerificationOnEnable:false})],
  databaseHooks:{session:{create:{before:async data=>{
   const row=(await db.query<{status:string}>('SELECT status FROM auth_user WHERE id=$1',[data.userId])).rows[0];
   if(!row||row.status!=='ACTIVE')throw new APIError('UNAUTHORIZED',{message:'로그인할 수 없습니다.'});
   return {data};
  }}}},
  logger:{disabled:config.environment==='test',level:'error'},
 });
}
export type Auth=ReturnType<typeof createAuth>;
export interface Principal{userId:string;sessionId:string;workspaceId:string;operator:boolean;twoFactorEnabled:boolean}
export async function provisionUser(tx:Executor,input:z.infer<typeof credentialInput>,passwordHash:string,operator=false){
 const userId=randomUUID(),workspaceId=randomUUID();
 await tx.query('INSERT INTO auth_user(id,name,email) VALUES($1,$2,$3)',[userId,input.name,input.email]);
 await tx.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",[randomUUID(),userId,passwordHash]);
 await tx.query('INSERT INTO workspace(id,name) VALUES($1,$2)',[workspaceId,`${input.name}의 공간`]);
 await tx.query('INSERT INTO workspace_member(workspace_id,user_id) VALUES($1,$2)',[workspaceId,userId]);
 await tx.query('INSERT INTO user_preference(user_id) VALUES($1)',[userId]);
 if(operator)await tx.query('INSERT INTO instance_operator(user_id) VALUES($1)',[userId]);
 await tx.query('INSERT INTO instance_audit_event(id,actor_id,action,target_id) VALUES($1,$2,$3,$2)',[randomUUID(),userId,operator?'INSTANCE_BOOTSTRAPPED':'INVITATION_ACCEPTED']);
 return {userId,workspaceId};
}
export async function bootstrap(db:Database,value:unknown){
 const input=credentialInput.parse(value),passwordHash=await hashPassword(input.password);
 return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(4782902)');
  invariant((await tx.query('SELECT user_id FROM instance_operator LIMIT 1')).rows.length===0,'ALREADY_BOOTSTRAPPED','초기 운영자가 이미 있습니다.',409);
  return provisionUser(tx,input,passwordHash,true);
 });
}
export async function acceptInvitation(db:Database,value:unknown){
 const p=z.object({token:z.string().min(32).max(128),email:z.email(),name:z.string(),password:z.string()}).strict().parse(value);
 const input=credentialInput.parse({email:p.email,name:p.name,password:p.password}),passwordHash=await hashPassword(input.password);
 return db.transaction(async tx=>{
  const invite=(await tx.query<{id:string;email:string;expires_at:Date;accepted_at:Date|null;revoked_at:Date|null}>('SELECT * FROM invitation WHERE token_digest=$1 FOR UPDATE',[digest(p.token)])).rows[0];
  invariant(invite&&!invite.accepted_at&&!invite.revoked_at&&new Date(invite.expires_at).getTime()>Date.now()&&invite.email===input.email,'INVALID_INVITATION','초대가 유효하지 않습니다.',400);
  invariant(!(await tx.query('SELECT id FROM auth_user WHERE email=$1',[input.email])).rows.length,'INVALID_INVITATION','초대를 적용할 수 없습니다.',400);
  const result=await provisionUser(tx,input,passwordHash);
  await tx.query('UPDATE invitation SET accepted_at=now() WHERE id=$1',[invite.id]);return result;
 });
}
export async function issueInvitation(db:Database,actor:Principal,email:string){
 invariant(actor.operator,'FORBIDDEN','운영자 권한이 필요합니다.',403);const normalized=z.email().parse(email).toLowerCase();const token=randomBytes(32).toString('base64url');
 const id=randomUUID();await db.transaction(async tx=>{
  await tx.query("INSERT INTO invitation(id,email,token_digest,issued_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '72 hours')",[id,normalized,digest(token),actor.userId]);
  await tx.query("INSERT INTO instance_audit_event(id,actor_id,action,target_id) VALUES($1,$2,'INVITATION_CREATED',$3)",[randomUUID(),actor.userId,id]);
 });return {id,token,email:normalized};
}
export async function authenticate(auth:Auth,db:Database,config:Config,headers:Headers,allowMfaSetup=false):Promise<Principal>{
 const result=await auth.api.getSession({headers,query:{disableCookieCache:true}});
 if(!result)throw new AppError(401,'UNAUTHENTICATED','로그인이 필요합니다.');
 const row=(await db.query<{status:string;two_factor_enabled:boolean}>('SELECT status,two_factor_enabled FROM auth_user WHERE id=$1',[result.user.id])).rows[0];
 if(!row||row.status!=='ACTIVE')throw new AppError(401,'SESSION_REVOKED','계정 또는 세션이 중지되었습니다.');
 const state=(await db.query<{last_active_at:Date}>('SELECT last_active_at FROM app_session_state WHERE session_id=$1',[result.session.id])).rows[0];
 const now=Date.now();if(now-new Date(result.session.createdAt).getTime()>7*86400000||now-new Date(state?.last_active_at??result.session.createdAt).getTime()>12*3600000){await db.query('DELETE FROM auth_session WHERE id=$1',[result.session.id]);throw new AppError(401,'SESSION_EXPIRED','세션이 만료되었습니다.');}
 if(config.requireMfa&&!row.two_factor_enabled&&!allowMfaSetup)throw new AppError(403,'MFA_REQUIRED','보안 설정에서 2단계 인증을 등록해 주세요.');
 const membership=requireValue((await db.query<{workspace_id:string}>('SELECT workspace_id FROM workspace_member WHERE user_id=$1',[result.user.id])).rows[0]);
 return {userId:result.user.id,sessionId:result.session.id,workspaceId:membership.workspace_id,operator:Boolean((await db.query('SELECT user_id FROM instance_operator WHERE user_id=$1',[result.user.id])).rows.length),twoFactorEnabled:row.two_factor_enabled};
}
export async function reauthenticate(db:Database,actor:Principal,password:string){
 const value=z.string().min(1).max(128).parse(password);
 const row=(await db.query<{password:string}>("SELECT password FROM auth_account WHERE user_id=$1 AND provider_id='credential'",[actor.userId])).rows[0];
 if(!row||!await verifyPassword({password:value,hash:row.password}))throw new AppError(401,'INVALID_CREDENTIAL','비밀번호를 확인해 주세요.');
 await db.query("INSERT INTO app_session_state(session_id,last_active_at,reauth_until) VALUES($1,now(),now()+interval '10 minutes') ON CONFLICT(session_id) DO UPDATE SET last_active_at=now(),reauth_until=excluded.reauth_until",[actor.sessionId]);
 return {reauthenticated:true};
}
export async function requireFresh(db:Executor,actor:Principal){
 const row=(await db.query<{valid:boolean}>('SELECT reauth_until>now() AS valid FROM app_session_state WHERE session_id=$1',[actor.sessionId])).rows[0];
 invariant(row?.valid,'REAUTH_REQUIRED','이 작업은 비밀번호 재확인 후 진행할 수 있습니다.',403);
}
export async function touchSession(db:Database,actor:Principal){await db.query('INSERT INTO app_session_state(session_id,last_active_at) VALUES($1,now()) ON CONFLICT(session_id) DO UPDATE SET last_active_at=now()',[actor.sessionId]);}
