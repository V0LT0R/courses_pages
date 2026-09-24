// Development-only fixture: all rating requests are local stubs, with no remote writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { supabase } from '../../src/lib/supabase';
import { mapCourse } from '../../src/lib/courseService';
import { withCourseRatings } from '../../src/lib/ratingService';
import CourseRatingForm from '../../src/components/CourseRatingForm';
import SeminarCard from '../../src/components/SeminarCard';
import '../../src/styles.css';

if (!import.meta.env.DEV) throw new Error('Development fixture only');
let savedRating = null;
let failSave = false;
supabase.auth.getSession = async () => ({ data: { session: { user: { id: 'fixture-user' } } } });
supabase.from = table => {
  if (table !== 'course_ratings') throw new Error('Unexpected fixture table');
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: savedRating ? { rating: savedRating } : null }),
  };
  return query;
};
supabase.rpc = (name, args) => {
  if (name === 'get_course_rating_summaries') return Promise.resolve({ data: args.check_course_ids.map(id => ({ course_id: id, rating: id === 'rated' ? savedRating || 5 : 5, rating_count: id === 'rated' && savedRating ? 1 : 0 })) });
  if (name !== 'rate_course') throw new Error('Unexpected fixture RPC');
  return { single: async () => {
    if (failSave) return { error: { message: 'Тестовый сбой. Попробуйте ещё раз.' } };
    savedRating = args.check_rating;
    return { data: { rating: savedRating } };
  } };
};
const rows = [
  { id: 'rated', title: 'Прогнозирование состояния водных ресурсов на основе моделирования сценариев', short_description: 'Как формировать и интерпретировать условные оценки будущей водообеспеченности.' },
  { id: 'second', title: 'Математическое моделирование в рамках мониторинга водных ресурсов', short_description: 'Практические занятия по анализу водных ресурсов с применением современных методов моделирования.' },
  { id: 'third', title: 'Тестовый семинар', short_description: 'Краткое описание семинара.' },
].map(row => ({ ...row, slug: row.id, category: 'Водные ресурсы', date_text: '25.09.2026', image_url: '/image/aitu-logo.png', certificate: row.id === 'second' }));

function Fixture() {
  const [courses, setCourses] = useState(rows.map(row => mapCourse(row)));
  return <MemoryRouter><main className="container">
    <h1>Локальная проверка оценок</h1><p>Синтетические данные. Удалённая база не используется.</p>
    <CourseRatingForm courseId="rated" />
    <div className="form-actions" style={{ marginBottom: 24 }}>
      <button className="ghost-inline-button" onClick={async () => setCourses((await withCourseRatings(rows)).map(row => mapCourse(row)))}>Обновить карточки</button>
      <label><input type="checkbox" onChange={event => { failSave = event.target.checked; }} /> Имитировать ошибку сохранения</label>
    </div>
    <div className="cards-grid" style={{ display: 'grid', gap: 24 }}>{courses.map(course => <SeminarCard key={course.uuid} seminar={course} />)}</div>
  </main></MemoryRouter>;
}
const root = createRoot(document.getElementById('root'));
root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
