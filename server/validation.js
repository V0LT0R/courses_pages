/** Shared HTTP boundary validation. PostgreSQL independently validates every RPC. */
export function httpError(status, message, code = 'REQUEST_ERROR') {
  return Object.assign(new Error(message), { status, code });
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw httpError(400, 'Некорректный идентификатор курса.');
  return value;
}
export function certificateNumber(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value))
    throw httpError(400, 'Некорректный номер сертификата.');
  return value;
}
export function certificateInput(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw httpError(400, 'Некорректный запрос.');
  // Compatibility: old clients may send snapshot fields. They are ignored, never trusted.
  return uuid(body.course_id ?? body.courseId);
}
export function detectFile(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) throw httpError(400, 'Файл повреждён или имеет неподдерживаемый формат.');
  if (buffer.subarray(0,5).toString()==='%PDF-' && buffer.subarray(-2048).includes(Buffer.from('%%EOF'))) return {mime:'application/pdf',ext:'pdf',max:25*1024*1024};
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {mime:'image/png',ext:'png',max:10*1024*1024};
  if (buffer[0]===255 && buffer[1]===216 && buffer[2]===255) return {mime:'image/jpeg',ext:'jpg',max:10*1024*1024};
  if (['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString())) return {mime:'image/gif',ext:'gif',max:10*1024*1024};
  if (buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP') return {mime:'image/webp',ext:'webp',max:10*1024*1024};
  throw httpError(400, 'Разрешены PDF, JPG, PNG, GIF и WEBP.');
}
export function managerInput(body={}) {
  const fullName=String(body.fullName||'').trim().replace(/\s+/g,' ');
  const email=String(body.email||'').trim().toLowerCase();
  const password=typeof body.password==='string'?body.password:'';
  if(fullName.length<2||fullName.length>120||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10||password.length>128)
    throw httpError(400,'Проверьте ФИО, email и пароль (10–128 символов).');
  return {fullName,email,password};
}
export function publicCertificate(row) {
  return {certificate_number:certificateNumber(row.certificate_number),full_name:row.full_name_snapshot??row.full_name,
    course_name:row.course_title_snapshot??row.course_name,score:row.score_snapshot??row.score??null,
    academic_hours:row.academic_hours_snapshot??row.academic_hours??null,city:row.city_snapshot??row.city??null,template_version:row.template_version??2,
    issuer:row.issuer_snapshot??row.issuer,issued_at:row.issued_at,status:row.status||'active',language:'ru',course_type:'course'};
}
export function publicBaseUrl(env=process.env) {
  const raw=env.CERT_BASE_URL||env.PUBLIC_APP_URL||(env.NODE_ENV==='production'?'':'http://localhost:5173');
  let u;try{u=new URL(raw);}catch{throw new Error('Configure PUBLIC_APP_URL or CERT_BASE_URL.');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||raw.length>220)
    throw new Error('Public URL must be an HTTP(S) origin, at most 220 characters.');
  if(env.NODE_ENV==='production'&&(u.protocol!=='https:'||/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname))) throw new Error('Production public URL must use HTTPS and a public hostname.');
  return u.origin;
}
