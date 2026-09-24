import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const courseId = process.env.TEST_COURSE_ID;

const missing = [
  ['VITE_SUPABASE_URL/TEST_SUPABASE_URL', url],
  ['VITE_SUPABASE_ANON_KEY/TEST_SUPABASE_ANON_KEY', anonKey],
  ['TEST_USER_EMAIL', email],
  ['TEST_USER_PASSWORD', password],
  ['TEST_COURSE_ID', courseId],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(`Missing test configuration: ${missing.join(', ')}`);
  console.error('Use a disposable student account and a test-enabled course. See TESTING.md.');
  process.exit(2);
}

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const clients = [client(), client()];
for (const [index, supabase] of clients.entries()) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Login failed for client ${index + 1}: ${error.message}`);
}

console.log('Running concurrent enrollment requests from two independent sessions...');
const enrollmentCalls = Array.from({ length: 12 }, (_, index) =>
  clients[index % 2].rpc('enroll_in_course', { check_course_id: courseId })
);
const enrollmentResults = await Promise.all(enrollmentCalls);
const enrollmentErrors = enrollmentResults.map((r) => r.error).filter(Boolean);
if (enrollmentErrors.length) throw new Error(`Concurrent enrollment failed: ${enrollmentErrors[0].message}`);

const { data: authData } = await clients[0].auth.getUser();
const userId = authData.user?.id;
if (!userId) throw new Error('Could not read authenticated test user ID.');

const { data: enrollmentRows, error: enrollmentReadError } = await clients[0]
  .from('enrollments')
  .select('id,user_id,course_id')
  .eq('user_id', userId)
  .eq('course_id', courseId);
if (enrollmentReadError) throw enrollmentReadError;
if ((enrollmentRows || []).length !== 1) {
  throw new Error(`Expected exactly 1 enrollment row, found ${(enrollmentRows || []).length}.`);
}
console.log('PASS  exactly one enrollment row exists.');

const { data: sections, error: sectionsError } = await clients[0]
  .from('course_sections')
  .select('id')
  .eq('course_id', courseId);
if (sectionsError) throw sectionsError;

console.log(`Marking ${sections?.length || 0} course section(s) complete using concurrent duplicate requests...`);
for (const section of sections || []) {
  const results = await Promise.all([
    clients[0].rpc('mark_section_completed', { check_section_id: section.id }),
    clients[1].rpc('mark_section_completed', { check_section_id: section.id }),
    clients[0].rpc('mark_section_completed', { check_section_id: section.id }),
  ]);
  const errors = results.map((r) => r.error).filter(Boolean);
  if (errors.length) throw new Error(`mark_section_completed failed: ${errors[0].message}`);
}

const { data: progressRows, error: progressError } = await clients[0]
  .from('section_progress')
  .select('section_id')
  .eq('user_id', userId)
  .eq('course_id', courseId);
if (progressError) throw progressError;
const distinctProgress = new Set((progressRows || []).map((r) => r.section_id));
if (distinctProgress.size !== (sections || []).length || (progressRows || []).length !== distinctProgress.size) {
  throw new Error('Duplicate or missing section_progress rows detected.');
}
console.log('PASS  section progress remains idempotent with no duplicates.');

console.log('Starting the same course test concurrently from two independent sessions...');
const starts = await Promise.all(Array.from({ length: 10 }, (_, index) =>
  clients[index % 2].rpc('start_course_test', { check_course_id: courseId })
));
const startErrors = starts.map((r) => r.error).filter(Boolean);
if (startErrors.length) {
  throw new Error(`start_course_test failed. Ensure TEST_COURSE_ID has an enabled test with >=5 questions: ${startErrors[0].message}`);
}

const attemptIds = starts.flatMap((r) => Array.isArray(r.data) ? r.data : [r.data]).filter(Boolean).map((r) => r.attempt_id);
const uniqueAttemptIds = new Set(attemptIds);
if (uniqueAttemptIds.size !== 1) {
  throw new Error(`Expected all concurrent starts to resolve to one active attempt, got ${uniqueAttemptIds.size}: ${[...uniqueAttemptIds].join(', ')}`);
}

const { data: activeAttempts, error: attemptsError } = await clients[0]
  .from('test_attempts')
  .select('id')
  .eq('user_id', userId)
  .eq('course_id', courseId)
  .is('completed_at', null);
if (attemptsError) throw attemptsError;
if ((activeAttempts || []).length !== 1) {
  throw new Error(`Expected exactly 1 active DB attempt, found ${(activeAttempts || []).length}.`);
}
console.log('PASS  exactly one active test attempt exists across concurrent sessions.');
console.log('\nConcurrency smoke test passed. The active attempt is intentionally left open for manual UI testing.');
