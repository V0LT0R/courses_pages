import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { finished } from "node:stream/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEBSITE_URL = "https://aquageo.kz/";

const OUTPUT_DIRECTORY = path.join(
  __dirname,
  "generated-certificates"
);

const REGISTRY_PATH = path.join(
  OUTPUT_DIRECTORY,
  "certificates_registry.csv"
);

const SIGNATURE_PATH = path.join(
  __dirname,
  "assets",
  "signature-kazambayeva.png"
);

const DISPLAY_DATE = "15.09.2026";
const DATABASE_DATE = "2026-09-15";
const CERTIFICATE_DATE_PART = "20260915";
const ACADEMIC_HOURS = 18;

function findCertificateFonts() {
  const variants = [
    {
      regular: path.join(
        __dirname,
        "fonts",
        "NotoSerif-Regular.ttf"
      ),
      semiBold: path.join(
        __dirname,
        "fonts",
        "NotoSerif-SemiBold.ttf"
      ),
      bold: path.join(
        __dirname,
        "fonts",
        "NotoSerif-Bold.ttf"
      ),
    },
    {
      regular: path.join(
        __dirname,
        "server",
        "fonts",
        "DejaVuSerif.ttf"
      ),
      semiBold: path.join(
        __dirname,
        "server",
        "fonts",
        "DejaVuSerif-Bold.ttf"
      ),
      bold: path.join(
        __dirname,
        "server",
        "fonts",
        "DejaVuSerif-Bold.ttf"
      ),
    },
  ];

  const selected = variants.find(
    (variant) =>
      fs.existsSync(variant.regular) &&
      fs.existsSync(variant.semiBold) &&
      fs.existsSync(variant.bold)
  );

  if (!selected) {
    throw new Error(
      "Не найдены шрифты Noto Serif или DejaVu Serif."
    );
  }

  return selected;
}

function cleanName(value, fieldName) {
  const cleaned = String(value || "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    throw new Error(
      `Не заполнено поле «${fieldName}».`
    );
  }

  if (cleaned.length > 100) {
    throw new Error(
      `Поле «${fieldName}» слишком длинное.`
    );
  }

  // eslint-disable-next-line no-control-regex -- reject control characters in names
  if (/[\x00-\x1F<>]/.test(cleaned)) {
    throw new Error(
      `Поле «${fieldName}» содержит недопустимые символы.`
    );
  }

  return cleaned;
}

function createSafeFileName(fullName) {
  const safeName = fullName
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- sanitize filesystem names
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!safeName) {
    throw new Error(
      "Не удалось сформировать название PDF."
    );
  }

  return safeName;
}

function ensureRequiredFiles() {
  fs.mkdirSync(OUTPUT_DIRECTORY, {
    recursive: true,
  });

  if (!fs.existsSync(SIGNATURE_PATH)) {
    throw new Error(
      `Не найдена официальная подпись: ${SIGNATURE_PATH}`
    );
  }
}

function certificateNumberExists(number) {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return false;
  }

  return fs
    .readFileSync(REGISTRY_PATH, "utf8")
    .includes(`"${number}"`);
}

function createCertificateNumber() {
  let number;

  do {
    const randomPart = crypto
      .randomBytes(6)
      .toString("hex")
      .toUpperCase();

    number =
      `AQ-${CERTIFICATE_DATE_PART}-${randomPart}`;
  } while (certificateNumberExists(number));

  return number;
}

function csvValue(value) {
  return `"${String(value ?? "")
    .replace(/"/g, '""')}"`;
}

function initializeRegistry() {
  if (
    fs.existsSync(REGISTRY_PATH) &&
    fs.statSync(REGISTRY_PATH).size > 0
  ) {
    return;
  }

  const headers = [
    "certificate_number",
    "last_name",
    "first_name",
    "full_name",
    "academic_hours",
    "issued_at",
    "pdf_file",
    "qr_url",
    "pdf_sha256",
  ];

  fs.writeFileSync(
    REGISTRY_PATH,
    `\uFEFF${headers.join(",")}\r\n`,
    "utf8"
  );
}

function appendToRegistry(record) {
  initializeRegistry();

  const row = [
    record.certificateNumber,
    record.lastName,
    record.firstName,
    record.fullName,
    record.academicHours,
    record.issuedAt,
    record.pdfFile,
    record.qrUrl,
    record.pdfSha256,
  ]
    .map(csvValue)
    .join(",");

  fs.appendFileSync(
    REGISTRY_PATH,
    `${row}\r\n`,
    "utf8"
  );
}

