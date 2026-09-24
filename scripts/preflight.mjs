import fs from 'node:fs';
import 'dotenv/config';
import {publicBaseUrl} from '../server/validation.js';
const errors=[];
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<12))errors.push('Node >=22.12 required');
const pkg=JSON.parse(fs.readFileSync('package.json')),lock=JSON.parse(fs.readFileSync('package-lock.json'));
for(const key of ['dependencies','devDependencies'])if(JSON.stringify(pkg[key])!==JSON.stringify(lock.packages[''][key]))errors.push('package-lock dependencies differ from package.json');
for(const name of Object.keys(process.env).filter(x=>x.startsWith('VITE_'))){
 if(/SECRET|PRIVATE|SERVICE_ROLE|DATABASE_URL|JWT/i.test(name))errors.push(`Unsafe browser env name: ${name}`);
 const value=process.env[name]||'';
 if(value.startsWith('sb_secret_'))errors.push(`Backend key in browser variable: ${name}`);
 if(value.split('.').length===3){try{if(JSON.parse(Buffer.from(value.split('.')[1],'base64url')).role==='service_role')errors.push(`service_role token in ${name}`);}catch{}}
}
const required=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'];
const missing=required.filter(k=>!process.env[k]||/YOUR_/.test(process.env[k]));
if(missing.length)console.log('CONFIG REQUIRED before launch: '+missing.join(', '));
const runtime=process.argv.includes('--runtime');
const relevantMissing=missing.filter(k=>runtime?!k.startsWith('VITE_'):k.startsWith('VITE_'));
if(process.env.NODE_ENV==='production'&&relevantMissing.length)errors.push('Production environment is incomplete for this operation');
if(process.env.SUPABASE_URL&&process.env.VITE_SUPABASE_URL&&process.env.SUPABASE_URL!==process.env.VITE_SUPABASE_URL)errors.push('Frontend/backend must use the same Supabase project');
if(runtime||process.env.CERT_BASE_URL||process.env.PUBLIC_APP_URL){try{publicBaseUrl();}catch(error){errors.push(error.message);}}
if(errors.length){errors.forEach(e=>console.error('FAIL '+e));process.exit(1);}
console.log('PASS source/environment preflight (configuration notices above must be resolved before launch)');
