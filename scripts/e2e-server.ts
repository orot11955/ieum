import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';import {rm,mkdir} from 'node:fs/promises';
import {connectDatabase,migrate} from '../apps/api/src/db';import {bootstrap} from '../apps/api/src/auth';
// Only this dedicated disposable location is reset. No .env or production connection is read.
await mkdir('.data',{recursive:true});await rm('.data/e2e-db',{recursive:true,force:true});
const databaseUrl='pglite:.data/e2e-db',db=await connectDatabase(databaseUrl);try{await migrate(db);await bootstrap(db,{name:'테스트 사용자',email:'demo@example.test',password:'synthetic-browser-test-password-only'});}finally{await db.close();}
const env={...process.env,NODE_ENV:'test',DATABASE_URL:databaseUrl,BETTER_AUTH_SECRET:randomBytes(48).toString('base64url'),APP_ORIGIN:'http://127.0.0.1:5173',REQUIRE_MFA:'false',DELIVERY_PUBLIC:'false',ASSET_DIR:'.data/e2e-assets'};
const child=spawn(process.execPath,['--import','tsx','scripts/dev.ts'],{stdio:'inherit',env});for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));child.on('exit',code=>{process.exitCode=code??1;});
