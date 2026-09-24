import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/security_hardening_2026.sql');
const serverSecurity = read('server/security.js');
const serverIndex = read('server/index.js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('database migration contains concurrency and integrity protections', () => {
  assert.match(migration, /profiles_email_lower_uidx/i);
  assert.match(migration, /test_attempts_one_active_per_course_uidx/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /Only one answer per question is allowed/i);
  assert.match(migration, /passed_value := \(not timed_out_value\)/i);
  assert.match(migration, /revoke insert, update, delete on public\.enrollments from authenticated/i);
  assert.match(migration, /revoke insert, update, delete on public\.certificate_requests from authenticated/i);
  assert.match(migration, /update storage\.buckets[\s\S]*public = false/i);
  assert.match(migration, /create or replace function public\.save_course_with_content/i);
});

test('backend does not contain an insecure fallback JWT secret or wildcard CORS', () => {
  assert.doesNotMatch(serverSecurity, /dev_secret/i);
  assert.doesNotMatch(serverIndex, /origin\s*:\s*['"]\*['"]/i);
  assert.match(serverSecurity, /JWT_SECRET must be at least 32 characters/i);
});

test('React source avoids direct HTML injection/eval primitives', () => {
  const files = walk(path.join(root, 'src')).filter((file) => /\.(js|jsx|mjs)$/.test(file));
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});

test('browser source contains no Supabase service-role key references', () => {
  const files = walk(path.join(root, 'src')).filter((file) => /\.(js|jsx|mjs)$/.test(file));
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /service[_-]?role/i);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('.gitignore protects local secrets and generated dependencies', () => {
  const gitignore = read('.gitignore');
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^node_modules\/?$/m);
});

test('enroll RPC frontend argument matches PostgreSQL function argument', () => {
  const courseService = read('src/lib/courseService.js');
  const migration = read('supabase/fix_enroll_rpc.sql');
  assert.match(courseService, /rpc\(['\"]enroll_in_course['\"],\s*\{\s*check_course_id:\s*courseUuid/s);
  assert.match(migration, /function\s+public\.enroll_in_course\(check_course_id\s+uuid\)/i);
  assert.match(migration, /notify\s+pgrst,\s*['\"]reload schema['\"]/i);
});


test('course progress RPC repair matches frontend and reloads PostgREST schema', () => {
  const courseService = read('src/lib/courseService.js');
  const repair = read('supabase/fix_course_progress_rpc.sql');
  assert.match(courseService, /rpc\(['"]mark_section_completed['"],\s*\{\s*check_section_id:\s*sectionId/s);
  assert.match(repair, /function\s+public\.mark_section_completed\(check_section_id\s+uuid\)/i);
  assert.match(repair, /function\s+public\.finalize_course_completion\(check_course_id\s+uuid\)/i);
  assert.match(repair, /notify\s+pgrst,\s*['"]reload schema['"]/i);
});

test('hardening migration has no duplicated VALUES statement in section progress insert', () => {
  const migration = read('supabase/security_hardening_2026.sql');
  assert.doesNotMatch(
    migration,
    /values\s*\(auth\.uid\(\),\s*check_section_id,\s*true,\s*clock_timestamp\(\)\)\s*values\s*\(/i
  );
});
