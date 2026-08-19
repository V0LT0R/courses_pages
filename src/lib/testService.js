import { ensureSupabaseConfigured, supabase, withTimeout } from './supabase';

export const PASSING_SCORE_OPTIONS = [60, 70, 80, 90, 100];

export async function getCourseTestForEdit(courseUuid) {
  ensureSupabaseConfigured();

  const { data: test, error: testError } = await withTimeout(
    supabase
      .from('course_tests')
      .select('*')
      .eq('course_id', courseUuid)
      .maybeSingle(),
    'Не удалось загрузить тест. Выполните supabase/test_migration.sql в Supabase SQL Editor.'
  );

  if (testError) throw testError;
  if (!test) return null;

  const { data: questions, error: questionsError } = await supabase
    .from('test_questions')
    .select('*')
    .eq('test_id', test.id)
    .eq('version', test.version)
    .order('position', { ascending: true });

  if (questionsError) throw questionsError;
  const questionRows = questions || [];
  const questionIds = questionRows.map((question) => question.id);

  let options = [];
  let answers = [];
  if (questionIds.length) {
    const [{ data: optionRows, error: optionsError }, { data: answerRows, error: answersError }] = await Promise.all([
      supabase
        .from('test_options')
        .select('*')
        .in('question_id', questionIds)
        .order('position', { ascending: true }),
      supabase
        .from('test_question_answers')
        .select('*')
        .in('question_id', questionIds),
    ]);

    if (optionsError) throw optionsError;
    if (answersError) throw answersError;
    options = optionRows || [];
    answers = answerRows || [];
  }

  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer.correct_option_id]));
  const optionsByQuestion = new Map();
  options.forEach((option) => {
    const list = optionsByQuestion.get(option.question_id) || [];
    list.push(option);
    optionsByQuestion.set(option.question_id, list);
  });

  return {
    id: test.id,
    version: test.version,
    enabled: test.enabled,
    passingScore: test.passing_score,
    timeLimitMinutes: test.time_limit_minutes,
    questionCount: test.question_count,
    questions: questionRows.map((question) => {
      const questionOptions = optionsByQuestion.get(question.id) || [];
      const correctOptionId = answerByQuestion.get(question.id);
      return {
        id: question.id,
        text: question.question_text,
        options: questionOptions.map((option) => ({ id: option.id, text: option.option_text })),
        correctOptionIndex: Math.max(0, questionOptions.findIndex((option) => option.id === correctOptionId)),
      };
    }),
  };
}

export async function saveCourseTest(courseUuid, test) {
  ensureSupabaseConfigured();
  const questions = (test?.questions || []).map((question) => ({
    text: String(question.text || '').trim(),
    options: (question.options || []).map((option) => String(typeof option === 'string' ? option : option?.text || '').trim()),
    correctOptionIndex: Number(question.correctOptionIndex),
  }));

  const { data, error } = await supabase.rpc('save_course_test', {
    check_course_id: courseUuid,
    check_passing_score: Number(test?.passingScore || 70),
    check_time_limit_minutes: Number(test?.timeLimitMinutes || 10),
    check_questions: questions,
  });

  if (error) {
    if (/function .*save_course_test|schema cache|course_tests/i.test(error.message || '')) {
      throw new Error('Модуль тестирования еще не установлен в Supabase. Выполните файл supabase/test_migration.sql в Supabase SQL Editor.');
    }
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function getCourseTestSummary(courseUuid) {
  ensureSupabaseConfigured();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;

  const { data: test, error: testError } = await supabase
    .from('course_tests')
    .select('*')
    .eq('course_id', courseUuid)
    .maybeSingle();

  if (testError) {
    if (/course_tests|schema cache/i.test(testError.message || '')) return null;
    throw testError;
  }
  if (!test) return null;

  const { data: attempts, error: attemptsError } = await supabase
    .from('test_attempts')
    .select('id, score, passed, timed_out, started_at, completed_at, duration_seconds, test_version')
    .eq('user_id', user.id)
    .eq('course_id', courseUuid)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false });

  if (attemptsError) throw attemptsError;
  const completedAttempts = attempts || [];
  const bestAttempt = completedAttempts.reduce((best, attempt) => {
    if (!best) return attempt;
    return Number(attempt.score || 0) > Number(best.score || 0) ? attempt : best;
  }, null);

  return {
    id: test.id,
    enabled: test.enabled,
    version: test.version,
    passingScore: test.passing_score,
    timeLimitMinutes: test.time_limit_minutes,
    questionCount: test.question_count,
    attemptCount: completedAttempts.length,
    bestScore: bestAttempt?.score ?? null,
    bestPassed: Boolean(bestAttempt?.passed),
    bestAttempt,
  };
}

export async function startCourseTest(courseUuid) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.rpc('start_course_test', {
    check_course_id: courseUuid,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Не удалось создать попытку тестирования.');
  return {
    attemptId: row.attempt_id,
    testId: row.test_id,
    testVersion: row.test_version,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    timeLimitMinutes: row.time_limit_minutes,
    passingScore: row.passing_score,
  };
}

export async function getAttemptQuestions(attempt) {
  ensureSupabaseConfigured();
  const { data: questions, error: questionsError } = await supabase
    .from('test_questions')
    .select('*')
    .eq('test_id', attempt.testId)
    .eq('version', attempt.testVersion)
    .order('position', { ascending: true });

  if (questionsError) throw questionsError;
  const questionRows = questions || [];
  if (!questionRows.length) throw new Error('В тесте нет доступных вопросов.');

  const questionIds = questionRows.map((question) => question.id);
  const { data: options, error: optionsError } = await supabase
    .from('test_options')
    .select('*')
    .in('question_id', questionIds)
    .order('position', { ascending: true });

  if (optionsError) throw optionsError;
  const optionsByQuestion = new Map();
  (options || []).forEach((option) => {
    const list = optionsByQuestion.get(option.question_id) || [];
    list.push({ id: option.id, text: option.option_text });
    optionsByQuestion.set(option.question_id, list);
  });

  return questionRows.map((question) => ({
    id: question.id,
    text: question.question_text,
    options: optionsByQuestion.get(question.id) || [],
  }));
}

export async function submitCourseTest(attemptId, answers) {
  ensureSupabaseConfigured();
  const payload = Object.entries(answers || {}).map(([questionId, optionId]) => ({
    question_id: questionId,
    option_id: optionId,
  }));

  const { data, error } = await supabase.rpc('submit_course_test', {
    check_attempt_id: attemptId,
    check_answers: payload,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Не удалось получить результат тестирования.');

  return {
    attemptId: row.attempt_id,
    score: row.score,
    correctAnswers: row.correct_answers,
    totalQuestions: row.total_questions,
    passed: row.passed,
    timedOut: row.timed_out,
    completedAt: row.completed_at,
    durationSeconds: row.duration_seconds,
  };
}
