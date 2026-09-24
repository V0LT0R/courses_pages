import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { httpError, publicCertificate } from './validation.js';

export function createGateway(env=process.env) {
  const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
  const anon=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY;
  const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!serviceKey) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are required.');
  const client=(key,token)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{
    ...(token?{headers:{Authorization:`Bearer ${token}`}}:{}),
    fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(20000),...(init.signal?[init.signal]:[])])})
  }});
  const admin=client(serviceKey);
  const check=({data,error})=>{if(error)throw Object.assign(new Error('Database request failed'),{code:error.code});return data;};
  return {
    async authenticate(token) {
      const userClient=client(anon,token);
      const {data,error}=await userClient.auth.getUser(token);
      if(error||!data.user) throw httpError(401,'Сессия недействительна. Войдите снова.');
      return {id:data.user.id,client:userClient};
    },
    async requireRole(user,roles) {
      const p=check(await user.client.from('profiles').select('role').eq('id',user.id).single());
      if(!roles.includes(p?.role)) throw httpError(403,'Недостаточно прав.');
    },
    async issue(user,courseId) {
      const {data,error}=await user.client.rpc('issue_certificate',{check_course_id:courseId});
      if(error) {
        const messages=[[/Complete all/,'Сначала ознакомьтесь со всеми разделами.'],[/passed non-expired/,'Сначала успешно пройдите итоговый тест.'],[/CERTIFICATE_DISABLED/,'Для этого курса сертификат не предусмотрен.']];
        for(const [pattern,message] of messages)if(pattern.test(error.message))throw httpError(409,message);
        throw Object.assign(new Error('Certificate RPC failed'),{code:error.code});
      }
      return publicCertificate(Array.isArray(data)?data[0]:data);
    },
    async find(number) {
      const row=check(await admin.from('certificates').select('certificate_number,full_name_snapshot,course_title_snapshot,score_snapshot,issuer_snapshot,issued_at,status').eq('certificate_number',number).maybeSingle());
      if(row)return publicCertificate(row);
      const legacy=check(await admin.from('legacy_certificates').select('record').eq('certificate_number',number).maybeSingle());
      return legacy?publicCertificate(legacy.record):null;
    },
    async getPdf(number) {return check(await admin.from('certificate_pdfs').select('pdf_base64,verification_url').eq('certificate_number',number).maybeSingle());},
    async savePdf(number,buffer,verificationUrl) {
      // Primary key + ignoreDuplicates: concurrent processes keep exactly the first generated PDF.
      const result=await admin.from('certificate_pdfs').upsert({certificate_number:number,pdf_base64:buffer.toString('base64'),
        sha256:crypto.createHash('sha256').update(buffer).digest('hex'),verification_url:verificationUrl},{onConflict:'certificate_number',ignoreDuplicates:true});
      if(result.error?.code==='23503')return null; // Legacy-only record: keep deterministic renderer, no fabricated canonical row.
      check(result);return this.getPdf(number);
    },
    async upload(user,buffer,type) {
      const path=`${user.id}/${type.ext}/${crypto.randomUUID()}.${type.ext}`;
      check(await admin.storage.from('course-files').upload(path,buffer,{contentType:type.mime,upsert:false,cacheControl:'0'}));
      const data=check(await user.client.storage.from('course-files').createSignedUrl(path,3600));
      return {path,url:data.signedUrl};
    },
    async createManager(input) {
      const {data,error}=await admin.auth.admin.createUser({email:input.email,password:input.password,email_confirm:true,
        user_metadata:{full_name:input.fullName},app_metadata:{role:'manager'}});
      if(error)throw httpError(409,'Не удалось создать менеджера. Проверьте данные и список пользователей.');
      // The auth.users trigger inserts the trusted role/profile in the same database transaction.
      return {ok:true,user:{id:data.user.id,email:data.user.email,role:'manager'}};
    },
    async ready(){return check(await admin.rpc('app_readiness'))==='aquageo-2';}
  };
}
