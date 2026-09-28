import { useEffect, useRef, useState } from 'react';
import { apiRequest, API_URL } from '../lib/api';
import { userMessage } from '../lib/errors';

export default function CertificateCheckPage() {
  const [number, setNumber] = useState('');
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function check(event) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setCertificate(null); setError('');
    const value = number.trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
      setError('Введите номер полностью: от 8 до 128 латинских букв, цифр, дефисов или подчёркиваний.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiRequest(`/v1/verify/${encodeURIComponent(value)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
      if (!controller.signal.aborted) setCertificate(result);
    } catch (err) {
      if (!controller.signal.aborted) setError(userMessage(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <section className="page-section top-spaced"><div className="container certificate-check-page">
    <div className="card content-card">
      <p className="eyebrow dark">Реестр сертификатов</p>
      <h1>Проверка подлинности</h1>
      <p>Укажите номер, напечатанный внизу сертификата. Проверка доступна без регистрации.</p>
      <form onSubmit={check} className="seminar-form">
        <div className="form-grid"><label className="full"><span>Номер сертификата</span>
          <input value={number} onChange={event => { request.current?.abort(); setLoading(false); setNumber(event.target.value); setCertificate(null); setError(''); }}
            maxLength={128} required autoCapitalize="off" spellCheck={false} placeholder="AQ-20260915-…" />
        </label></div>
        <div className="form-actions"><button className="cta-button" disabled={loading}>{loading ? 'Проверяем…' : 'Проверить сертификат'}</button></div>
      </form>
      {error && <div className="error-text" role="alert">{error}</div>}
      {certificate && <section className="certificate-result" aria-live="polite">
        <div className={certificate.valid ? 'success-text' : 'error-text'}><strong>{certificate.valid ? 'Сертификат действителен' : 'Сертификат отозван'}</strong></div>
        <dl className="certificate-facts">
          <div><dt>ФИО</dt><dd>{certificate.full_name}</dd></div>
          <div><dt>Курс</dt><dd>{certificate.course_name}</dd></div>
          <div><dt>Номер</dt><dd>{certificate.certificate_number}</dd></div>
          <div><dt>Дата выдачи</dt><dd>{new Date(certificate.issued_at).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}</dd></div>
          {certificate.academic_hours && <div><dt>Академические часы</dt><dd>{certificate.academic_hours}</dd></div>}
          <div><dt>Организация</dt><dd>{certificate.issuer}</dd></div>
        </dl>
        <a className="text-link" target="_blank" rel="noreferrer" href={`${API_URL}/certificates/${encodeURIComponent(certificate.certificate_number)}/pdf`}>Открыть сертификат PDF</a>
      </section>}
    </div>
  </div></section>;
}
