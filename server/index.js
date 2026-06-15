import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './db.js';
import { requireAuth, requireAdmin, signToken } from './auth.js';
import {
  buildMockAnchor,
  buildUnsignedCredential,
  canonicalize,
  escapeHtml,
  generateCertificatePdf,
  makeCertificateNumber,
  normalizeIssuePayload,
  renderCertificateHtml,
  sha256Hex0x,
  signCredential,
  toIsoZ,
  verifySignedCredential,
} from './certificateService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4000);
const MAX_PDF_UPLOAD_SIZE = Number(process.env.MAX_PDF_UPLOAD_MB || 25) * 1024 * 1024;
const uploadsRoot = path.join(__dirname, 'uploads');
const pdfUploadsDir = path.join(uploadsRoot, 'pdfs');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadsRoot));

function mapSeminar(row) {
  return {
    id: row.slug,
    numericId: row.id,
    title: row.title,
    category: row.category,
    date: row.date_text,
    duration: row.duration,
    format: row.format,
    location: row.location,
    image: row.image_url,
    shortDescription: row.short_description,
    description: row.description,
    outcomes: row.outcomes || [],
    lecturer: {
      name: row.lecturer_name,
      role: row.lecturer_role,
      bio: row.lecturer_bio,
      photo: row.lecturer_photo,
    },
    certificate: row.certificate,
    rating: Number(row.rating),
    pdf: row.pdf_url,
    author: {
      id: row.author_id,
      name: row.author_name,
      email: row.author_email,
      role: row.author_role,
    },
    canEdit: row.can_edit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}


function sanitizeFileName(value) {
  const ext = path.extname(value || '').toLowerCase();
  const base = path
    .basename(value || 'seminar-material', ext)
    .replace(/[^a-z0-9а-яё_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'seminar-material';

  return `${Date.now()}-${base}${ext || '.pdf'}`;
}

function readRequestBuffer(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let finished = false;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        finished = true;
        const error = new Error(`PDF файл слишком большой. Максимальный размер: ${Math.round(limitBytes / 1024 / 1024)} MB.`);
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!finished) resolve(Buffer.concat(chunks));
    });

    req.on('error', (error) => {
      if (!finished) reject(error);
    });
  });
}

function parseMultipartPdf(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from('\r\n\r\n');
  let cursor = 0;

  while (cursor < buffer.length) {
    const boundaryStart = buffer.indexOf(boundaryBuffer, cursor);
    if (boundaryStart === -1) break;

    let partStart = boundaryStart + boundaryBuffer.length;
    if (buffer.slice(partStart, partStart + 2).toString() === '--') break;
    if (buffer.slice(partStart, partStart + 2).toString() === '\r\n') partStart += 2;

    const headerEnd = buffer.indexOf(headerSeparator, partStart);
    if (headerEnd === -1) break;

    const headerText = buffer.slice(partStart, headerEnd).toString('utf8');
    const contentStart = headerEnd + headerSeparator.length;
    const nextBoundary = buffer.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart);
    const contentEnd = nextBoundary === -1 ? buffer.length : nextBoundary;
    const content = buffer.slice(contentStart, contentEnd);

    const disposition = headerText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || '';
    const fieldName = disposition.match(/name="([^"]+)"/i)?.[1];
    const fileName = disposition.match(/filename="([^"]*)"/i)?.[1];
    const mimeType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || '';

    if (fieldName === 'pdf' && fileName) {
      return { fileName, mimeType, data: content };
    }

    cursor = contentEnd + 2;
  }

  return null;
}

async function ensureSchema() {
  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
}


