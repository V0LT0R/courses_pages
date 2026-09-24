import express from 'express';
import cors from 'cors';
import { corsOptions, createRateLimiter, requestId, securityHeaders } from './security.js';
import { certificateInput,certificateNumber,detectFile,managerInput,publicBaseUrl,httpError } from './validation.js';
import { generateCertificatePdf,renderCertificateHtml,escapeHtml } from './certificateService.js';

/** Dependency injection lets HTTP tests use a stub without claiming to exercise PostgreSQL. */
export function createApp({gateway,env=process.env,logger=console,renderPdf=generateCertificatePdf}) {
 const app=express();const base=publicBaseUrl(env);let activePdfs=0;let activeUploads=0;
 const inFlight=new Map();
 const limit=(namespace,max,windowMs=60000)=>createRateLimiter({namespace,max,windowMs});
 app.disable('x-powered-by');
 if(env.TRUST_PROXY){if(!/^\d+$/.test(env.TRUST_PROXY))throw new Error('TRUST_PROXY must be a known proxy hop count.');app.set('trust proxy',Number(env.TRUST_PROXY));}
 app.use(requestId,securityHeaders);
 app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
 app.use((req,res,next)=>{const start=Date.now();res.on('finish',()=>logger.info(JSON.stringify({event:'request',requestId:req.requestId,method:req.method,route:req.route?.path||'unmatched',status:res.statusCode,durationMs:Date.now()-start})));next();});
 app.use(cors(corsOptions()));
 app.get(['/health','/api/health'],(_req,res)=>res.json({ok:true}));
 app.get('/readiness',limit('readiness',30),async(_req,res)=>{try{const ok=await gateway.ready();res.status(ok?200:503).json({ok});}catch{res.status(503).json({ok:false});}});
 app.use('/api',limit('api',240));
 app.use(express.json({limit:'64kb',strict:true}));
 const auth=async(req,_res,next)=>{const token=/^Bearer ([^\s]+)$/i.exec(req.headers.authorization||'')?.[1];
   if(!token||token.length>16384)throw httpError(401,'Требуется авторизация.');req.user=await gateway.authenticate(token);next();};
 const links=cert=>({...cert,verify_url:`${base}/verify/${cert.certificate_number}`,verification_url:`${base}/verify/${cert.certificate_number}`,
   pdf_url:`${base}/api/certificates/${cert.certificate_number}/pdf`,certificate_url:`${base}/api/certificates/${cert.certificate_number}/pdf`});
 const find=async number=>{const cert=await gateway.find(certificateNumber(number));if(!cert)throw httpError(404,'Сертификат не найден.');return links(cert);};
 app.post('/api/certificates/generate',limit('issue',30),auth,async(req,res)=>{
   const cert=await gateway.issue(req.user,certificateInput(req.body));res.json({ok:true,...links(cert)});
 });
 app.get('/api/v1/verify/:number',limit('verify',90),async(req,res)=>{const cert=await find(req.params.number);res.json({...cert,valid:cert.status==='active'});});
 app.post('/api/v1/verify/manual',limit('manual',40),async(req,res)=>{const cert=await find(req.body?.certificate_number||req.body?.certificateNumber);
   const name=String(req.body?.full_name||req.body?.fullName||'').trim().toLowerCase();
   const course=String(req.body?.course_name||req.body?.courseName||'').trim().toLowerCase();
   const match=(!name||name===cert.full_name.toLowerCase())&&(!course||course===cert.course_name.toLowerCase());
   res.json({...cert,valid:cert.status==='active'&&match,status:match?cert.status:'data_mismatch'});
 });
 app.get('/api/certificates/:number/json',limit('json',60),async(req,res)=>{const cert=await find(req.params.number);res.json({...cert,valid:cert.status==='active'});});
 app.get('/verify/:number',limit('verify-page',90),async(req,res)=>{const cert=await find(req.params.number);
   res.type('html').send(renderCertificateHtml(cert));
 });
 async function pdf(cert) {
   const key = `${cert.certificate_number}:${cert.status}`;
   if(inFlight.has(key))return inFlight.get(key);
   if(activePdfs>=4)throw httpError(503,'Сервер занят. Попробуйте скачать сертификат позже.');
   activePdfs++;
   const task=(async()=>{const saved=cert.status==='revoked'?null:await gateway.getPdf(cert.certificate_number);if(saved)return Buffer.from(saved.pdf_base64,'base64');
     const bytes=await renderPdf(cert);if(cert.status==='revoked')return bytes;const stored=await gateway.savePdf(cert.certificate_number,bytes,cert.verify_url);
     return stored?Buffer.from(stored.pdf_base64,'base64'):bytes;})();
   inFlight.set(key,task);
   try{return await task;}finally{inFlight.delete(key);activePdfs--;}
 }
 app.get('/api/certificates/:number/pdf',limit('pdf',30),async(req,res)=>{const cert=await find(req.params.number);
   const bytes=await pdf(cert);if(req.destroyed)return;
   res.type('pdf').set('Content-Disposition',`inline; filename="${cert.certificate_number}.pdf"`).send(bytes);
 });
 app.post('/api/uploads/course-file',limit('upload',30,3600000),auth,async(req,res,next)=>{
   await gateway.requireRole(req.user,['admin','manager']);
   if(activeUploads>=4)throw httpError(503,'Сервер занят. Повторите загрузку позже.');
   activeUploads++;let released=false;const release=()=>{if(!released){released=true;activeUploads--;}};
   res.once('finish',release);res.once('close',release);
   express.raw({type:'application/octet-stream',limit:'25mb'})(req,res,next);
 },async(req,res)=>{const type=detectFile(req.body);if(req.body.length>type.max)throw httpError(413,'Файл слишком большой.');
   const result=await gateway.upload(req.user,req.body,type);res.status(201).json(result);
 });
 app.post('/api/admin/managers',limit('manager',10,3600000),auth,async(req,res)=>{
   await gateway.requireRole(req.user,['admin']);res.status(201).json(await gateway.createManager(managerInput(req.body)));
 });
 app.use((_req,res)=>res.status(404).json({message:'Страница не найдена.'}));
 app.use((error,req,res,_next)=>{
   const status=error.type==='entity.too.large'?413:error.type==='entity.parse.failed'?400:(Number(error.status)||500);
   logger.error(JSON.stringify({event:'request_error',requestId:req.requestId,code:error.code||error.type||'INTERNAL',status}));
   if(res.headersSent)return res.end();
   const message=status>=500?'Сервис временно недоступен. Повторите попытку позже.':status===413?'Файл или запрос слишком большой.':status===400&&error.type?'Некорректный запрос.':error.message;
   if(req.path.startsWith('/verify/'))return res.status(status).type('html').send(`<!doctype html><meta charset="utf-8"><title>Проверка сертификата</title><p>${escapeHtml(message)}</p>`);
   res.status(status).json({message,requestId:req.requestId});
 });
 return app;
}
