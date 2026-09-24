import fs from 'node:fs/promises';
import { generateCertificatePdf } from '../server/certificateService.js';

// Local fixtures only; this script never creates certificate records in Supabase.
await fs.mkdir('output/pdf', { recursive: true });
await fs.mkdir('tmp/pdfs', { recursive: true });
const cert = {
  certificate_number: 'AQ-PREVIEW-20260924',
  full_name: 'Аманалы Айдана',
  course_name: 'Эффективное использование трансграничных водных ресурсов с применением современных информационных технологий',
  academic_hours: 18, city: 'Астана', issuer: 'AQUAGEO.KZ',
  issued_at: '2026-09-24T00:00:00Z', status: 'active', template_version: 3,
  verify_url: 'http://localhost:5173/verify/AQ-PREVIEW-20260924',
};
await fs.writeFile('output/pdf/certificate-preview.pdf', await generateCertificatePdf(cert));
await fs.writeFile('tmp/pdfs/certificate-long.pdf', await generateCertificatePdf({ ...cert,
  full_name: 'Әбдірахманова Қарлығаш Нұрмұхамедқызы '.repeat(4).slice(0, 120),
  course_name: 'Современные методы управления водными ресурсами и международное сотрудничество '.repeat(4).slice(0, 300),
  certificate_number: `AQ-${'A'.repeat(125)}`,
}));
await fs.writeFile('tmp/pdfs/certificate-revoked.pdf', await generateCertificatePdf({ ...cert, status: 'revoked' }));
console.log('Created local certificate previews (not registered or valid certificates).');
