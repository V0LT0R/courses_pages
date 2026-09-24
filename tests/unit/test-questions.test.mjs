import test from 'node:test';
import assert from 'node:assert/strict';
import { answerPayload, questionPayload, validateTest } from '../../src/lib/testQuestions.js';

test('answer serialization preserves types and omits genuinely unanswered questions', () => {
  assert.deepEqual(answerPayload({ one: 'option', many: ['a', 'b'], text: { text: ' Астана ' }, empty: [], blank: { text: '  ' } }), [
    { question_id: 'one', option_id: 'option' }, { question_id: 'many', option_ids: ['a', 'b'] }, { question_id: 'text', text: ' Астана ' },
  ]);
});
test('removing a correct option cannot silently select a different answer', () => {
  const question = questionPayload({ text: 'Вопрос', type: 'single_choice', options: [{ text: 'Нет', isCorrect: false }, { text: 'Не знаю', isCorrect: false }] });
  assert.equal(question.correctOptionIndex, -1);
  assert.ok(validateTest({ passingScore: 70, timeLimitMinutes: 10, questions: [question] }).some(s => s.includes('правильный ответ')));
});
test('short answer and multiple choice editor payloads exclude hidden stale single-choice fields', () => {
  assert.deepEqual(questionPayload({ text: ' Город ', type: 'short_answer', acceptedAnswersText: 'Астана\n\nAstana\n', options: [] }), { text: 'Город', type: 'short_answer', acceptedAnswers: ['Астана', 'Astana'] });
  assert.deepEqual(questionPayload({ text: 'Ответы', type: 'multiple_choice', options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }, { text: 'C', isCorrect: true }] }).correctOptionIndices, [0, 2]);
});
