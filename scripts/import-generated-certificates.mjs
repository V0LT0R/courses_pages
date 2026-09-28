import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { loadGeneratedCertificates } from '../server/generatedCertificateImport.js';
import { uuid } from '../server/validation.js';

const apply = process.argv.includes('--apply');
const directory = fileURLToPath(new URL('../generated-certificates/', import.meta.url));
const explicitCourse = process.argv.find(arg => arg.startsWith('--course-id='))?.split('=')[1];
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
let completed = 0;
try {
  // Validate every file before connecting or writing anything.
  let planned = await loadGeneratedCertificates(directory, explicitCourse ? uuid(explicitCourse) : null);
  if (!url || !key) throw new Error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в серверном окружении.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } });
  const { data: courses, error } = await client.from('courses').select('id,title').limit(1000);
  if (error) throw new Error(`Не удалось загрузить курсы: ${error.code}`);
  const title = planned[0].payload.course_name;
  const matches = (courses || []).filter(course => course.title.trim().replace(/\s+/g, ' ') === title);
  const courseId = explicitCourse || (matches.length === 1 ? matches[0].id : null);
  if (explicitCourse && !courses.some(course => course.id === explicitCourse)) throw new Error('Выбранный курс отсутствует в каталоге.');
  planned = planned.map(item => ({ ...item, payload: { ...item.payload, course_id: courseId } }));
  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', records: planned.length, filesVerified: planned.length,
      linkedToCourse: Boolean(courseId), action: 'Примените certificate_admin_update.sql, затем повторите команду с --apply.' }));
  } else {
    for (const item of planned) {
      const { error: importError } = await client.rpc('import_generated_certificate', {
        check_payload: item.payload, check_pdf: item.pdf.toString('base64'),
        check_sha256: item.sha256, check_verification_url: item.originalUrl,
      });
      if (importError) throw new Error(`Импорт остановлен: ${importError.code}. Проверьте миграцию и конфликты номеров; повторный запуск безопасен.`);
      completed++;
    }
    console.log(JSON.stringify({ mode: 'apply', verifiedOrImported: completed, originalPdfsPreserved: completed, linkedToCourse: Boolean(courseId) }));
  }
} catch (error) {
  console.error(JSON.stringify({ completed, error: error.message }));
  process.exitCode = 1;
}
