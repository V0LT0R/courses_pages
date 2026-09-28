// Local synthetic data only. These tests never issue certificates in Supabase.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminCertificates from '../../src/components/AdminCertificates';
import CertificateCheckPage from '../../src/pages/CertificateCheckPage';
import CertificateCheckBanner from '../../src/components/CertificateCheckBanner';
import SeminarCard from '../../src/components/SeminarCard';
import { supabase } from '../../src/lib/supabase';
import { withCourseEnrollments, mapCourse } from '../../src/lib/courseService';
import '../../src/styles.css';

if (!import.meta.env.DEV) throw new Error('Development fixture only');
const courseId = '11111111-1111-4111-8111-111111111111';
const courses = [{ uuid: courseId, title: 'Математическое моделирование водных ресурсов', academicHours: 18 }];
const users = [{ id: '22222222-2222-4222-8222-222222222222', fullName: 'Тестовый Участник', email: 'fixture@example.invalid' }];
const records = [{ certificate_number: 'AQ-FIXTURE-1234', full_name: 'Тестовый Участник', course_name: courses[0].title,
  course_id: courseId, issued_at: '2026-09-15T00:00:00Z', academic_hours: 18, issuer: 'AQUAGEO.KZ', status: 'active', source: 'imported' },
  { certificate_number: 'AQ-REVOKED-1234', full_name: 'Архивный Участник', course_name: 'Архивный курс', course_id: null,
    issued_at: '2026-09-15T00:00:00Z', issuer: 'AQUAGEO.KZ', status: 'revoked', source: 'manual' }];
supabase.auth.getSession = async () => ({ data: { session: { access_token: 'fixture' } } });
const originalFetch = window.fetch;
window.fetch = async (input, init = {}) => {
  const url = new URL(input, window.location.origin);
  const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname.endsWith('/admin/certificates')) {
    if (init.method === 'POST') {
      const payload = JSON.parse(init.body);
      const number = payload.certificate_number || `AQ-M-${payload.request_id.replaceAll('-', '').toUpperCase()}`;
      if (records.some(item => item.certificate_number === number)) return respond({ message: 'Сертификат уже существует.' }, 409);
      const row = { ...payload, certificate_number: number, issued_at: payload.issued_on, source: 'manual', status: 'active' };
      records.unshift(row); return respond(row, 201);
    }
    const course = url.searchParams.get('course'), search = url.searchParams.get('search')?.toLowerCase();
    const items = records.filter(item => (!course || (course === 'external' ? !item.course_id : item.course_id === course)) &&
      (!search || `${item.full_name} ${item.course_name} ${item.certificate_number}`.toLowerCase().includes(search)));
    return respond({ items, count: items.length, page_size: 25 });
  }
  if (url.pathname.includes('/v1/verify/')) {
    const row = records.find(item => item.certificate_number === url.pathname.split('/').at(-1));
    return row ? respond({ ...row, valid: row.status === 'active' }) : respond({ message: 'Сертификат не найден.' }, 404);
  }
  throw new Error('Unexpected network request in fixture');
};
supabase.from = table => {
  if (table !== 'enrollments') throw new Error('Unexpected table');
  const request = { select: () => request, eq: (column, value) => { if (column !== 'user_id' || value !== 'fixture-user') throw new Error('Missing owner filter'); return request; },
    in: () => request, then: resolve => resolve({ data: [{ course_id: 'ongoing', completed_at: null }, { course_id: 'done', completed_at: '2026-09-15' }] }) };
  return request;
};
const inputRows = ['guest', 'ongoing', 'done'].map(id => ({ id, slug: id, title: id === 'guest' ? 'Новый курс' : id === 'ongoing' ? 'Мой текущий курс' : 'Завершённый курс',
  category: 'Водные ресурсы', image_url: '/image/aitu-logo.png', short_description: 'Материалы семинара и практические задания.', date_text: '15.09.2026' }));
const cards = (await withCourseEnrollments(inputRows, { id: 'fixture-user' })).map(row => mapCourse(row));
if (cards[0].enrollment || !cards[1].enrollment || !cards[2].enrollment.completed_at) throw new Error('Enrollment regression');
function Fixture() {
  if (new URLSearchParams(location.search).has('mobile')) return <iframe title="Мобильная версия" src="./certificates.html" style={{ width: 390, height: 900, border: '1px solid #ccc' }} />;
  return <MemoryRouter><main className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
    <div className="form-actions"><Link className="ghost-inline-button" to="/">Реестр</Link><Link className="ghost-inline-button" to="/cards">Карточки</Link><Link className="ghost-inline-button" to="/check-certificate">Проверка номера</Link></div>
    <p className="muted">Тестовые данные. Удалённая база не используется.</p>
    <Routes><Route path="/" element={<AdminCertificates courses={courses} users={users} />} />
      <Route path="/cards" element={<><div className="cards-grid">{cards.map(course => <SeminarCard key={course.uuid} seminar={course} />)}</div><CertificateCheckBanner /></>} />
      <Route path="/check-certificate" element={<CertificateCheckPage />} />
      <Route path="/learn/:slug" element={<h1>Материалы курса открыты</h1>} />
      <Route path="/register/:slug" element={<h1>Регистрация на новый курс</h1>} />
    </Routes>
  </main></MemoryRouter>;
}
const root = createRoot(document.getElementById('root')); root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => { root.unmount(); window.fetch = originalFetch; });
