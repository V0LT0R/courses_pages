import { ensureSupabaseConfigured, supabase, withTimeout } from './supabase';
import { userMessage } from './errors';

export async function withCourseRatings(rows, signal) {
  if (!rows.length) return [];
  const request = supabase.rpc('get_course_rating_summaries', {
    check_course_ids: [...new Set(rows.map(row => row.id))],
  });
  const { data, error } = await withTimeout(signal ? request.abortSignal(signal) : request);
  if (error) throw new Error(userMessage(error));
  const summaries = new Map((data || []).map(row => [row.course_id, row]));
  return rows.map(row => ({ ...row, rating_summary: summaries.get(row.id) }));
}

export async function getMyCourseRating(courseId) {
  ensureSupabaseConfigured();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw new Error('Нужно войти в аккаунт.');
  const { data, error } = await withTimeout(supabase.from('course_ratings')
    .select('rating').eq('course_id', courseId).eq('user_id', session.user.id).maybeSingle());
  if (error) throw new Error(userMessage(error));
  return data?.rating ?? null;
}

export async function saveCourseRating(courseId, rating) {
  ensureSupabaseConfigured();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Выберите оценку от 1 до 5.');
  const { data, error } = await withTimeout(supabase.rpc('rate_course', { check_course_id: courseId, check_rating: rating }).single());
  if (error) throw new Error(userMessage(error));
  return data.rating;
}
