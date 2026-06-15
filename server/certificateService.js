import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const DEFAULT_PRIVATE_KEY = '2JB7pZDbWQ55gAriThI0NMTBitd6/FPDsvqnEoCZR9I=';
const DEFAULT_PUBLIC_KEY = 'LxuZubFprzfA7P/HJH0ljfQRXoi5WwH7jNm2MTgC9X0=';
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const RANDOM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function firstExistingPath(paths) {
  for (const item of paths) {
    if (!item) continue;
    try {
      if (fs.existsSync(item)) return item;
    } catch {
      // ignore inaccessible font paths
    }
  }
  return null;
}

function resolvePdfFontPath(kind = 'regular') {
  const envPath = kind === 'bold'
    ? process.env.CERT_FONT_BOLD
    : process.env.CERT_FONT_REGULAR;

  const localFontName = kind === 'bold'
    ? 'NotoSerif-Bold.ttf'
    : 'NotoSerif-Regular.ttf';

  const candidates = [
    envPath,

    // Optional project-local fonts. You can put NotoSerif files into server/fonts.
    path.join(__dirname, 'fonts', localFontName),
    path.join(process.cwd(), 'server', 'fonts', localFontName),

    // Windows
    kind === 'bold' ? 'C:/Windows/Fonts/arialbd.ttf' : 'C:/Windows/Fonts/arial.ttf',
    kind === 'bold' ? 'C:/Windows/Fonts/timesbd.ttf' : 'C:/Windows/Fonts/times.ttf',
    kind === 'bold' ? 'C:/Windows/Fonts/georgiab.ttf' : 'C:/Windows/Fonts/georgia.ttf',

    // Linux / Render
    kind === 'bold'
      ? '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
      : '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    kind === 'bold'
      ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
      : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    kind === 'bold'
      ? '/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf'
      : '/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf',
    kind === 'bold'
      ? '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'
      : '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',

    // macOS
    kind === 'bold'
      ? '/Library/Fonts/Arial Bold.ttf'
      : '/Library/Fonts/Arial.ttf',
    kind === 'bold'
      ? '/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf'
      : '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
  ];

  return firstExistingPath(candidates);
}

function registerCertificateFonts(doc) {
  const regularPath = resolvePdfFontPath('regular');
  const boldPath = resolvePdfFontPath('bold');

  try {
    if (regularPath) doc.registerFont('CertRegular', regularPath);
    if (boldPath) doc.registerFont('CertBold', boldPath);

    return {
      regular: regularPath ? 'CertRegular' : 'Times-Roman',
      bold: boldPath ? 'CertBold' : (regularPath ? 'CertRegular' : 'Times-Bold'),
    };
  } catch (error) {
    console.warn('Certificate PDF font registration failed, falling back to built-in PDF fonts:', error.message);
    return {
      regular: 'Times-Roman',
      bold: 'Times-Bold',
    };
  }
}

function getCertificateBaseUrl() {
  return (
    process.env.CERT_BASE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    `http://localhost:${process.env.PORT || 4000}`
  ).replace(/\/$/, '');
}

function getCertificateVerifyUrl(cert) {
  if (cert.verify_url && !String(cert.verify_url).includes('localhost')) {
    return String(cert.verify_url);
  }

  return `${getCertificateBaseUrl()}/verify/${encodeURIComponent(cert.certificate_number)}`;
}

export function canonicalize(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObject(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function decodeBase64(value) {
  const normalized = String(value || '').trim();
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function privateKeyFromRaw(rawKeyBase64) {
  const raw = decodeBase64(rawKeyBase64 || DEFAULT_PRIVATE_KEY);
  if (raw.length !== 32) throw new Error('ED25519_PRIVATE_KEY должен быть base64 от raw 32-byte ключа.');
  return crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, raw]),
    format: 'der',
    type: 'pkcs8',
  });
}

