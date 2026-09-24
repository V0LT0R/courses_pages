import http from 'k6/http';
import {check,sleep} from 'k6';
export const options={vus:5,duration:'20s',thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<1500']}};
export function setup(){if(__ENV.ALLOW_STAGING_LOAD!=='YES'||!__ENV.STAGING_APP_URL||!__ENV.STAGING_SUPABASE_URL)throw new Error('Use an isolated staging project and ALLOW_STAGING_LOAD=YES.');}
export default function(){
 const publicHeaders={apikey:__ENV.STAGING_ANON_KEY};
 const catalog=http.get(`${__ENV.STAGING_SUPABASE_URL}/rest/v1/courses?select=id,title&limit=12`,{headers:publicHeaders});
 check(catalog,{'catalog 200':r=>r.status===200});
 if(__ENV.CERTIFICATE_NUMBER){const verify=http.get(`${__ENV.STAGING_APP_URL}/api/v1/verify/${__ENV.CERTIFICATE_NUMBER}`);check(verify,{'verification 200':r=>r.status===200});}
 // Optional fixture account: enroll/start are idempotent for the same user/course.
 // First mark fixture sections completed, using its normal student session.
 if(__ENV.STAGING_STUDENT_JWT&&__ENV.FIXTURE_COURSE_ID){
  for(const fn of ['enroll_in_course','start_course_test']){
   const r=http.post(`${__ENV.STAGING_SUPABASE_URL}/rest/v1/rpc/${fn}`,JSON.stringify({check_course_id:__ENV.FIXTURE_COURSE_ID}),{headers:{...publicHeaders,Authorization:`Bearer ${__ENV.STAGING_STUDENT_JWT}`,'Content-Type':'application/json'}});
   check(r,{[`${fn} 200`]:response=>response.status===200});
  }
 }
 sleep(5);
}
