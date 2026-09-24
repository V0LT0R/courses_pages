import { createClient } from '@supabase/supabase-js';

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getSupabaseClient(accessToken) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw httpError('Supabase не настроен на backend.', 500);
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function parseDurationHours(value) {
  const match = String(value || '').match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(',', '.')) : 40;
}

export async function verifyCertificateEligibility({ accessToken, externalUserId, courseId }) {
  if (!accessToken) throw httpError('Нужно войти в аккаунт для получения сертификата.', 401);

  const supabase = getSupabaseClient(accessToken);
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData?.user) throw httpError('Сессия Supabase недействительна. Войдите снова.', 401);
  const authUser = authData.user;

  if (externalUserId && String(externalUserId) !== String(authUser.id)) {
    throw httpError('Нельзя выпустить сертификат для другого пользователя.', 403);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', authUser.id)
    .single();
  if (profileError || !profile) throw httpError('Профиль пользователя не найден.', 403);
  const trustedFullName = String(profile.full_name || '').trim().replace(/\s+/g, ' ');
  if (trustedFullName.length < 2 || trustedFullName.length > 120) {
    throw httpError('Имя в профиле должно содержать от 2 до 120 символов.', 400);
  }

  const identifier = String(courseId || '').trim();
  if (!identifier) throw httpError('Не указан курс.', 400);

  let courseQuery = supabase
    .from('courses')
    .select('id, slug, title, duration, certificate');

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
  courseQuery = uuidLike ? courseQuery.eq('id', identifier) : courseQuery.eq('slug', identifier);
  const { data: course, error: courseError } = await courseQuery.maybeSingle();
  if (courseError || !course) throw httpError('Курс не найден.', 404);
  const trustedCourseTitle = String(course.title || '').trim();
  if (!trustedCourseTitle || trustedCourseTitle.length > 300) {
    throw httpError('Название курса некорректно для выпуска сертификата.', 400);
  }
  if (!course.certificate) throw httpError('Для этого курса выдача сертификата отключена.', 403);

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', authUser.id)
    .eq('course_id', course.id)
    .maybeSingle();
  if (enrollmentError || !enrollment) throw httpError('Вы не зарегистрированы на этот курс.', 403);

  const { data: sections, error: sectionsError } = await supabase
    .from('course_sections')
    .select('id')
    .eq('course_id', course.id);
  if (sectionsError) throw sectionsError;
  if (!sections?.length) throw httpError('В курсе нет разделов для завершения.', 403);

  const sectionIds = sections.map((section) => section.id);
  const { data: progress, error: progressError } = await supabase
    .from('section_progress')
    .select('section_id, is_completed')
    .eq('user_id', authUser.id)
    .in('section_id', sectionIds);
  if (progressError) throw progressError;

  const completedIds = new Set((progress || []).filter((item) => item.is_completed).map((item) => item.section_id));
  if (!sectionIds.every((id) => completedIds.has(id))) {
    throw httpError('Сначала завершите все разделы курса.', 403);
  }

  const { data: test, error: testError } = await supabase
    .from('course_tests')
    .select('id, enabled, passing_score')
    .eq('course_id', course.id)
    .maybeSingle();
  if (testError || !test?.enabled) throw httpError('Итоговый тест курса не настроен.', 403);

  const { data: bestAttempt, error: attemptError } = await supabase
    .from('test_attempts')
    .select('score, passed, completed_at')
    .eq('user_id', authUser.id)
    .eq('course_id', course.id)
    .eq('passed', true)
    .eq('timed_out', false)
    .not('completed_at', 'is', null)
    .order('score', { ascending: false })
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (attemptError || !bestAttempt?.passed) {
    throw httpError('Сертификат доступен только после успешного прохождения итогового теста.', 403);
  }

  return {
    user: authUser,
    profile: { ...profile, full_name: trustedFullName },
    course: { ...course, title: trustedCourseTitle },
    score: Number(bestAttempt.score || 0),
    completedAt: bestAttempt.completed_at,
    durationHours: parseDurationHours(course.duration),
  };
}
