import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (or TEST_SUPABASE_* equivalents).');
  process.exit(2);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const failures = [];
const pass = (name) => console.log(`PASS  ${name}`);
const fail = (name, detail) => { failures.push(name); console.error(`FAIL  ${name}: ${detail}`); };

const { error: coursesError } = await supabase.from('courses').select('id,slug').limit(1);
if (coursesError) fail('courses table is reachable with expected guest policy', coursesError.message);
else pass('courses table is reachable with expected guest policy');

for (const probe of [
  ['is_email_taken is not callable anonymously', 'is_email_taken', { check_email: 'security-probe@example.invalid' }],
  ['enroll_in_course is not callable anonymously', 'enroll_in_course', { check_course_id: '00000000-0000-0000-0000-000000000000' }],
  ['start_course_test is not callable anonymously', 'start_course_test', { check_course_id: '00000000-0000-0000-0000-000000000000' }],
]) {
  const [name, fn, args] = probe;
  const { error } = await supabase.rpc(fn, args);
  if (error?.code === '42501') pass(name);
  else if(error) fail(name, `Expected permission denial (42501), got ${error.code}; check schema and connectivity`);
  else fail(name, 'RPC unexpectedly succeeded for the anon role');
}

if (failures.length) {
  console.error(`\n${failures.length} Supabase smoke check(s) failed.`);
  process.exit(1);
}
console.log('\nSupabase smoke checks passed.');
