import {z} from 'zod';
const schema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 APP_ORIGIN:z.url().default('http://127.0.0.1:5173'),
 HOST:z.string().default('127.0.0.1'), PORT:z.coerce.number().int().min(1).max(65535).default(3100),
 DATABASE_URL:z.string().min(1), BETTER_AUTH_SECRET:z.string().min(32),
 ASSET_DIR:z.string().default('.data/assets'), REQUIRE_MFA:z.enum(['true','false']).default('true'),
 DELIVERY_PUBLIC:z.enum(['true','false']).default('false'),
});
export type Config={environment:'development'|'test'|'production';origin:string;host:string;port:number;databaseUrl:string;secret:string;assetDir:string;requireMfa:boolean;publicDelivery:boolean};
export function readConfig(env:NodeJS.ProcessEnv=process.env):Config{
 const p=schema.parse(env);const url=new URL(p.APP_ORIGIN);
 if(url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw Error('APP_ORIGIN must be an origin only');
 if(p.NODE_ENV==='production'&&(url.protocol!=='https:'||p.DATABASE_URL.startsWith('pglite:')||p.REQUIRE_MFA!=='true'))throw Error('Production requires HTTPS, PostgreSQL and MFA');
 return {environment:p.NODE_ENV,origin:url.origin,host:p.HOST,port:p.PORT,databaseUrl:p.DATABASE_URL,secret:p.BETTER_AUTH_SECRET,assetDir:p.ASSET_DIR,requireMfa:p.REQUIRE_MFA==='true',publicDelivery:p.DELIVERY_PUBLIC==='true'};
}
