import {loadEnv} from './env';import {connectDatabase,migrate} from '../apps/api/src/db';
loadEnv();const url=process.env.MIGRATION_DATABASE_URL??process.env.DATABASE_URL;if(!url)throw Error('MIGRATION_DATABASE_URL is required');const db=await connectDatabase(url);try{await migrate(db);console.log('Migrations applied and checksums verified.');}finally{await db.close();}
