import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../../server/app.js';
const cert={certificate_number:'AQ-11111111111111111111111111111111',full_name:'Иван Иванов',course_name:'Семинар',score:100,issued_at:'2026-09-10T00:00:00Z',issuer:'AQUAGEO',status:'active'};
let issued=0,rendered=0;
const gateway={async authenticate(token){if(token!=='valid')throw Object.assign(new Error('Сессия недействительна.'),{status:401});return {id:'student'};},async requireRole(){throw Object.assign(new Error('Недостаточно прав.'),{status:403});},async issue(){issued++;return cert;},async find(number){return number===cert.certificate_number?cert:null;},async ready(){return true;},async getPdf(){return null;},async savePdf(){return null;}};
let server,url;
test.before(async()=>{const app=createApp({gateway,env:{PUBLIC_APP_URL:'http://localhost:5173'},logger:{info(){},error(){}},renderPdf:async()=>{rendered++;await new Promise(resolve=>setTimeout(resolve,50));return Buffer.from('%PDF-test');}});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));url=`http://127.0.0.1:${server.address().port}`;});
test.after(()=>new Promise(resolve=>server.close(resolve)));
test('health/readiness are separate probes',async()=>{assert.equal((await fetch(url+'/health')).status,200);assert.equal((await fetch(url+'/readiness')).status,200);});
test('missing/invalid JWT receive 401',async()=>{for(const token of ['', 'Bearer forged']){const r=await fetch(url+'/api/certificates/generate',{method:'POST',headers:{Authorization:token,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);}assert.equal(issued,0);});
test('untrusted CORS origin receives 403',async()=>{const r=await fetch(url+'/api/certificates/generate',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);});
test('malformed UUID and oversized request rejected',async()=>{let r=await fetch(url+'/api/certificates/generate',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({course_id:'bad'})});assert.equal(r.status,400);r=await fetch(url+'/api/certificates/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:'a'.repeat(70000)})});assert.equal(r.status,413);});
test('certificate uses gateway snapshot and strips input fields',async()=>{const r=await fetch(url+'/api/certificates/generate',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({course_id:'11111111-1111-4111-8111-111111111111',full_name:'Подмена',score:0,user_id:' чужой'})});const data=await r.json();assert.equal(r.status,200);assert.equal(data.full_name,cert.full_name);assert.equal(data.score,100);assert.equal(data.user_id,undefined);assert.equal(r.headers.get('cache-control'),'no-store');});
test('public verification displays persisted certificate and PDF link',async()=>{const r=await fetch(url+'/verify/'+cert.certificate_number);const html=await r.text();assert.equal(r.status,200);assert.match(html,/Иван Иванов/);assert.match(html,/Сертификат действителен/);assert.match(html,/Скачать PDF/);assert.doesNotMatch(html,/onclick=/);});
test('public JSON does not expose private identity',async()=>{const r=await fetch(url+'/api/certificates/'+cert.certificate_number+'/json');const data=await r.json();for(const key of ['user_id','external_user_id','email','signed_json','JWT'])assert.equal(data[key],undefined);});
test('concurrent PDF requests share a single render',async()=>{rendered=0;const responses=await Promise.all(Array.from({length:20},()=>fetch(url+'/api/certificates/'+cert.certificate_number+'/pdf')));for(const r of responses)assert.equal(r.status,200);assert.equal(rendered,1);});
test('student cannot upload a file or create manager',async()=>{for(const route of ['/api/uploads/course-file','/api/admin/managers']){const r=await fetch(url+route,{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/octet-stream'},body:Buffer.from('bad')});assert.equal(r.status,403);}});
test('unsafe certificate paths and HTML input rejected',async()=>{const r=await fetch(url+'/api/v1/verify/'+encodeURIComponent('<script>alert(1)</script>'));assert.equal(r.status,400);});

test('revoked PDF bypasses the saved active PDF without overwriting the original',async()=>{
 const originalFind=gateway.find,originalGet=gateway.getPdf,originalSave=gateway.savePdf;
 let read=0,saved=0;
 gateway.find=async()=>({...cert,status:'revoked'});
 gateway.getPdf=async()=>{read++;return {pdf_base64:Buffer.from('old active PDF').toString('base64')};};
 gateway.savePdf=async()=>{saved++;};
 try {
  const before=rendered;
  const response=await fetch(url+'/api/certificates/'+cert.certificate_number+'/pdf');
  assert.equal(response.status,200);assert.equal(await response.text(),'%PDF-test');
  assert.equal(rendered,before+1);assert.equal(read,0);assert.equal(saved,0);
 } finally {gateway.find=originalFind;gateway.getPdf=originalGet;gateway.savePdf=originalSave;}
});
