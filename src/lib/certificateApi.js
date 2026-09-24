import { apiRequest } from './api';
export function buildCertificatePayload(payload) {return {course_id:payload.courseId||payload.course_id};}
export async function sendCertificateData(payload,accessToken='') {
 return apiRequest('/certificates/generate',{method:'POST',accessToken,body:JSON.stringify(buildCertificatePayload(payload))});
}
