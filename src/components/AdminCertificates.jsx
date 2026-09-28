import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiRequest, API_URL, API_ORIGIN } from '../lib/api';
import { userMessage } from '../lib/errors';

async function adminRequest(path = '', options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Нужно войти в аккаунт.');
  return apiRequest(`/admin/certificates${path}`, { ...options, accessToken: session.access_token });
}
const blank = () => ({ request_id: crypto.randomUUID(), certificate_number: '', course_id: '', user_id: '',
  full_name: '', course_name: '', issued_on: new Date().toISOString().slice(0, 10),
  academic_hours: '', score: '', issuer: 'AQUAGEO.KZ', city: 'Астана' });
const sources = { course: 'После прохождения курса', manual: 'Выдан администратором', imported: 'Из архива PDF', legacy: 'Из прежнего реестра' };

function CertificateForm({ courses, users, onCreated, onCancel }) {
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function change(event) {
    const { name, value } = event.target;
    setForm(previous => {
      const next = { ...previous, [name]: value };
      if (name === 'course_id' && value) {
        const course = courses.find(item => item.uuid === value);
        next.course_name = course.title; next.academic_hours = course.academicHours ?? '';
      }
      if (name === 'user_id' && value) next.full_name = users.find(item => item.id === value).fullName || '';
      return next;
    });
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { onCreated(await adminRequest('', { method: 'POST', body: JSON.stringify(form) })); }
    catch (err) { setError(userMessage(err)); }
    finally { setBusy(false); }
  }
  return <form className="seminar-form card inset-card" onSubmit={submit}>
    <h3>Создать сертификат</h3>
    <p>Для ранее выданного сертификата укажите его исходный номер и дату. Для нового оставьте номер пустым — он будет создан автоматически.</p>
    <fieldset disabled={busy} className="certificate-fields"><div className="form-grid">
      <label><span>Курс в каталоге</span><select name="course_id" value={form.course_id} onChange={change}><option value="">Курс вне каталога</option>{courses.map(course => <option key={course.uuid} value={course.uuid}>{course.title}</option>)}</select></label>
      <label><span>Аккаунт участника</span><select name="user_id" value={form.user_id} onChange={change}><option value="">Без привязки к аккаунту</option>{users.map(user => <option key={user.id} value={user.id}>{user.fullName || user.name} · {user.email}</option>)}</select></label>
      <label className="full"><span>Название курса на сертификате</span><input name="course_name" value={form.course_name} onChange={change} required maxLength={300} /></label>
      <label className="full"><span>ФИО на сертификате</span><input name="full_name" value={form.full_name} onChange={change} required minLength={2} maxLength={120} /></label>
      <label><span>Номер сертификата</span><input name="certificate_number" value={form.certificate_number} onChange={change} pattern="[A-Za-z0-9_-]{8,128}" maxLength={128} placeholder="Присвоить автоматически" /></label>
      <label><span>Дата выдачи</span><input type="date" name="issued_on" value={form.issued_on} onChange={change} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} required /></label>
      <label><span>Академические часы · необязательно</span><input type="number" name="academic_hours" value={form.academic_hours} onChange={change} min={1} max={10000} step={1} /></label>
      <label><span>Оценка, % · необязательно</span><input type="number" name="score" value={form.score} onChange={change} min={0} max={100} step={1} /></label>
      <label><span>Организация</span><input name="issuer" value={form.issuer} onChange={change} required maxLength={160} /></label>
      <label><span>Город</span><input name="city" value={form.city} onChange={change} required maxLength={120} /></label>
    </div></fieldset>
    <p className="muted">Проверьте данные перед сохранением: они появятся в публичной проверке и PDF. Ручная выдача подтверждается администратором; прохождение теста на сайте не требуется.</p>
    {error && <div className="error-text" role="alert">{error}</div>}
    <div className="form-actions"><button className="cta-button" disabled={busy}>{busy ? 'Сохраняем…' : 'Создать сертификат'}</button><button className="ghost-inline-button" type="button" disabled={busy} onClick={onCancel}>Отмена</button></div>
  </form>;
}

export default function AdminCertificates({ courses, users, initialCourse = '' }) {
  const [course, setCourse] = useState(initialCourse);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState({ items: [], count: 0, page_size: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    adminRequest(`?${new URLSearchParams({ course, search, page: String(page) })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) })
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(err => { if (!controller.signal.aborted) setError(userMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [course, search, page, version]);
  return <section className="certificate-admin">
    <div className="toolbar-row"><h2>Все сертификаты</h2><button className="cta-button small" onClick={() => { setCreating(true); setCreated(null); }}>Создать сертификат</button></div>
    {creating && <CertificateForm courses={courses} users={users} onCancel={() => setCreating(false)} onCreated={cert => {
      setCreating(false); setCreated(cert); setPage(0); setCourse(''); setQuery(''); setSearch(''); setVersion(v => v + 1);
    }} />}
    {created && <div className="success-text" role="status">Сертификат {created.certificate_number} создан. <a className="text-link" href={`${API_ORIGIN}/verify/${created.certificate_number}`} target="_blank" rel="noreferrer">Открыть и проверить</a></div>}
    <form onSubmit={event => { event.preventDefault(); setPage(0); setSearch(query.trim()); setVersion(v => v + 1); }} className="seminar-form">
      <div className="form-grid">
        <label><span>Курс</span><select value={course} onChange={event => { setCourse(event.target.value); setPage(0); }}><option value="">Все курсы</option><option value="external">Курсы вне каталога</option>{courses.map(item => <option key={item.uuid} value={item.uuid}>{item.title}</option>)}</select></label>
        <label><span>ФИО, номер или название курса</span><input value={query} onChange={event => setQuery(event.target.value)} maxLength={160} type="search" /></label>
      </div><div className="form-actions"><button className="ghost-inline-button" disabled={loading}>Найти</button><button className="ghost-inline-button" type="button" disabled={loading} onClick={() => { setCourse(''); setQuery(''); setSearch(''); setPage(0); setVersion(v => v + 1); }}>Сбросить</button></div>
    </form>
    {loading && <p role="status">Загрузка сертификатов…</p>}
    {error && <div className="error-text" role="alert">{error} <button className="ghost-inline-button" onClick={() => setVersion(v => v + 1)}>Повторить</button></div>}
    {!loading && !error && <>
      <p className="muted">Найдено: {result.count}</p>
      <div className="admin-list">{result.items.map(cert => <article className="admin-list-item card" key={cert.certificate_number}>
        <div><strong>{cert.full_name}</strong><p>{cert.course_name}</p><p className="certificate-number">{cert.certificate_number}</p><p>{new Date(cert.issued_at).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} · {cert.status === 'revoked' ? 'Отозван' : 'Действителен'} · {sources[cert.source]}</p></div>
        <div className="item-actions"><a className="text-link" href={`${API_ORIGIN}/verify/${cert.certificate_number}`} target="_blank" rel="noreferrer">Проверить</a><a className="ghost-inline-button" href={`${API_URL}/certificates/${cert.certificate_number}/pdf`} target="_blank" rel="noreferrer">PDF</a></div>
      </article>)}</div>
      {!result.count && <p>Сертификаты по этим условиям не найдены.</p>}
      {result.count > result.page_size && <div className="form-actions"><button className="ghost-inline-button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Назад</button><span>Страница {page + 1} из {Math.ceil(result.count / result.page_size)}</span><button className="ghost-inline-button" disabled={(page + 1) * result.page_size >= result.count} onClick={() => setPage(p => p + 1)}>Далее</button></div>}
    </>}
  </section>;
}