app.post('/api/uploads/pdf', requireAuth, async (req, res, next) => {
  try {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];

    if (!contentType.includes('multipart/form-data') || !boundary) {
      return res.status(400).json({ message: 'Отправьте PDF как multipart/form-data с полем pdf.' });
    }

    const bodyBuffer = await readRequestBuffer(req, MAX_PDF_UPLOAD_SIZE);
    const file = parseMultipartPdf(bodyBuffer, boundary);

    if (!file || !file.data?.length) {
      return res.status(400).json({ message: 'PDF файл не найден.' });
    }

    const extension = path.extname(file.fileName).toLowerCase();
    const hasPdfHeader = file.data.slice(0, 5).toString('utf8') === '%PDF-';
    const looksLikePdf = extension === '.pdf' || file.mimeType === 'application/pdf' || hasPdfHeader;

    if (!looksLikePdf) {
      return res.status(400).json({ message: 'Можно загружать только PDF файлы.' });
    }

    await fs.mkdir(pdfUploadsDir, { recursive: true });
    const originalNameWithExt = path.extname(file.fileName).toLowerCase() === '.pdf' ? file.fileName : `${file.fileName}.pdf`;
    const storedName = sanitizeFileName(originalNameWithExt);
    const storedPath = path.join(pdfUploadsDir, storedName);
    await fs.writeFile(storedPath, file.data);

    res.status(201).json({
      url: `/uploads/pdfs/${storedName}`,
      fileName: storedName,
      originalName: file.fileName,
      size: file.data.length,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});



function appBaseUrl(req) {
  const configured = process.env.CERT_BASE_URL || process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.get('host')}`.replace(/\/$/, '');
}

function certificateRowToResponse(row, req) {
  const baseUrl = appBaseUrl(req);
  return {
    certificate_number: row.certificate_number,
    verify_url: `${baseUrl}/verify/${encodeURIComponent(row.certificate_number)}`,
    verification_url: `${baseUrl}/verify/${encodeURIComponent(row.certificate_number)}`,
    pdf_url: `${baseUrl}/api/certificates/${encodeURIComponent(row.certificate_number)}/pdf`,
    certificate_url: `${baseUrl}/api/certificates/${encodeURIComponent(row.certificate_number)}/pdf`,
    json_url: `${baseUrl}/api/certificates/${encodeURIComponent(row.certificate_number)}/json`,
    tx_hash: row.tx_hash,
    issued_at: row.issued_at,
    status: row.status,
    data_hash: row.data_hash,
  };
}

async function findCertificate(number) {
  const result = await query('SELECT * FROM local_certificate_records WHERE certificate_number = $1', [number]);
  return result.rows[0] || null;
}

app.post('/api/certificates/generate', async (req, res, next) => {
  try {
    const payload = normalizeIssuePayload(req.body || {});
    if (!payload.fullName) {
      return res.status(400).json({ message: 'Не указано ФИО для сертификата.' });
    }
    if (!payload.courseName) {
      return res.status(400).json({ message: 'Не указано название курса для сертификата.' });
    }

    const duplicate = await query(
      'SELECT * FROM local_certificate_records WHERE external_user_id = $1 AND course_id = $2',
      [payload.externalUserId, payload.courseId]
    );
    if (duplicate.rowCount) {
      return res.status(200).json({ ok: true, reused: true, request: payload, ...certificateRowToResponse(duplicate.rows[0], req) });
    }

    const credentialUuid = crypto.randomUUID();
    const issuedAt = new Date();
    let certificateNumber = makeCertificateNumber();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await query('SELECT 1 FROM local_certificate_records WHERE certificate_number = $1', [certificateNumber]);
      if (!exists.rowCount) break;
      certificateNumber = makeCertificateNumber();
    }

    const unsignedCredential = buildUnsignedCredential({
      credentialUuid,
      certificateNumber,
      externalUserId: payload.externalUserId,
      fullName: payload.fullName,
      courseId: payload.courseId,
      courseName: payload.courseName,
      courseType: payload.courseType,
      completedAt: payload.completedAt,
      issuedAt,
      score: payload.score,
      durationHours: payload.durationHours,
    });
    const signedCredential = signCredential(unsignedCredential, issuedAt);
    const signedJson = canonicalize(signedCredential);
    const dataHash = sha256Hex0x(Buffer.from(signedJson, 'utf8'));
    const anchor = buildMockAnchor(dataHash);

    const insert = await query(
      `INSERT INTO local_certificate_records (
        id, certificate_number, external_user_id, full_name, course_id, course_name,
        course_type, course_duration_hours, score, completed_at, issued_at, issuer,
        language, signed_json, data_hash, tx_hash, block_number, contract_address, chain, status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20
      )
      ON CONFLICT (external_user_id, course_id) DO UPDATE SET
        full_name = EXCLUDED.full_name
      RETURNING *`,
      [
        credentialUuid,
        certificateNumber,
        payload.externalUserId,
        payload.fullName,
        payload.courseId,
        payload.courseName,
        payload.courseType,
        payload.durationHours === null || payload.durationHours === '' ? null : Number(payload.durationHours),
        payload.score === null || payload.score === '' ? null : Number(payload.score),
        toIsoZ(payload.completedAt),
        toIsoZ(issuedAt),
        process.env.ISSUER_NAME || 'NIC Research Center',
        payload.language,
        signedJson,
        dataHash,
        anchor.txHash,
        anchor.blockNumber,
        anchor.contractAddress,
        anchor.chain,
        'active',
      ]
    );

    res.status(201).json({ ok: true, request: payload, ...certificateRowToResponse(insert.rows[0], req) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/certificates/:number/json', async (req, res, next) => {
  try {
    const cert = await findCertificate(req.params.number);
    if (!cert) return res.status(404).json({ message: 'Сертификат не найден.' });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cert.certificate_number}.json"`);
    res.send(cert.signed_json);
  } catch (error) {
    next(error);
  }
});

