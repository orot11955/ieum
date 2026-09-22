import {spawn} from 'node:child_process';import {loadEnv} from './env';
loadEnv();if(!process.env.DATABASE_URL||!process.env.BETTER_AUTH_SECRET)throw Error('Copy .env.example to .env and set DATABASE_URL / a generated BETTER_AUTH_SECRET first');
const children=[spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{stdio:'inherit',env:process.env}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','apps/web/vite.config.ts'],{stdio:'inherit',env:process.env})];
let closing=false;function close(){if(closing)return;closing=true;for(const c of children)c.kill('SIGTERM');}
process.on('SIGINT',close);process.on('SIGTERM',close);for(const child of children)child.on('exit',code=>{if(!closing){close();process.exitCode=code??1;}});
