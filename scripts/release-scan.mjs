import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const failures=[];
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of [...walk('server'),...walk('src'),...walk('scripts')]){
 if(!/\.(js|jsx|mjs)$/.test(file))continue;
 const text=fs.readFileSync(file,'utf8');
 if(/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(text)&&!file.endsWith('release-scan.mjs'))failures.push(`Private key block: ${file}`);
 if(file.startsWith('src')&&/dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(/.test(text))failures.push(`Unsafe browser code: ${file}`);
 if(file.startsWith('src')&&/VITE_\w*(SERVICE_ROLE|PRIVATE|SECRET|DATABASE)/.test(text))failures.push(`Unsafe browser env: ${file}`);
 if(!file.endsWith('.jsx')){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)failures.push(`Syntax: ${file}: ${r.stderr}`);}
}
const lock=fs.readFileSync('package-lock.json','utf8');
if(/packages\..*internal\.api\.openai/.test(lock))failures.push('Lockfile references private registry');
if(failures.length){failures.forEach(x=>console.error('FAIL '+x));process.exit(1);}
console.log('PASS release scan: JS syntax, browser injection patterns, secret variable names and registry URLs');
