/** Synthetic fixture only. Explicit test switch and a dedicated local database are required. */
import {randomBytes} from 'node:crypto';import {writeFile,mkdir} from 'node:fs/promises';
import {connectDatabase,migrate} from '../apps/api/src/db';import {bootstrap} from '../apps/api/src/auth';
if(process.env.IEUM_TEST_SEED!=='1')throw Error('Set IEUM_TEST_SEED=1 only for a dedicated disposable test database');
const url=process.env.DATABASE_URL??'pglite:.data/browser-db';if(!url.startsWith('pglite:')&&!url.includes('ieum_test'))throw Error('Dedicated test database required');
const db=await connectDatabase(url);try{await migrate(db);await bootstrap(db,{name:'테스트 사용자',email:'demo@example.test',password:'synthetic-browser-test-password-only'});}finally{await db.close();}
