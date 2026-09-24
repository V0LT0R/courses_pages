// Development fixture. Saves only to React state; never calls the course save RPC.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TestQuestion from '../../src/components/TestQuestion';
import { answerPayload } from '../../src/lib/testQuestions';
import SeminarForm from '../../src/components/SeminarForm';
import '../../src/styles.css';

const seminar = {
  title: 'Проверка семинара', slug: 'local-preview', category: 'Водные ресурсы', date: '24 сентября 2026',
  duration: '3 дня', academicHours: 18, format: 'Онлайн', location: 'Астана',
  shortDescription: 'Локальная проверка формы.', description: 'Материалы семинара.', certificate: true,
  sections: [{ title: 'Введение', blocks: [{ type: 'text', title: 'Материал', content: 'Изучите этот текст.' }] }],
  test: { enabled: true, passingScore: 70, timeLimitMinutes: 10, questions: [
    { type: 'single_choice', text: 'Выберите один ответ', options: [{ text: 'Да' }, { text: 'Нет' }], correctOptionIndex: 0 },
    { type: 'multiple_choice', text: 'Выберите два ответа', options: [{ text: 'А' }, { text: 'Б' }, { text: 'В' }], correctOptionIndices: [0, 2] },
    { type: 'true_false', text: 'Вода необходима для жизни', options: [{ text: 'Верно' }, { text: 'Неверно' }], correctOptionIndex: 0 },
    { type: 'short_answer', text: 'Назовите город', options: [], acceptedAnswers: ['Астана', 'Astana'] },
  ] },
};
function Fixture() {
  const [saved, setSaved] = useState(null);
  const [answers, setAnswers] = useState({});
  return <main className="container"><div className="card content-card">
    <h1>Локальная проверка редактора</h1><p>Сохранение показывает данные ниже. Удалённая база не меняется.</p>
    <SeminarForm seminar={seminar} onSubmit={async value => setSaved(value)} onCancel={() => setSaved(null)} submitText="Проверить сохранение" />
    <h2>Вид вопросов для студента</h2>
    {seminar.test.questions.map((question, i) => <TestQuestion key={i} question={{ ...question, id: `q${i}`, options: question.options.map((option, j) => ({ ...option, id: `q${i}-o${j}` })) }} value={answers[`q${i}`]} onChange={value => setAnswers(previous => ({ ...previous, [`q${i}`]: value }))} />)}
    <pre aria-label="Ответы студента">{JSON.stringify(answerPayload(answers), null, 2)}</pre>
    {saved && <pre aria-label="Сохранённые данные">{JSON.stringify(saved, null, 2)}</pre>}
  </div></main>;
}
const root = createRoot(document.getElementById('root'));
root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
