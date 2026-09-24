import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicBaseUrl } from './validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getCertificateMainText(cert) {
  // Новый вариант без названия курса:
  return 'выдано участнику тренинга';

  // Старый вариант с названием курса:
  // Чтобы вернуть его, закомментируйте return выше
  // и раскомментируйте строку ниже.
  // return `«${cert.course_name}»`;
}

function registerCertificateFonts(doc) {
  doc.registerFont(
    'CertRegular',
    path.join(__dirname, 'fonts/DejaVuSerif.ttf')
  );

  doc.registerFont(
    'CertBold',
    path.join(__dirname, 'fonts/DejaVuSerif-Bold.ttf')
  );

  return {
    regular: 'CertRegular',
    bold: 'CertBold',
  };
}

function getCertificateVerifyUrl(cert) {
  return (
    cert.verify_url ||
    `${publicBaseUrl()}/verify/${encodeURIComponent(
      cert.certificate_number
    )}`
  );
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

  const issued = cert.issued_at
    ? new Date(cert.issued_at)
    : new Date();

  const issuedDate = Number.isNaN(issued.getTime())
    ? ''
    : issued.toLocaleDateString('ru-RU', {
        timeZone: 'UTC',
      });

  const labels = {
    ru: {
      title: 'СЕРТИФИКАТ',
      subtitle:
        'выдан участнику Научно-практических семинаров и тренингов',
      completed: 'за успешное прохождение семинара',
      internship: 'успешно прошёл(ла) стажировку',
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

  const score =
    cert.score !== null && cert.score !== undefined
      ? Number(cert.score)
      : null;

  const intro =
    cert.course_type === 'internship'
      ? labels.internship
      : labels.completed;

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    width: 120,
  });

  const qrPng = Buffer.from(
    qrDataUrl.split(',')[1],
    'base64'
  );

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: {
      Title: cert.certificate_number,
      CreationDate: issued,
      ModDate: issued,
      Producer: 'AQUAGEO certificate renderer v2',
      Creator: 'AQUAGEO',
    },
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

  doc
    .rect(0, 0, pageW, pageH)
    .fill('#ffffff');

  doc
    .lineWidth(2)
    .strokeColor('#0b5394')
    .roundedRect(
      28,
      28,
      pageW - 56,
      pageH - 56,
      12
    )
    .stroke();

  doc
    .lineWidth(1)
    .strokeColor('#c9a227')
    .roundedRect(
      40,
      40,
      pageW - 80,
      pageH - 80,
      9
    )
    .stroke();

  const issuer = cert.issuer || 'AQUAGEO.KZ';

  doc
    .fillColor('#0b5394')
    .font(pdfFonts.regular);

  fitText(
    doc,
    String(issuer).toUpperCase(),
    60,
    65,
    pageW - 120,
    40,
    15
  );

  doc
    .font(pdfFonts.bold)
    .fontSize(48)
    .text(labels.title, 0, 120, {
      align: 'center',
      width: pageW,
      characterSpacing: 5,
    });

  doc
    .fillColor('#44566b')
    .font(pdfFonts.regular)
    .fontSize(16)
    .text(labels.subtitle, 0, 183, {
      align: 'center',
      width: pageW,
    });

  doc
    .fillColor('#1b2a3a')
    .font(pdfFonts.bold);

  fitText(
    doc,
    cert.full_name,
    80,
    215,
    pageW - 160,
    65,
    34
  );

  doc
    .moveTo(190, 286)
    .lineTo(pageW - 190, 286)
    .lineWidth(1.2)
    .strokeColor('#c9a227')
    .stroke();

  doc
    .fillColor('#44566b')
    .font(pdfFonts.regular)
    .fontSize(15)
    .text(intro, 0, 298, {
      align: 'center',
      width: pageW,
    });

  doc
    .fillColor('#1b2a3a')
    .font(pdfFonts.bold);

  fitText(
    doc,
    getCertificateMainText(cert),
    90,
    324,
    pageW - 180,
    66,
    22
  );

  const meta = [];

  if (score !== null && !Number.isNaN(score)) {
    meta.push(`${labels.score}: ${score.toFixed(1)}`);
  }

  meta.push(`${labels.issued}: ${issuedDate}`);

  doc
    .fillColor('#2a3b4d')
    .font(pdfFonts.regular)
    .fontSize(13)
    .text(meta.join('     '), 0, 404, {
      align: 'center',
      width: pageW,
    });

  doc
    .strokeColor('#1b2a3a')
    .lineWidth(1)
    .moveTo(86, 506)
    .lineTo(242, 506)
    .stroke();

  doc
    .fillColor('#44566b')
    .fontSize(10)
    .text(issuer, 70, 512, {
      align: 'center',
      width: 190,
    });

  doc
    .fillColor('#6b7c8d')
    .fontSize(9)
    .text(labels.number, 282, 497, {
      align: 'center',
      width: 280,
    });

  fitText(
    doc,
    cert.certificate_number,
    282,
    512,
    280,
    24,
    8
  );

  doc.image(qrPng, pageW - 170, 462, {
    width: 80,
    height: 80,
  });

  doc
    .fillColor('#0b5394')
    .font(pdfFonts.bold)
    .fontSize(8)
    .text(labels.verify, pageW - 205, 540, {
      align: 'center',
      width: 150,
      link: verifyUrl,
      underline: true,
    });

  if (cert.status === 'revoked') {
    doc
      .fillColor('#ac2020')
      .font(pdfFonts.bold)
      .fontSize(16)
      .text(
        'СЕРТИФИКАТ ОТОЗВАН',
        60,
        435,
        {
          width: pageW - 120,
          align: 'center',
        }
      );
  }

  doc.end();

  return done;
}

