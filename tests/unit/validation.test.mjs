import test from 'node:test';
import assert from 'node:assert/strict';
import {detectFile,uuid,certificateNumber,publicBaseUrl,publicCertificate,managerInput} from '../../server/validation.js';
import {escapeHtml,generateCertificatePdf,renderCertificateHtml} from '../../server/certificateService.js';
import {userMessage} from '../../src/lib/errors.js';
test('signature validation rejects MIME spoof and accepts PDF signature',()=>{assert.throws(()=>detectFile(Buffer.from('<html>fake.pdf</html>')));assert.equal(detectFile(Buffer.from('%PDF-1.7\nexample\n%%EOF')).mime,'application/pdf');});
test('path traversal, malformed UUID and unsafe public origins rejected',()=>{for(const input of ['../key','a/b','<script>'])assert.throws(()=>certificateNumber(input));assert.throws(()=>uuid('x'));assert.throws(()=>publicBaseUrl({NODE_ENV:'production',CERT_BASE_URL:'http://localhost:4000'}));assert.throws(()=>publicBaseUrl({CERT_BASE_URL:'https://name:password@host.example'}));assert.equal(publicBaseUrl({CERT_BASE_URL:'https://app.example/'}),'https://app.example');});
test('public snapshot excludes private keys even if database record has them',()=>{const row=publicCertificate({certificate_number:'AQ-123456789',full_name_snapshot:'Name',user_id:'private',email:'private',signed_json:'secret'});assert.equal(row.user_id,undefined);assert.equal(row.email,undefined);});
test('manager validation disallows weak passwords',()=>{assert.throws(()=>managerInput({fullName:'Manager',email:'m@example.com',password:'short'}));});
test('errors do not reveal schema cache, SQL or Supabase instructions',()=>{assert.doesNotMatch(userMessage({code:'PGRST202',message:'Could not find public.xxx in schema cache'}),/schema|SQL|public|Supabase/);});
test('HTML escapes certificate text and reflects revocation',()=>{assert.equal(escapeHtml('<img>'),'&lt;img&gt;');const html=renderCertificateHtml({certificate_number:'AQ-123456789',full_name:'<script>x</script>',course_name:'Тест',issued_at:'2026-09-10',status:'revoked',verify_url:'https://example.com/verify/AQ-123456789'});assert.match(html,/&lt;script&gt;/);assert.match(html,/Сертификат отозван/);assert.doesNotMatch(html,/<script>/);});
test('PDF embeds fonts and is deterministic for the same snapshot',async()=>{const cert={certificate_number:'AQ-123456789',full_name:'Иванов Иван Иванович',course_name:'Тестовый семинар',issued_at:'2026-09-10T00:00:00Z',verify_url:'https://example.com/verify/AQ-123456789',score:100,issuer:'AQUAGEO',status:'active'};const a=await generateCertificatePdf(cert),b=await generateCertificatePdf(cert);assert.equal(a.subarray(0,5).toString(),'%PDF-');assert.deepEqual(a,b);assert.ok(a.length>10000);});

test('option pagination does not lose records above Supabase row cap',async()=>{
 const {selectAll}=await import('../../src/lib/pagination.js');
 const source=Array.from({length:1200},(_,id)=>({id}));let calls=0;
 const rows=await selectAll(()=>({range:async(start,end)=>{calls++;return {data:source.slice(start,end+1)};}}));
 assert.equal(rows.length,1200);assert.equal(calls,3);assert.equal(rows[1199].id,1199);
});
