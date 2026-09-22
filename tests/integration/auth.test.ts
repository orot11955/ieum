import {beforeAll,afterAll,it,expect} from 'vitest';
import {connectDatabase,migrate,type Database} from '../../apps/api/src/db';
import {createAuth,bootstrap,authenticate,reauthenticate,requireFresh,type Auth} from '../../apps/api/src/auth';
import type {Config} from '../../apps/api/src/config';
const config:Config={environment:'test',origin:'http://127.0.0.1:5173',host:'127.0.0.1',port:3100,databaseUrl:'pglite:',secret:'test-only-auth-secret-at-least-thirty-two-characters',assetDir:'.data/test-assets',requireMfa:false,publicDelivery:false};
let db:Database,auth:Auth;
const credentials={name:'테스트',email:'owner@example.test',password:'synthetic-password-for-tests-only'};
beforeAll(async()=>{db=await connectDatabase('pglite:');await migrate(db);await bootstrap(db,credentials);auth=createAuth(db,config);});
afterAll(async()=>{await db.close();});
it('disables public signup even at the vendor handler',async()=>{
 const r=await auth.handler(new Request(config.origin+'/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin:config.origin},body:JSON.stringify({...credentials,email:'other@example.test'})}));expect(r.ok).toBe(false);
});
it('uses vendor password/session authentication and enforces suspension',async()=>{
 const r=await auth.handler(new Request(config.origin+'/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',origin:config.origin},body:JSON.stringify(credentials)}));
 expect(r.status,await r.clone().text()).toBe(200);
 const cookies=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');expect(cookies).toContain('session_token');
 const headers=new Headers({cookie:cookies,origin:config.origin});
 const actor=await authenticate(auth,db,config,headers);expect(actor.operator).toBe(true);
 await expect(requireFresh(db,actor)).rejects.toMatchObject({code:'REAUTH_REQUIRED'});
 await reauthenticate(db,actor,credentials.password);await expect(requireFresh(db,actor)).resolves.toBeUndefined();
 await db.query("UPDATE auth_user SET status='SUSPENDED' WHERE id=$1",[actor.userId]);
 await expect(authenticate(auth,db,config,headers)).rejects.toMatchObject({code:'SESSION_REVOKED'});
 const attempt=await auth.handler(new Request(config.origin+'/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',origin:config.origin},body:JSON.stringify(credentials)}));expect(attempt.ok).toBe(false);
});
