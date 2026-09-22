import {resolve} from 'node:path';import {existsSync} from 'node:fs';import staticFiles from '@fastify/static';
import {loadEnv} from '../../../scripts/env';import {readConfig} from './config';import {connectDatabase,migrate} from './db';import {buildApp} from './app';
loadEnv();const config=readConfig(),db=await connectDatabase(config.databaseUrl);
if(db.kind==='pglite'&&config.environment!=='production')await migrate(db);
if(config.environment==='production'){
 const r=(await db.query<{rolsuper:boolean;rolbypassrls:boolean}>('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
 if(!r||r.rolsuper||r.rolbypassrls)throw new Error('Runtime database role must not be superuser or bypass RLS');
}
const {app,ops}=await buildApp(db,config);const root=resolve('dist/web');
if(existsSync(root)){
 await app.register(staticFiles,{root,prefix:'/',wildcard:false});
 app.setNotFoundHandler((req,reply)=>{if(req.method==='GET'&&!req.url.startsWith('/api/')&&!req.url.startsWith('/delivery/')&&req.headers.accept?.includes('text/html'))return reply.sendFile('index.html');return reply.code(404).send({status:404,code:'NOT_FOUND',detail:'경로를 찾을 수 없습니다.'});});
}
let running=false,stopping=false;const timer=setInterval(async()=>{if(running||stopping)return;running=true;try{await ops.runOne();}catch{app.log.error({code:'WORKER_POLL_FAILED'},'job polling failed');}finally{running=false;}},1500);
async function close(){if(stopping)return;stopping=true;clearInterval(timer);await app.close();while(running)await new Promise(r=>setTimeout(r,50));await db.close();}
process.on('SIGINT',()=>{void close().then(()=>process.exit(0));});process.on('SIGTERM',()=>{void close().then(()=>process.exit(0));});
await app.listen({host:config.host,port:config.port});
