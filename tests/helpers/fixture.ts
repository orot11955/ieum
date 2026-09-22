import {connectDatabase,migrate,type Database} from '../../apps/api/src/db';
import {bootstrap,createAuth,authenticate,reauthenticate,provisionUser,type Principal} from '../../apps/api/src/auth';
import {hashPassword} from 'better-auth/crypto';
import type {Config} from '../../apps/api/src/config';
export const credentials={name:'합성 사용자',email:'owner@example.test',password:'synthetic-password-for-tests-only'};
export const testConfig:Config={environment:'test',origin:'http://127.0.0.1:5173',host:'127.0.0.1',port:3100,databaseUrl:'pglite:',secret:'test-only-auth-secret-at-least-thirty-two-characters',assetDir:'.data/test-assets',requireMfa:false,publicDelivery:false};
export async function fixture(){
 const url=process.env.TEST_DATABASE_URL??'pglite:';const db=await connectDatabase(url);await migrate(db);
 // A dedicated database is required when TEST_DATABASE_URL is set. Tests run serially.
 if(url!=='pglite:')await db.query('TRUNCATE auth_user CASCADE');
 await bootstrap(db,credentials);const auth=createAuth(db,testConfig);
 async function login(email:string){const r=await auth.handler(new Request(testConfig.origin+'/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',origin:testConfig.origin},body:JSON.stringify({email,password:credentials.password})}));if(!r.ok)throw new Error(await r.text());const cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const actor=await authenticate(auth,db,testConfig,new Headers({cookie}));return {actor,cookie};}
 const {actor,cookie}=await login(credentials.email);await reauthenticate(db,actor,credentials.password);
 const otherHash=await hashPassword(credentials.password);await db.transaction(tx=>provisionUser(tx,{...credentials,name:'다른 사용자',email:'other@example.test'},otherHash,false));
 const {actor:other,cookie:otherCookie}=await login('other@example.test');return {db,auth,actor,cookie,other,otherCookie,close:()=>db.close()};
}
