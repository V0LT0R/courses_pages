import 'dotenv/config';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {certificateNumber,uuid} from '../server/validation.js';
// Explicit utility only. Production API never connects to the old database.
const apply=process.argv.includes('--apply');
if(!process.env.LEGACY_DATABASE_URL||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){console.error('Set LEGACY_DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend environment.');process.exit(2);}
const source=new pg.Client({connectionString:process.env.LEGACY_DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:30000});
const dest=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=({data,error})=>{if(error)throw Object.assign(new Error('Destination operation failed'),{code:error.code});return data;};
let count=0,canonical=0,unmapped=0;
try{
 await source.connect();await source.query('begin read only');
 // No credentials, private JSON, names or emails are printed by this utility.
 const rows=(await source.query('select * from local_certificate_records order by issued_at asc,certificate_number asc')).rows;
 const planned=[];const groups=new Set();
 for(const row of rows){
  certificateNumber(row.certificate_number);
  let userId=null;try{userId=uuid(row.external_user_id);}catch{}
  const profile=userId?checked(await dest.from('profiles').select('id').eq('id',userId).maybeSingle()):null;
  let course=null;let courseUuid=null;try{courseUuid=uuid(row.course_id);}catch{}
  if(courseUuid)course=checked(await dest.from('courses').select('id').eq('id',courseUuid).maybeSingle());
  if(!course)course=checked(await dest.from('courses').select('id').eq('slug',String(row.course_id)).maybeSingle());
  const group=profile&&course?`${userId}:${course.id}`:null;
  if(!group)unmapped++;
  const first=group&&!groups.has(group);if(group)groups.add(group);
  planned.push({row,userId,course,first});
 }
 if(!apply){console.log(JSON.stringify({mode:'dry-run',records:rows.length,canonicalGroups:groups.size,unmapped,action:'Review backup/mappings; rerun with --apply during maintenance.'}));}
 else{
  for(const {row,userId,course,first} of planned){
   checked(await dest.from('legacy_certificates').upsert({certificate_number:row.certificate_number,record:row},{onConflict:'certificate_number',ignoreDuplicates:true}));count++;
   if(first){
    const previous=checked(await dest.from('certificates').select('certificate_number').eq('user_id',userId).eq('course_id',course.id).maybeSingle());
    if(previous&&previous.certificate_number!==row.certificate_number)throw new Error('Canonical conflict: issuance already occurred. Resolve manually without deleting records.');
    checked(await dest.from('certificates').upsert({certificate_number:row.certificate_number,user_id:userId,course_id:course.id,
     full_name_snapshot:row.full_name,course_title_snapshot:row.course_name,score_snapshot:row.score==null?null:Math.round(Number(row.score)),
     issuer_snapshot:row.issuer||'AQUAGEO.KZ',issued_at:row.issued_at,status:row.status==='revoked'?'revoked':'active',template_version:2},
     {onConflict:'user_id,course_id',ignoreDuplicates:true}));canonical++;
   }
  }
  console.log(JSON.stringify({mode:'apply',legacyPreserved:count,canonical,unmapped}));
  if(unmapped){console.error('Some legacy records cannot be linked to a current user/course; old verification URLs remain available. Resolve mappings before reopening issuance.');process.exitCode=1;}
 }
 await source.query('commit');
}catch(error){console.error(JSON.stringify({event:'legacy_import_failed',code:error.code||'VALIDATION',message:error.message.startsWith('Canonical conflict')?error.message:'Import incomplete; fix source/schema/mappings and rerun. Records already copied are preserved.'}));process.exitCode=1;}
finally{await source.end();}