function publicKeyFromRaw(rawKeyBase64) {
  const raw = decodeBase64(rawKeyBase64 || DEFAULT_PUBLIC_KEY);
  if (raw.length !== 32) throw new Error('ED25519_PUBLIC_KEY должен быть base64 от raw 32-byte ключа.');
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

export function toIsoZ(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function randomSuffix(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += RANDOM_ALPHABET[bytes[i] % RANDOM_ALPHABET.length];
  }
  return out;
}

export function makeCertificateNumber() {
  const prefix = process.env.CERT_PREFIX || 'NIC';
  const project = process.env.CERT_PROJECT || 'WATER';
  const year = new Date().getUTCFullYear();
  return `${prefix}-${project}-${year}-${randomSuffix()}`;
}

export function sha256Hex0x(data) {
  return `0x${crypto.createHash('sha256').update(data).digest('hex')}`;
}

export function signCredential(unsigned, createdAt) {
  const privateKey = privateKeyFromRaw(process.env.ED25519_PRIVATE_KEY);
  const payload = Buffer.from(canonicalize(unsigned), 'utf8');
  const signature = crypto.sign(null, payload, privateKey).toString('base64');
  return {
    ...unsigned,
    proof: {
      type: 'Ed25519Signature2020',
      created: toIsoZ(createdAt),
      verificationMethod: process.env.ISSUER_KEY_ID || `${getCertificateBaseUrl()}/issuer.json#key-1`,
      proofPurpose: 'assertionMethod',
      proofValue: signature,
    },
  };
}

export function verifySignedCredential(signedDoc) {
  const proof = signedDoc?.proof;
  const proofValue = proof?.proofValue;
  if (!proofValue) return false;
  const publicKey = publicKeyFromRaw(process.env.ED25519_PUBLIC_KEY);
  const signingView = { ...signedDoc };
  delete signingView.proof;
  delete signingView.anchors;
  return crypto.verify(
    null,
    Buffer.from(canonicalize(signingView), 'utf8'),
    publicKey,
    Buffer.from(proofValue, 'base64')
  );
}

export function buildUnsignedCredential({
  credentialUuid,
  certificateNumber,
  externalUserId,
  fullName,
  courseId,
  courseName,
  courseType = 'course',
  completedAt,
  issuedAt,
  score = null,
  durationHours = null,
}) {
  const achievement = {
    type: courseType === 'internship' ? 'Internship' : 'Course',
    id: String(courseId),
    name: String(courseName),
    courseType,
    completedAt: toIsoZ(completedAt),
  };
  if (score !== null && score !== undefined && score !== '') achievement.score = Number(score);
  if (durationHours !== null && durationHours !== undefined && durationHours !== '') achievement.durationHours = Number(durationHours);

  const baseUrl = getCertificateBaseUrl();
  const issuerProfileUrl = process.env.ISSUER_PROFILE_URL || `${baseUrl}/issuer.json`;

  return {
    '@context': ['https://www.w3.org/2018/credentials/v1', `${baseUrl}/contexts/v1`],
    type: ['VerifiableCredential', 'EducationalCertificate'],
    id: `urn:uuid:${credentialUuid}`,
    issuer: {
      id: issuerProfileUrl,
      name: process.env.ISSUER_NAME || 'NIC Research Center',
      url: process.env.ISSUER_URL || 'https://nic.kz',
    },
    issuanceDate: toIsoZ(issuedAt),
    credentialSubject: {
      id: `urn:external-user-id:${externalUserId}`,
      name: String(fullName),
      achievement,
    },
    certificateNumber,
  };
}

export function normalizeIssuePayload(body = {}) {
  const completedAt = body.completed_at || body.completedAt || new Date().toISOString();
  const courseType = body.course_type === 'internship' || body.courseType === 'internship' ? 'internship' : 'course';
  const language = ['ru', 'kz', 'en'].includes(String(body.language || 'ru').toLowerCase())
    ? String(body.language || 'ru').toLowerCase()
    : 'ru';

  return {
    externalUserId: String(body.external_user_id || body.externalUserId || 'unknown_user'),
    fullName: String(body.full_name || body.fullName || '').trim(),
    courseId: String(body.course_id || body.courseId || 'course'),
    courseName: String(body.course_name || body.courseName || body.courseTitle || '').trim(),
    courseType,
    durationHours: body.course_duration_hours ?? body.courseDurationHours ?? null,
    score: body.score ?? 100,
    completedAt,
    language,
  };
}

export function buildMockAnchor(dataHash) {
  const txHash = `0x${crypto.createHash('sha256').update(`issue:${dataHash}`).digest('hex')}`;
  return {
    txHash,
    blockNumber: 1,
    contractAddress: process.env.CONTRACT_ADDRESS || '0xMOCKMOCKMOCKMOCKMOCKMOCKMOCKMOCKMOCK0000',
    chain: process.env.CHAIN_LABEL || 'polygon:amoy',
  };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


export async function generateCertificatePdf(cert) {
  const verifyUrl = getCertificateVerifyUrl(cert);
  const issued = cert.issued_at ? new Date(cert.issued_at) : new Date();
  const issuedDate = Number.isNaN(issued.getTime()) ? '' : issued.toLocaleDateString('ru-RU');
  const labels = {
    ru: {
      title: 'СЕРТИФИКАТ',
      subtitle: 'подтверждает успешное прохождение обучения',
      completed: 'успешно прошёл(ла) курс',
      internship: 'успешно прошёл(ла) стажировку',
      duration: 'Продолжительность',
      hours: 'часов',
      score: 'Результат',
      issued: 'Дата выдачи',
      number: 'Номер сертификата',
      verify: 'Проверить сертификат',
    },
    en: {
      title: 'CERTIFICATE',
      subtitle: 'confirms successful completion of training',
      completed: 'has successfully completed the course',
      internship: 'has successfully completed the internship',
      duration: 'Duration',
      hours: 'hours',
      score: 'Score',
      issued: 'Issued',
      number: 'Certificate number',
      verify: 'Verify certificate',
    },
    kz: {
      title: 'СЕРТИФИКАТ',
      subtitle: 'оқуды сәтті аяқтағанын растайды',
      completed: 'курсты сәтті аяқтады',
      internship: 'тағылымдаманы сәтті аяқтады',
      duration: 'Ұзақтығы',
      hours: 'сағат',
      score: 'Нәтиже',
      issued: 'Берілген күні',
      number: 'Сертификат нөмірі',
      verify: 'Сертификатты тексеру',
    },
  }[cert.language || 'ru'];
  const score = cert.score !== null && cert.score !== undefined ? Number(cert.score) : null;
  const intro = cert.course_type === 'internship' ? labels.internship : labels.completed;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 });
  const qrPng = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: { Title: cert.certificate_number },
  });
  const pdfFonts = registerCertificateFonts(doc);
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  doc.rect(0, 0, pageW, pageH).fill('#ffffff');
  doc.lineWidth(2).strokeColor('#0b5394').roundedRect(28, 28, pageW - 56, pageH - 56, 12).stroke();
  doc.lineWidth(1).strokeColor('#c9a227').roundedRect(40, 40, pageW - 80, pageH - 80, 9).stroke();

  const issuer = cert.issuer || process.env.ISSUER_NAME || 'NIC Research Center';
  doc.fillColor('#0b5394').font(pdfFonts.regular).fontSize(15).text(String(issuer).toUpperCase(), 0, 72, { align: 'center', width: pageW, characterSpacing: 0.5 });
  doc.font(pdfFonts.bold).fontSize(48).text(labels.title, 0, 120, { align: 'center', width: pageW, characterSpacing: 5 });
  doc.fillColor('#44566b').font(pdfFonts.regular).fontSize(16).text(labels.subtitle, 0, 183, { align: 'center', width: pageW });
  doc.fillColor('#1b2a3a').font(pdfFonts.bold).fontSize(36).text(cert.full_name, 80, 225, { align: 'center', width: pageW - 160 });
  doc.moveTo(190, 276).lineTo(pageW - 190, 276).lineWidth(1.2).strokeColor('#c9a227').stroke();
  doc.fillColor('#44566b').font(pdfFonts.regular).fontSize(15).text(intro, 0, 298, { align: 'center', width: pageW });
  doc.fillColor('#1b2a3a').font(pdfFonts.bold).fontSize(22).text(`«${cert.course_name}»`, 90, 324, { align: 'center', width: pageW - 180 });

  const meta = [];
  if (cert.course_duration_hours) meta.push(`${labels.duration}: ${cert.course_duration_hours} ${labels.hours}`);
  if (score !== null && !Number.isNaN(score)) meta.push(`${labels.score}: ${score.toFixed(1)}`);
  meta.push(`${labels.issued}: ${issuedDate}`);
  doc.fillColor('#2a3b4d').font(pdfFonts.regular).fontSize(13).text(meta.join('     '), 0, 385, { align: 'center', width: pageW });

  doc.strokeColor('#1b2a3a').lineWidth(1).moveTo(86, 506).lineTo(242, 506).stroke();
  doc.fillColor('#44566b').fontSize(10).text(issuer, 70, 512, { align: 'center', width: 190 });
  doc.fillColor('#6b7c8d').fontSize(10).text(`${labels.number}\n${cert.certificate_number}`, 312, 500, { align: 'center', width: 220, characterSpacing: 0.6 });
  doc.image(qrPng, pageW - 170, 462, { width: 80, height: 80 });
  doc
    .fillColor('#0b5394')
    .font(pdfFonts.bold)
    .fontSize(8)
    .text(labels.verify, pageW - 205, 545, {
      align: 'center',
      width: 150,
      link: verifyUrl,
      underline: true,
    });
  doc
    .fillColor('#6b7c8d')
    .font(pdfFonts.regular)
    .fontSize(6.2)
    .text(cert.certificate_number, pageW - 205, 558, {
      align: 'center',
      width: 150,
    });

  doc.end();
  return done;
}

