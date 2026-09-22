import {loadEnv} from './env';import {connectDatabase,migrate} from '../apps/api/src/db';import {bootstrap} from '../apps/api/src/auth';
loadEnv();const url=process.env.MIGRATION_DATABASE_URL??process.env.DATABASE_URL;if(!url)throw Error('Database URL is required');
if(!process.argv.includes('--from-stdin'))throw Error('Run npm run bootstrap -- --from-stdin and pipe JSON {name,email,password} from a secure prompt. Do not pass secrets as command arguments.');
let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>10000)throw Error('Input too large');}
const db=await connectDatabase(url);try{if(db.kind==='pglite')await migrate(db);const result=await bootstrap(db,JSON.parse(text));console.log(JSON.stringify({created:true,userId:result.userId,workspaceId:result.workspaceId}));}finally{text='';await db.close();}