export function renderCertificateHtml(
  cert,
  { printable = true } = {}
) {
  const labels = {
    ru: {
      title: 'СЕРТИФИКАТ',
      subtitle:
        'выдан участнику Научно-практических семинаров и тренингов',
      completed: 'за успешное прохождение семинара',
      internship: 'успешно прошёл(ла) стажировку',
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

  const issued = cert.issued_at
    ? new Date(cert.issued_at)
    : new Date();

  const issuedDate = Number.isNaN(issued.getTime())
    ? ''
    : issued.toLocaleDateString('ru-RU', {
        timeZone: 'UTC',
      });

  const verifyUrl = getCertificateVerifyUrl(cert);

  const score =
    cert.score !== null && cert.score !== undefined
      ? Number(cert.score)
      : null;

  const intro =
    cert.course_type === 'internship'
      ? labels.internship
      : labels.completed;

  return `<!doctype html>
<html lang="${escapeHtml(cert.language || 'ru')}">
<head>
<meta charset="utf-8" />
<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
/>
<title>${escapeHtml(
    cert.certificate_number
  )} — certificate</title>

<style>
  @page {
    size: A4 landscape;
    margin: 0;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #eef3f8;
    color: #1b2a3a;
    font-family: 'Times New Roman', Georgia, serif;
  }

  .toolbar {
    padding: 16px;
    text-align: center;
    font-family: Arial, sans-serif;
  }

  .toolbar button,
  .toolbar a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 999px;
    padding: 11px 18px;
    background: #0b5394;
    color: #ffffff;
    text-decoration: none;
    cursor: pointer;
    font-weight: 700;
    margin: 4px;
  }

  .sheet {
    width: 297mm;
    min-height: 210mm;
    margin: 18px auto;
    padding: 14mm 18mm;
    position: relative;
    background: #ffffff;
    box-shadow: 0 18px 50px rgba(10, 27, 55, 0.14);
  }

  .border {
    position: absolute;
    inset: 7mm;
    border: 2px solid #0b5394;
    border-radius: 4mm;
  }

  .border::after {
    content: '';
    position: absolute;
    inset: 2.5mm;
    border: 0.5mm solid #c9a227;
    border-radius: 3mm;
  }

  .content {
    position: relative;
    height: 182mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 6mm 10mm;
  }

  .issuer {
    font-size: 13pt;
    letter-spacing: 0.5pt;
    color: #0b5394;
    text-transform: uppercase;
    margin-top: 2mm;
  }

  .title {
    font-size: 40pt;
    font-weight: bold;
    letter-spacing: 6pt;
    color: #0b5394;
    margin: 6mm 0 2mm;
  }

  .subtitle {
    font-size: 14pt;
    color: #44566b;
  }

  .name {
    overflow-wrap: anywhere;
    font-size: 26pt;
    font-weight: bold;
    margin: 7mm 0 3mm;
    border-bottom: 0.4mm solid #c9a227;
    padding-bottom: 2mm;
    max-width: 220mm;
  }

  .course-intro {
    font-size: 13pt;
    color: #44566b;
  }

  .course-name {
    overflow-wrap: anywhere;
    font-size: 17pt;
    font-weight: bold;
    margin: 3mm 0;
    max-width: 210mm;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10mm;
    font-size: 12pt;
    margin-top: 4mm;
    color: #2a3b4d;
  }

  .meta b {
    color: #0b5394;
  }

  .footer {
    position: absolute;
    bottom: 4mm;
    left: 10mm;
    right: 10mm;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12mm;
  }

  .sign-box {
    text-align: center;
    font-size: 10pt;
    color: #44566b;
  }

  .sign-line {
    width: 55mm;
    border-top: 0.4mm solid #1b2a3a;
    margin-bottom: 1mm;
  }

  .verify-box {
    max-width: 75mm;
    text-align: center;
    font-size: 8pt;
    color: #44566b;
    word-break: break-all;
  }

  .cert-number {
    font-size: 9pt;
    color: #6b7c8d;
    letter-spacing: 1pt;
  }

  @media print {
    body {
      background: #ffffff;
    }

    .toolbar {
      display: none;
    }

    .sheet {
      margin: 0;
      box-shadow: none;
    }
  }
</style>
</head>

<body>
${
  printable
    ? `<div class="toolbar">
        <strong>${
          cert.status === 'revoked'
            ? 'Сертификат отозван'
            : 'Сертификат действителен'
        }</strong>
        <br>
        <a href="/api/certificates/${escapeHtml(
          cert.certificate_number
        )}/pdf">
          Открыть сертификат / Скачать PDF
        </a>
      </div>`
    : ''
}

<div class="sheet">
  <div class="border"></div>

  <div class="content">
    <div class="issuer">
      ${escapeHtml(
        cert.issuer ||
          process.env.ISSUER_NAME ||
          'NIC Research Center'
      )}
    </div>

    <div class="title">
      ${escapeHtml(labels.title)}
    </div>

    <div class="subtitle">
      ${escapeHtml(labels.subtitle)}
    </div>

    <div class="name">
      ${escapeHtml(cert.full_name)}
    </div>

    <div class="course-intro">
      ${escapeHtml(intro)}
    </div>

    <div class="course-name">
      ${escapeHtml(getCertificateMainText(cert))}
    </div>

    <div class="meta">
      ${
        score !== null && !Number.isNaN(score)
          ? `<div>
              <b>${escapeHtml(labels.score)}:</b>
              ${escapeHtml(score.toFixed(1))}
            </div>`
          : ''
      }

      <div>
        <b>${escapeHtml(labels.issued)}:</b>
        ${escapeHtml(issuedDate)}
      </div>
    </div>

    <div class="footer">
      <div class="sign-box">
        <div class="sign-line"></div>

        ${escapeHtml(
          cert.issuer ||
            process.env.ISSUER_NAME ||
            'NIC Research Center'
        )}
      </div>

      <div class="cert-number">
        ${escapeHtml(labels.number)}
        <br>
        ${escapeHtml(cert.certificate_number)}
      </div>

      <div class="verify-box">
        <b>${escapeHtml(labels.verify)}</b>
        <br>
        ${escapeHtml(verifyUrl)}
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

function fitText(
  doc,
  text,
  x,
  y,
  width,
  height,
  maxSize
) {
  let size = maxSize;

  while (size > 10) {
    doc.fontSize(size);

    if (
      doc.heightOfString(String(text), {
        width,
        align: 'center',
      }) <= height
    ) {
      break;
    }

    size -= 0.5;
  }

  doc.fontSize(size).text(
    String(text),
    x,
    y,
    {
      width,
      height,
      align: 'center',
    }
  );
}