export const QUESTION_TYPES = {
  single_choice: 'Один правильный ответ',
  multiple_choice: 'Несколько правильных ответов',
  true_false: 'Верно / неверно',
  short_answer: 'Короткий текстовый ответ',
};

export function questionPayload(question) {
  const type = question.type || 'single_choice';
  return {
    type,
    text: question.text.trim(),
    ...(type === 'short_answer' ? {
      acceptedAnswers: question.acceptedAnswersText.split('\n').map(s => s.trim()).filter(Boolean),
    } : {
      options: question.options.map(option => option.text.trim()),
      ...(type === 'multiple_choice' ? {
        correctOptionIndices: question.options.flatMap((option, index) => option.isCorrect ? [index] : []),
      } : { correctOptionIndex: question.options.findIndex(option => option.isCorrect) }),
    }),
  };
}

export function validateTest(test) {
  const errors = [];
  if (![60, 70, 80, 90, 100].includes(test.passingScore)) errors.push('проходной балл теста');
  if (!Number.isInteger(test.timeLimitMinutes) || test.timeLimitMinutes < 1 || test.timeLimitMinutes > 480) errors.push('время теста от 1 до 480 минут');
  if (test.questions.length < 1 || test.questions.length > 200) errors.push('от 1 до 200 вопросов');
  test.questions.forEach((question, index) => {
    const label = `вопрос ${index + 1}`;
    if (!QUESTION_TYPES[question.type] || !question.text || question.text.length > 2000) errors.push(`${label}: текст до 2000 символов`);
    if (question.type === 'short_answer') {
      if (!question.acceptedAnswers.length || question.acceptedAnswers.length > 20 || question.acceptedAnswers.some(s => s.length > 500)) errors.push(`${label}: 1–20 допустимых ответов, до 500 символов каждый`);
      return;
    }
    if (question.options.length < 2 || question.options.length > 6 || question.options.some(s => !s || s.length > 1000)) errors.push(`${label}: 2–6 непустых вариантов до 1000 символов`);
    if (question.type === 'true_false' && question.options.length !== 2) errors.push(`${label}: два варианта`);
    const indices = question.type === 'multiple_choice' ? question.correctOptionIndices : [question.correctOptionIndex];
    if (!indices.length || indices.some(i => !Number.isInteger(i) || i < 0 || i >= question.options.length)) errors.push(`${label}: отметьте правильный ответ`);
  });
  return errors;
}

export function answerPayload(answers) {
  return Object.entries(answers || {}).flatMap(([question_id, answer]) => {
    if (Array.isArray(answer)) return answer.length ? [{ question_id, option_ids: answer }] : [];
    if (typeof answer === 'object' && answer !== null) return answer.text?.trim() ? [{ question_id, text: answer.text }] : [];
    return answer ? [{ question_id, option_id: answer }] : [];
  });
}
