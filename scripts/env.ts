import {existsSync} from 'node:fs';
/** Load a local file only when explicitly present; never generate production secrets. */
export function loadEnv(){if(existsSync('.env'))process.loadEnvFile('.env');}
