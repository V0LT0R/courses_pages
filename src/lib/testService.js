import { answerPayload } from './testQuestions';
import {selectAll} from './pagination';
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
      selectAll(()=>supabase.from('test_options').select('*').in('question_id',questionIds).order('position').order('id')).then(data=>({data})),
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

  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
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
      const answer = answerByQuestion.get(question.id);
      const correctOptionId = answer?.correct_option_id;
      const correctIds = answer?.correct_option_ids?.length ? answer.correct_option_ids : [correctOptionId];
      return {
        id: question.id,
        text: question.question_text,
        type: question.question_type || 'single_choice',
        acceptedAnswers: answer?.accepted_answers || [],
        correctOptionIndices: questionOptions.flatMap((option, i) => correctIds.includes(option.id) ? [i] : []),
        options: questionOptions.map((option) => ({ id: option.id, text: option.option_text })),
        correctOptionIndex: Math.max(0, questionOptions.findIndex((option) => option.id === correctOptionId)),
      };
    }),
  };
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
  const pickHighestScore = (items) => items.reduce((best, attempt) => {
    if (!best) return attempt;
    return Number(attempt.score || 0) > Number(best.score || 0) ? attempt : best;
  }, null);
  const bestAttempt = pickHighestScore(completedAttempts);
  const bestPassedAttempt = pickHighestScore(
    completedAttempts.filter((attempt) => attempt.passed && !attempt.timed_out)
  );

  return {
    id: test.id,
    enabled: test.enabled,
    version: test.version,
    passingScore: test.passing_score,
    timeLimitMinutes: test.time_limit_minutes,
    questionCount: test.question_count,
    attemptCount: completedAttempts.length,
    bestScore: bestAttempt?.score ?? null,
    bestPassed: Boolean(bestPassedAttempt),
    bestAttempt,
    bestPassedAttempt,
  };
}

export async function startCourseTest(courseUuid) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.rpc('start_course_test', {
    check_course_id: courseUuid,
  });
  if (error) {
    const message = String(error.message || '');
    const code = String(error.code || '');
    if (code === 'PGRST202' || /start_course_test|schema cache/i.test(message)) {
      throw new Error('База Supabase не обновлена до версии этого проекта. Выполните supabase/APPLY_EXISTING_DB_SECURITY_UPDATE.sql.');
    }
    throw error;
  }
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
  const options=await selectAll(()=>supabase.from('test_options').select('*').in('question_id',questionIds).order('position').order('id'));
  const optionsByQuestion = new Map();
  (options || []).forEach((option) => {
    const list = optionsByQuestion.get(option.question_id) || [];
    list.push({ id: option.id, text: option.option_text });
    optionsByQuestion.set(option.question_id, list);
  });

  return questionRows.map((question) => ({
    id: question.id,
    text: question.question_text,
    type: question.question_type || 'single_choice',
    options: optionsByQuestion.get(question.id) || [],
  }));
}

export async function submitCourseTest(attemptId, answers) {
  ensureSupabaseConfigured();
  const payload = answerPayload(answers);

  const { data, error } = await supabase.rpc('submit_course_test', {
    check_attempt_id: attemptId,
    check_answers: payload,
  });
  if (error) {
    const message = String(error.message || '');
    const code = String(error.code || '');
    if (code === 'PGRST202' || /submit_course_test|schema cache/i.test(message)) {
      throw new Error('База Supabase не обновлена до версии этого проекта. Выполните supabase/APPLY_EXISTING_DB_SECURITY_UPDATE.sql.');
    }
    throw error;
  }
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
