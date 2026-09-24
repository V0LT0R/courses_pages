import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { fileURLToPath } from 'node:url';
import { publicBaseUrl } from './validation.js';

const asset = relative => fileURLToPath(new URL(relative, import.meta.url));
const blue = '#0b5394', gold = '#c9a227', dark = '#172033', gray = '#44566b';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
}

function issuedDate(cert) {
  const date = new Date(cert.issued_at);
  if (Number.isNaN(date.getTime())) throw new Error('Certificate issue date is invalid');
  return date;
}

function verifyUrl(cert) {
  const url = new URL(cert.verify_url || `${publicBaseUrl()}/verify/${encodeURIComponent(cert.certificate_number)}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid certificate verification URL');
  return url.href;
}

function fitText(doc, text, x, y, width, height, maxSize, font = 'Regular', color = dark) {
  doc.font(font).fillColor(color);
  let size = maxSize;
  const options = { width, align: 'center', lineGap: 1 };
  while (size > 6) {
    doc.fontSize(size);
    if (doc.heightOfString(String(text), options) <= height &&
      String(text).split(/\s+/).every(word => doc.widthOfString(word) <= width)) break;
    size -= 0.5;
  }
  doc.fontSize(size).text(String(text), x, y, { ...options, height });
}

export async function generateCertificatePdf(cert) {
  const issued = issuedDate(cert);
  const url = verifyUrl(cert);
  const qr = await QRCode.toBuffer(url, { width: 400, margin: 1, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0,
    info: { Title: cert.certificate_number, Author: cert.issuer || 'AQUAGEO.KZ',
      CreationDate: issued, ModDate: issued, Producer: 'AQUAGEO certificate renderer v3', Creator: 'AQUAGEO.KZ' } });
  doc.registerFont('Regular', asset('../fonts/NotoSerif-Regular.ttf'));
  doc.registerFont('SemiBold', asset('../fonts/NotoSerif-SemiBold.ttf'));
  doc.registerFont('Bold', asset('../fonts/NotoSerif-Bold.ttf'));
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const w = doc.page.width, h = doc.page.height;
  doc.rect(0, 0, w, h).fill('#ffffff');
  doc.lineWidth(2).strokeColor(blue).roundedRect(28, 28, w - 56, h - 56, 12).stroke();
  doc.lineWidth(0.8).strokeColor(gold).roundedRect(40, 40, w - 80, h - 80, 9).stroke();
  fitText(doc, cert.issuer || 'AQUAGEO.KZ', 60, 62, w - 120, 30, 15, 'Regular', blue);
  doc.font('Bold').fontSize(44).fillColor(blue).text('СЕРТИФИКАТ', 45, 106, { width: w - 90, align: 'center', characterSpacing: 4 });
  fitText(doc, 'Настоящий сертификат подтверждает, что', 70, 185, w - 140, 26, 15, 'Regular', gray);
  fitText(doc, cert.full_name, 75, 217, w - 150, 53, 32, 'SemiBold');
  doc.moveTo(180, 277).lineTo(w - 180, 277).lineWidth(1).strokeColor(gold).stroke();
  fitText(doc, 'выдан участнику Научно-практических семинаров и тренингов', 65, 290, w - 130, 23, 12.5, 'Regular', gray);
  fitText(doc, `«${cert.course_name}»`, 65, 313, w - 130, 54, 16, 'SemiBold');
  if (Number.isInteger(cert.academic_hours) && cert.academic_hours > 0) {
    fitText(doc, `Объём программы: ${cert.academic_hours} академических часов`, 70, 374, w - 140, 23, 12.5, 'SemiBold', gray);
  }
  fitText(doc, `${cert.city || 'Астана'}, ${issued.getUTCFullYear()}`, 70, 400, w - 140, 21, 13, 'Regular', gray);
  fitText(doc, `Дата выдачи: ${issued.toLocaleDateString('ru-RU', { timeZone: 'UTC' })}`, 70, 420, w - 140, 20, 12, 'Regular', gray);
  fitText(doc, 'НИЦ «Industry 4.0»', 65, 451, 215, 18, 10, 'SemiBold');
  fitText(doc, 'Astana IT University', 65, 469, 215, 18, 9, 'Regular', gray);
  fitText(doc, 'И.о. директора', 302, 461, 115, 18, 9.5);
  // Existing issuer-provided project asset; this image is not a cryptographic signature.
  doc.image(asset('../assets/signature-kazambayeva.png'), 418, 433, { fit: [105, 70], align: 'center', valign: 'center' });
  fitText(doc, 'И. М. Казамбаева', 530, 461, 137, 20, 10, 'SemiBold');
  doc.image(qr, w - 145, 433, { width: 84, height: 84 });
  doc.link(w - 145, 433, 84, 84, url);
  fitText(doc, 'Номер сертификата', 200, 517, w - 400, 15, 8, 'Regular', '#6b7c8d');
  fitText(doc, cert.certificate_number, 160, 531, w - 320, 18, 8.5, 'Regular', blue);
  if (cert.status === 'revoked') {
    fitText(doc, 'СЕРТИФИКАТ ОТОЗВАН', 150, 164, w - 300, 20, 12, 'Bold', '#ac2020');
  }
  doc.end();
  return done;
}

export function renderCertificateHtml(cert, { printable = true } = {}) {
  const number = escapeHtml(cert.certificate_number);
  const pdf = `/api/certificates/${encodeURIComponent(cert.certificate_number)}/pdf`;
  const date = issuedDate(cert).toLocaleDateString('ru-RU', { timeZone: 'UTC' });
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Сертификат ${number}</title><style>
  body{margin:0;background:#f3f6f9;color:#172033;font-family:Georgia,serif}main{max-width:1120px;margin:24px auto;padding:20px}
  .toolbar{background:white;border:1px solid #dbe3ec;border-radius:12px;padding:20px;margin-bottom:18px}h1{color:#0b5394;font-size:28px}
  a{color:#0b5394}iframe{width:100%;height:78vh;min-height:420px;border:0;background:white}.revoked{color:#ac2020}
  @media(max-width:600px){main{padding:12px;margin:0}h1{font-size:22px}}
  </style></head><body><main><div class="toolbar">
  <strong class="${cert.status === 'revoked' ? 'revoked' : ''}">${cert.status === 'revoked' ? 'Сертификат отозван' : 'Сертификат действителен'}</strong>
  <h1>${escapeHtml(cert.full_name)}</h1><p>${escapeHtml(cert.course_name)}</p>
  ${cert.academic_hours ? `<p>Объём программы: ${escapeHtml(cert.academic_hours)} академических часов</p>` : ''}
  <p>Дата выдачи: ${date} · Номер: ${number}</p>
  <a href="${pdf}">Открыть сертификат / Скачать PDF</a></div>
  ${printable ? `<iframe title="Сертификат PDF" src="${pdf}"></iframe>` : ''}
  </main></body></html>`;
}