function fitText(
  doc,
  text,
  {
    x,
    y,
    width,
    height,
    maxSize,
    minSize,
    font,
    color,
  }
) {
  let size = maxSize;

  doc.font(font);

  while (size > minSize) {
    doc.fontSize(size);

    const textHeight = doc.heightOfString(
      text,
      {
        width,
        align: "center",
      }
    );

    if (textHeight <= height) {
      break;
    }

    size -= 0.5;
  }

  doc
    .fillColor(color)
    .font(font)
    .fontSize(size)
    .text(
      text,
      x,
      y,
      {
        width,
        height,
        align: "center",
        lineGap: 2,
      }
    );
}

async function generateCertificate({
  lastName,
  firstName,
}) {
  ensureRequiredFiles();

  const fonts = findCertificateFonts();

  const normalizedLastName = cleanName(
    lastName,
    "Фамилия"
  );

  const normalizedFirstName = cleanName(
    firstName,
    "Имя и отчество"
  );

  const fullName =
    `${normalizedLastName} ${normalizedFirstName}`;

  const certificateNumber =
    createCertificateNumber();

  // Название PDF — ФИО получателя
  const pdfFileName =
    `${createSafeFileName(fullName)}.pdf`;

  const pdfPath = path.join(
    OUTPUT_DIRECTORY,
    pdfFileName
  );

  if (fs.existsSync(pdfPath)) {
    throw new Error(
      `Сертификат «${pdfFileName}» уже существует.`
    );
  }

  const qrDataUrl = await QRCode.toDataURL(
    WEBSITE_URL,
    {
      width: 400,
      margin: 1,
      errorCorrectionLevel: "H",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    }
  );

  const qrBuffer = Buffer.from(
    qrDataUrl.split(",")[1],
    "base64"
  );

  const documentDate =
    new Date("2026-09-15T00:00:00+05:00");

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    info: {
      Title: `Сертификат ${fullName}`,
      Author: "НИЦ Industry 4.0, Astana IT University",
      Subject: certificateNumber,
      Creator: "AQUAGEO.KZ",
      CreationDate: documentDate,
      ModDate: documentDate,
    },
  });

  const fileStream =
    fs.createWriteStream(pdfPath);

  doc.pipe(fileStream);

  doc.registerFont(
    "CertificateRegular",
    fonts.regular
  );

  doc.registerFont(
    "CertificateSemiBold",
    fonts.semiBold
  );

  doc.registerFont(
    "CertificateBold",
    fonts.bold
  );

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  const blue = "#0b5394";
  const gold = "#c9a227";
  const dark = "#172033";
  const gray = "#44566b";

  // Белый фон
  doc
    .rect(0, 0, pageWidth, pageHeight)
    .fill("#ffffff");

  // Внешняя синяя рамка
  doc
    .lineWidth(2)
    .strokeColor(blue)
    .roundedRect(
      28,
      28,
      pageWidth - 56,
      pageHeight - 56,
      12
    )
    .stroke();

  // Внутренняя золотая рамка
  doc
    .lineWidth(1)
    .strokeColor(gold)
    .roundedRect(
      40,
      40,
      pageWidth - 80,
      pageHeight - 80,
      9
    )
    .stroke();

  // AQUAGEO.KZ
  doc
    .fillColor(blue)
    .font("CertificateRegular")
    .fontSize(15)
    .text(
      "AQUAGEO.KZ",
      60,
      62,
      {
        width: pageWidth - 120,
        align: "center",
      }
    );

  // Заголовок
  doc
    .fillColor(blue)
    .font("CertificateBold")
    .fontSize(46)
    .text(
      "СЕРТИФИКАТ",
      0,
      105,
      {
        width: pageWidth,
        align: "center",
        characterSpacing: 4,
      }
    );

  // Основной текст
  doc
    .fillColor(gray)
    .font("CertificateRegular")
    .fontSize(15)
    .text(
      "Настоящий сертификат подтверждает, что",
      70,
      185,
      {
        width: pageWidth - 140,
        align: "center",
      }
    );

  // ФИО получателя
  fitText(
    doc,
    fullName,
    {
      x: 75,
      y: 217,
      width: pageWidth - 150,
      height: 55,
      maxSize: 32,
      minSize: 18,
      font: "CertificateSemiBold",
      color: dark,
    }
  );

  // Золотая линия под ФИО
  doc
    .moveTo(180, 277)
    .lineTo(pageWidth - 180, 277)
    .lineWidth(1.1)
    .strokeColor(gold)
    .stroke();

  // Назначение сертификата
  doc
    .fillColor(gray)
    .font("CertificateRegular")
    .fontSize(12.5)
    .text(
      "выдан участнику Научно-практических семинаров и тренингов",
      80,
      290,
      {
        width: pageWidth - 140,
        align: "center",
      }
    );

  // Название семинара
  fitText(
  doc,
  "«Эффективное использование трансграничных водных ресурсов с применением современных информационных технологий»",
  {
    x: 75,
    y: 311,
    width: pageWidth - 150,
    height: 50,
    maxSize: 16,
    minSize: 13,
    font: "CertificateSemiBold",
    color: dark,
  }
);

  // Количество часов
  doc
    .fillColor(gray)
    .font("CertificateSemiBold")
    .fontSize(12.5)
    .text(
      `Объём программы: ${ACADEMIC_HOURS} академических часов`,
      0,
      374,
      {
        width: pageWidth,
        align: "center",
      }
    );

  // Город и год
  doc
    .fillColor(gray)
    .font("CertificateRegular")
    .fontSize(13)
    .text(
      "Астана, 2026",
      0,
      400,
      {
        width: pageWidth,
        align: "center",
      }
    );

  // Дата выдачи
  doc
    .fillColor(gray)
    .font("CertificateRegular")
    .fontSize(12)
    .text(
      `Дата выдачи: ${DISPLAY_DATE}`,
      0,
      420,
      {
        width: pageWidth,
        align: "center",
      }
    );

  // Организация
  doc
    .fillColor(dark)
    .font("CertificateSemiBold")
    .fontSize(10)
    .text(
      "НИЦ «Industry 4.0»",
      65,
      451,
      {
        width: 215,
        align: "center",
      }
    );

  doc
    .fillColor(gray)
    .font("CertificateRegular")
    .fontSize(9)
    .text(
      "Astana IT University",
      65,
      469,
      {
        width: 215,
        align: "center",
      }
    );

  // Должность
  doc
    .fillColor(dark)
    .font("CertificateRegular")
    .fontSize(9.5)
    .text(
      "И.о. директора",
      290,
      461,
      {
        width: 120,
        align: "right",
      }
    );

  // Электронная подпись
  doc.image(
    SIGNATURE_PATH,
    418,
    433,
    {
      fit: [115, 70],
      align: "center",
      valign: "center",
    }
  );

  // ФИО подписанта
  doc
    .fillColor(dark)
    .font("CertificateSemiBold")
    .fontSize(10)
    .text(
      "И. М. Казамбаева",
      530,
      461,
      {
        width: 145,
        align: "left",
      }
    );

  // QR-код
  const qrSize = 84;
  const qrX = pageWidth - 145;
  const qrY = 433;

  doc.image(
    qrBuffer,
    qrX,
    qrY,
    {
      width: qrSize,
      height: qrSize,
    }
  );

  doc.link(
    qrX,
    qrY,
    qrSize,
    qrSize,
    WEBSITE_URL
  );

  // Номер сертификата
  doc
    .fillColor("#6b7c8d")
    .font("CertificateRegular")
    .fontSize(8)
    .text(
      "Номер сертификата",
      280,
      517,
      {
        width: 280,
        align: "center",
      }
    );

  doc
    .fillColor(blue)
    .font("CertificateRegular")
    .fontSize(8.5)
    .text(
      certificateNumber,
      280,
      531,
      {
        width: 280,
        align: "center",
      }
    );

  doc.end();

  await finished(fileStream);

  const pdfSha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(pdfPath))
    .digest("hex");

  appendToRegistry({
    certificateNumber,
    lastName: normalizedLastName,
    firstName: normalizedFirstName,
    fullName,
    academicHours: ACADEMIC_HOURS,
    issuedAt: DATABASE_DATE,
    pdfFile: pdfFileName,
    qrUrl: WEBSITE_URL,
    pdfSha256,
  });

  return {
    pdfPath,
    certificateNumber,
    registryPath: REGISTRY_PATH,
  };
}

async function main() {
  let readline;

  try {
    console.log(
      "\nГенератор сертификатов AQUAGEO.KZ\n"
    );

    const argumentsFromTerminal =
      process.argv.slice(2);

    let lastName;
    let firstName;

    // Пакетный режим
    if (argumentsFromTerminal.length >= 2) {
      lastName = argumentsFromTerminal[0];

      firstName = argumentsFromTerminal
        .slice(1)
        .join(" ");
    } else {
      // Ручной режим
      readline = createInterface({
        input,
        output,
      });

      lastName = await readline.question(
        "Введите фамилию: "
      );

      firstName = await readline.question(
        "Введите имя и отчество: "
      );
    }

    const result = await generateCertificate({
      lastName,
      firstName,
    });

    console.log("\nСертификат создан.");
    console.log(
      `Номер: ${result.certificateNumber}`
    );
    console.log(
      `PDF: ${result.pdfPath}`
    );
    console.log(
      `Реестр: ${result.registryPath}`
    );
  } catch (error) {
    console.error(
      "\nОшибка:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    if (readline) {
      readline.close();
    }
  }
}

main();