export function renderCertificateHtml(cert, { printable = true } = {}) {
  const labels = {
    ru: {
      title: 'СЕРТИФИКАТ',
      subtitle: 'подтверждает успешное прохождение обучения',
      completed: 'успешно прошёл(ла) курс',
      internship: 'успешно прошёл(ла) стажировку',
      duration: 'Продолжительность',
      hours: 'часов',
      score: 'Результат',
      issued: 'Дата выдачи',
      number: 'Номер сертификата',
      verify: 'Проверить сертификат',
      print: 'Печать / сохранить PDF',
    },
    en: {
      title: 'CERTIFICATE',
      subtitle: 'confirms successful completion of training',
      completed: 'has successfully completed the course',
      internship: 'has successfully completed the internship',
      duration: 'Duration',
      hours: 'hours',
      score: 'Score',
      issued: 'Issued',
      number: 'Certificate number',
      verify: 'Verify certificate',
      print: 'Print / save PDF',
    },
    kz: {
      title: 'СЕРТИФИКАТ',
      subtitle: 'оқуды сәтті аяқтағанын растайды',
      completed: 'курсты сәтті аяқтады',
      internship: 'тағылымдаманы сәтті аяқтады',
      duration: 'Ұзақтығы',
      hours: 'сағат',
      score: 'Нәтиже',
      issued: 'Берілген күні',
      number: 'Сертификат нөмірі',
      verify: 'Сертификатты тексеру',
      print: 'Басып шығару / PDF сақтау',
    },
  }[cert.language || 'ru'];
  const issued = cert.issued_at ? new Date(cert.issued_at) : new Date();
  const issuedDate = Number.isNaN(issued.getTime()) ? '' : issued.toLocaleDateString('ru-RU');
  const verifyUrl = getCertificateVerifyUrl(cert);
  const score = cert.score !== null && cert.score !== undefined ? Number(cert.score) : null;
  const intro = cert.course_type === 'internship' ? labels.internship : labels.completed;

  return `<!doctype html>
<html lang="${escapeHtml(cert.language || 'ru')}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(cert.certificate_number)} — certificate</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef3f8; color: #1b2a3a; font-family: 'Times New Roman', Georgia, serif; }
  .toolbar { padding: 16px; text-align: center; font-family: Arial, sans-serif; }
  .toolbar button, .toolbar a { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 11px 18px; background: #0b5394; color: #fff; text-decoration: none; cursor: pointer; font-weight: 700; margin: 4px; }
  .sheet { width: 297mm; min-height: 210mm; margin: 18px auto; padding: 14mm 18mm; position: relative; background: #fff; box-shadow: 0 18px 50px rgba(10, 27, 55, .14); }
  .border { position: absolute; inset: 7mm; border: 2px solid #0b5394; border-radius: 4mm; }
  .border::after { content: ''; position: absolute; inset: 2.5mm; border: .5mm solid #c9a227; border-radius: 3mm; }
  .content { position: relative; height: 182mm; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 6mm 10mm; }
  .issuer { font-size: 13pt; letter-spacing: .5pt; color: #0b5394; text-transform: uppercase; margin-top: 2mm; }
  .title { font-size: 40pt; font-weight: bold; letter-spacing: 6pt; color: #0b5394; margin: 6mm 0 2mm; }
  .subtitle { font-size: 14pt; color: #44566b; }
  .name { font-size: 32pt; font-weight: bold; margin: 7mm 0 3mm; border-bottom: .4mm solid #c9a227; padding-bottom: 2mm; max-width: 220mm; }
  .course-intro { font-size: 13pt; color: #44566b; }
  .course-name { font-size: 20pt; font-weight: bold; margin: 3mm 0; max-width: 210mm; }
  .meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 10mm; font-size: 12pt; margin-top: 4mm; color: #2a3b4d; }
  .meta b { color: #0b5394; }
  .footer { position: absolute; bottom: 4mm; left: 10mm; right: 10mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 12mm; }
  .sign-box { text-align: center; font-size: 10pt; color: #44566b; }
  .sign-line { width: 55mm; border-top: .4mm solid #1b2a3a; margin-bottom: 1mm; }
  .verify-box { max-width: 75mm; text-align: center; font-size: 8pt; color: #44566b; word-break: break-all; }
  .cert-number { font-size: 9pt; color: #6b7c8d; letter-spacing: 1pt; }
  @media print { body { background: #fff; } .toolbar { display: none; } .sheet { margin: 0; box-shadow: none; } }
</style>
</head>
<body>
${printable ? `<div class="toolbar"><button onclick="window.print()">${escapeHtml(labels.print)}</button><a href="${escapeHtml(verifyUrl)}">${escapeHtml(labels.verify)}</a></div>` : ''}
<div class="sheet">
  <div class="border"></div>
  <div class="content">
    <div class="issuer">${escapeHtml(cert.issuer || process.env.ISSUER_NAME || 'NIC Research Center')}</div>
    <div class="title">${escapeHtml(labels.title)}</div>
    <div class="subtitle">${escapeHtml(labels.subtitle)}</div>
    <div class="name">${escapeHtml(cert.full_name)}</div>
    <div class="course-intro">${escapeHtml(intro)}</div>
    <div class="course-name">«${escapeHtml(cert.course_name)}»</div>
    <div class="meta">
      ${cert.course_duration_hours ? `<div><b>${escapeHtml(labels.duration)}:</b> ${escapeHtml(cert.course_duration_hours)} ${escapeHtml(labels.hours)}</div>` : ''}
      ${score !== null && !Number.isNaN(score) ? `<div><b>${escapeHtml(labels.score)}:</b> ${escapeHtml(score.toFixed(1))}</div>` : ''}
      <div><b>${escapeHtml(labels.issued)}:</b> ${escapeHtml(issuedDate)}</div>
    </div>
    <div class="footer">
      <div class="sign-box"><div class="sign-line"></div>${escapeHtml(cert.issuer || process.env.ISSUER_NAME || 'NIC Research Center')}</div>
      <div class="cert-number">${escapeHtml(labels.number)}<br />${escapeHtml(cert.certificate_number)}</div>
      <div class="verify-box"><b>${escapeHtml(labels.verify)}</b><br />${escapeHtml(verifyUrl)}</div>
    </div>
  </div>
</div>
</body>
</html>`;
}
