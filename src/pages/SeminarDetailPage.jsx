import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest, resolveAssetUrl } from '../lib/api';

export default function SeminarDetailPage() {
  const { seminarId } = useParams();
  const [seminar, setSeminar] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    apiRequest(`/seminars/${seminarId}`)
      .then(setSeminar)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [seminarId]);

  const pdfUrl = useMemo(() => resolveAssetUrl(seminar?.pdf), [seminar?.pdf]);
  const viewerUrl = pdfUrl && !pdfUrl.includes('#') ? `${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1` : pdfUrl;

  if (loading) {
    return <section className="page-section top-spaced"><div className="container"><div className="card content-card">Загрузка...</div></div></section>;
  }

  if (error || !seminar) {
    return <section className="page-section top-spaced"><div className="container"><div className="card content-card error-card">{error || 'Семинар не найден.'}</div></div></section>;
  }

  return (
    <section className="page-section top-spaced">
      <div className="container detail-layout">
        <div className="detail-main">
          <div className="detail-hero card">
            <img src={seminar.image} alt={seminar.title} className="detail-image" />
            <div className="detail-content">
              <span className="badge">{seminar.category}</span>
              <h1>{seminar.title}</h1>
              <p className="lead-text">{seminar.description}</p>
              <div className="detail-meta">
                <span>{seminar.date}</span>
                <span>{seminar.duration}</span>
                <span>{seminar.format}</span>
              </div>
              <Link to={`/register/${seminar.id}`} className="cta-button">Зарегистрироваться</Link>
            </div>
          </div>

          <div className="card content-card">
            <h2>Чему научатся участники</h2>
            <ul className="styled-list">
              {seminar.outcomes.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>

          <div className="card content-card seminar-pdf-card">
            <div className="pdf-card-head">
              <div>
                <span className="badge">Материалы</span>
                <h2>PDF файл семинара</h2>
                <p>Презентация или методический материал отображается прямо на странице семинара.</p>
              </div>
              {pdfUrl ? (
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="cta-button small">Открыть в новой вкладке</a>
              ) : null}
            </div>

            {pdfUrl ? (
              <div className="seminar-pdf-viewer">
                <iframe title={`PDF: ${seminar.title}`} src={viewerUrl} />
              </div>
            ) : (
              <div className="pdf-empty-state">
                <strong>PDF еще не добавлен</strong>
                <p>Администратор может загрузить файл в кабинете при создании или редактировании семинара.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="detail-sidebar">
          <div className="card sidebar-card lecturer-card">
            <img src={seminar.lecturer.photo} alt={seminar.lecturer.name} className="lecturer-photo" />
            <h3>Лектор</h3>
            <strong>{seminar.lecturer.name}</strong>
            <p className="muted">{seminar.lecturer.role}</p>
            <p>{seminar.lecturer.bio}</p>
          </div>

          <div className="card sidebar-card">
            <h3>Автор записи</h3>
            <p>{seminar.author?.name} · {seminar.author?.role === 'admin' ? 'Администратор' : 'Пользователь'}</p>
          </div>

          <div className="card sidebar-card">
            <h3>Сертификат</h3>
            <p>{seminar.certificate ? 'После завершения выдается электронный сертификат участника.' : 'Сертификат не предусмотрен.'}</p>
          </div>

          <div className="card sidebar-card pdf-mini-card">
            <h3>PDF материал</h3>
            {pdfUrl ? <a className="text-link" href={pdfUrl} target="_blank" rel="noreferrer">Скачать / открыть PDF</a> : <p className="muted">Файл пока не прикреплен.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