app.get('/api/certificates/:number/pdf', async (req, res, next) => {
  try {
    const cert = await findCertificate(req.params.number);
    if (!cert) return res.status(404).send('Сертификат не найден.');
    const pdfBytes = await generateCertificatePdf({
      ...cert,
      verify_url: `${appBaseUrl(req)}/verify/${encodeURIComponent(cert.certificate_number)}`,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cert.certificate_number}.pdf"`);
    res.send(pdfBytes);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/verify/:number', async (req, res, next) => {
  try {
    const cert = await findCertificate(req.params.number);
    if (!cert) {
      return res.json({ valid: false, status: 'not_found', certificate_number: req.params.number, reason: 'Certificate not found' });
    }
    const parsed = JSON.parse(cert.signed_json);
    const signatureValid = verifySignedCredential(parsed);
    res.json({
      valid: cert.status === 'active' && signatureValid,
      status: cert.status,
      certificate_number: cert.certificate_number,
      full_name: cert.full_name,
      course_name: cert.course_name,
      course_type: cert.course_type,
      issued_at: cert.issued_at,
      issuer: cert.issuer,
      signature_valid: signatureValid,
      blockchain: {
        anchored: Boolean(cert.tx_hash),
        chain: cert.chain,
        tx_hash: cert.tx_hash,
        block_number: cert.block_number,
        revoked: cert.status === 'revoked',
      },
      reason: signatureValid ? null : 'invalid_signature',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/verify/manual', async (req, res, next) => {
  try {
    const number = req.body?.certificate_number || req.body?.certificateNumber;
    const cert = number ? await findCertificate(number) : null;
    if (!cert) {
      return res.status(404).json({ valid: false, status: 'not_found', certificate_number: number || null, reason: 'Certificate not found' });
    }
    const fullName = String(req.body?.full_name || req.body?.fullName || '').trim().toLowerCase();
    const courseName = String(req.body?.course_name || req.body?.courseName || '').trim().toLowerCase();
    const mismatch = (fullName && fullName !== cert.full_name.toLowerCase()) || (courseName && courseName !== cert.course_name.toLowerCase());
    res.json({
      valid: cert.status === 'active' && !mismatch,
      status: mismatch ? 'data_mismatch' : cert.status,
      certificate_number: cert.certificate_number,
      full_name: cert.full_name,
      course_name: cert.course_name,
      course_type: cert.course_type,
      issued_at: cert.issued_at,
      issuer: cert.issuer,
      reason: mismatch ? 'Provided name or course does not match certificate data' : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/issuer.json', (_req, res) => {
  const baseUrl = (process.env.CERT_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
  res.json({
    '@context': ['https://w3id.org/openbadges/v2'],
    id: process.env.ISSUER_PROFILE_URL || `${baseUrl}/issuer.json`,
    type: 'Profile',
    name: process.env.ISSUER_NAME || 'NIC Research Center',
    url: process.env.ISSUER_URL || 'https://nic.kz',
    publicKey: [{
      id: process.env.ISSUER_KEY_ID || `${baseUrl}/issuer.json#key-1`,
      type: 'Ed25519VerificationKey2020',
      controller: process.env.ISSUER_PROFILE_URL || `${baseUrl}/issuer.json`,
      publicKeyBase64: process.env.ED25519_PUBLIC_KEY || 'LxuZubFprzfA7P/HJH0ljfQRXoi5WwH7jNm2MTgC9X0=',
    }],
  });
});

app.get('/verify/:number', async (req, res, next) => {
  try {
    const cert = await findCertificate(req.params.number);
    if (!cert) {
      return res.status(404).send(`<!doctype html><html><head><meta charset="utf-8"><title>Certificate not found</title></head><body style="font-family:Arial;padding:40px"><h1>Сертификат не найден</h1><p>${escapeHtml(req.params.number)}</p></body></html>`);
    }
    const html = renderCertificateHtml({ ...cert, verify_url: `${appBaseUrl(req)}/verify/${encodeURIComponent(cert.certificate_number)}` });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Укажите email и пароль.' });
  }

  const result = await query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ message: 'Неверный email или пароль.' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ message: 'Неверный email или пароль.' });
  }

  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = signToken(safeUser);
  res.json({ token, user: safeUser });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const result = await query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
  const user = result.rows[0];
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден.' });
  }
  res.json(user);
});

app.get('/api/users', requireAuth, requireAdmin, async (_req, res) => {
  const result = await query(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(result.rows);
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'Заполните имя, email, пароль и роль.' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Недопустимая роль.' });
  }

  const exists = await query('SELECT id FROM users WHERE email = $1', [String(email).toLowerCase()]);
  if (exists.rowCount) {
    return res.status(409).json({ message: 'Пользователь с таким email уже существует.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, String(email).toLowerCase(), passwordHash, role]
  );
  res.status(201).json(result.rows[0]);
});

app.get('/api/seminars', async (req, res) => {
  const authHeader = req.headers.authorization;
  let userId = null;
  let userRole = null;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      userId = payload.id;
      userRole = payload.role;
    } catch {}
  }

  const result = await query(
    `SELECT s.*, u.id AS author_id, u.name AS author_name, u.email AS author_email, u.role AS author_role,
      CASE
        WHEN $1::bigint IS NULL THEN FALSE
        WHEN $2::text = 'admin' THEN TRUE
        WHEN s.created_by = $1::bigint THEN TRUE
        ELSE FALSE
      END AS can_edit
    FROM seminars s
    JOIN users u ON u.id = s.created_by
    ORDER BY s.created_at DESC`,
    [userId, userRole]
  );

  res.json(result.rows.map(mapSeminar));
});

app.get('/api/seminars/:slug', async (req, res) => {
  const { slug } = req.params;
  const result = await query(
    `SELECT s.*, u.id AS author_id, u.name AS author_name, u.email AS author_email, u.role AS author_role,
            FALSE AS can_edit
     FROM seminars s
     JOIN users u ON u.id = s.created_by
     WHERE s.slug = $1`,
    [slug]
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: 'Семинар не найден.' });
  }

  res.json(mapSeminar(result.rows[0]));
});

app.post('/api/seminars', requireAuth, async (req, res) => {
  const body = req.body || {};
  const slug = normalizeSlug(body.slug || body.title);
  if (!slug) {
    return res.status(400).json({ message: 'Укажите название семинара.' });
  }

  const requiredFields = [
    'title', 'category', 'date', 'duration', 'format', 'location', 'image',
    'shortDescription', 'description'
  ];

  for (const field of requiredFields) {
    if (!body[field]) {
      return res.status(400).json({ message: `Поле ${field} обязательно.` });
    }
  }

  const exists = await query('SELECT id FROM seminars WHERE slug = $1', [slug]);
  if (exists.rowCount) {
    return res.status(409).json({ message: 'Семинар с таким slug уже существует.' });
  }

  const outcomes = Array.isArray(body.outcomes)
    ? body.outcomes.filter(Boolean)
    : String(body.outcomes || '').split('\n').map((item) => item.trim()).filter(Boolean);

  const result = await query(
    `INSERT INTO seminars (
      slug, title, category, date_text, duration, format, location,
      image_url, short_description, description, outcomes,
      lecturer_name, lecturer_role, lecturer_bio, lecturer_photo,
      certificate, rating, pdf_url, created_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,
      $12,$13,$14,$15,
      $16,$17,$18,$19
    ) RETURNING slug`,
    [
      slug,
      body.title,
      body.category,
      body.date,
      body.duration,
      body.format,
      body.location,
      body.image,
      body.shortDescription,
      body.description,
      outcomes,
      body.lecturer?.name || 'Лектор не указан',
      body.lecturer?.role || 'Спикер',
      body.lecturer?.bio || 'Информация появится позже.',
      body.lecturer?.photo || body.image,
      Boolean(body.certificate),
      Number(body.rating || 5),
      body.pdf || null,
      req.user.id,
    ]
  );

  res.status(201).json({ slug: result.rows[0].slug });
});

app.put('/api/seminars/:slug', requireAuth, async (req, res) => {
  const current = await query('SELECT * FROM seminars WHERE slug = $1', [req.params.slug]);
  if (!current.rowCount) {
    return res.status(404).json({ message: 'Семинар не найден.' });
  }

  const seminar = current.rows[0];
  const canEdit = req.user.role === 'admin' || seminar.created_by === req.user.id;
  if (!canEdit) {
    return res.status(403).json({ message: 'Можно редактировать только свои семинары.' });
  }

  const body = req.body || {};
  const outcomes = Array.isArray(body.outcomes)
    ? body.outcomes.filter(Boolean)
    : String(body.outcomes || '').split('\n').map((item) => item.trim()).filter(Boolean);

  const nextSlug = normalizeSlug(body.slug || body.title || seminar.slug);

  const duplicate = await query('SELECT id FROM seminars WHERE slug = $1 AND id <> $2', [nextSlug, seminar.id]);
  if (duplicate.rowCount) {
    return res.status(409).json({ message: 'Другой семинар уже использует этот slug.' });
  }

  await query(
    `UPDATE seminars SET
      slug = $1,
      title = $2,
      category = $3,
      date_text = $4,
      duration = $5,
      format = $6,
      location = $7,
      image_url = $8,
      short_description = $9,
      description = $10,
      outcomes = $11,
      lecturer_name = $12,
      lecturer_role = $13,
      lecturer_bio = $14,
      lecturer_photo = $15,
      certificate = $16,
      rating = $17,
      pdf_url = $18,
      updated_at = NOW()
     WHERE id = $19`,
    [
      nextSlug,
      body.title || seminar.title,
      body.category || seminar.category,
      body.date || seminar.date_text,
      body.duration || seminar.duration,
      body.format || seminar.format,
      body.location || seminar.location,
      body.image || seminar.image_url,
      body.shortDescription || seminar.short_description,
      body.description || seminar.description,
      outcomes.length ? outcomes : seminar.outcomes,
      body.lecturer?.name || seminar.lecturer_name,
      body.lecturer?.role || seminar.lecturer_role,
      body.lecturer?.bio || seminar.lecturer_bio,
      body.lecturer?.photo || seminar.lecturer_photo,
      typeof body.certificate === 'boolean' ? body.certificate : seminar.certificate,
      Number(body.rating || seminar.rating),
      body.pdf === '' ? null : (body.pdf ?? seminar.pdf_url),
      seminar.id,
    ]
  );

  res.json({ slug: nextSlug });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || 500;
  res.status(status).json({
    message: status === 500 ? 'Внутренняя ошибка сервера.' : error.message,
    details: error.message,
  });
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API started on http://localhost:${PORT}`);
    });
  })
  .catch(async (error) => {
    console.error('Failed to start server:', error);
    await pool.end();
    process.exit(1);
  });
