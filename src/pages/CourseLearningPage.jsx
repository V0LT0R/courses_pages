import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCourseForLearning, markSectionCompleted, requestCertificate } from '../lib/courseService';
import { getYoutubeEmbedUrl } from '../lib/youtube';

function ContentBlock({ block }) {
  if (block.type === 'text') {
    return (
      <div className="learning-block text-learning-block">
        {block.title ? <h3>{block.title}</h3> : null}
        <div className="rich-text-block">{block.content}</div>
      </div>
    );
  }

  if (block.type === 'youtube') {
    const embedUrl = getYoutubeEmbedUrl(block.content);
    return (
      <div className="learning-block video-learning-block">
        {block.title ? <h3>{block.title}</h3> : null}
        <div className="youtube-frame">
          <iframe
            title={block.title || 'YouTube video'}
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  if (block.type === 'pdf') {
    const viewerUrl = block.content && !block.content.includes('#') ? `${block.content}#toolbar=1&navpanes=0&scrollbar=1` : block.content;
    return (
      <div className="learning-block pdf-learning-block">
        <div className="pdf-card-head">
          <div>
            <span className="badge">PDF</span>
            <h3>{block.title || 'PDF материал'}</h3>
          </div>
          {block.content ? <a className="cta-button small" href={block.content} target="_blank" rel="noreferrer">Открыть отдельно</a> : null}
        </div>
        {block.content ? (
          <div className="seminar-pdf-viewer course-pdf-viewer">
            <iframe title={block.title || 'PDF'} src={viewerUrl} />
          </div>
        ) : (
          <div className="pdf-empty-state"><strong>PDF не прикреплен</strong></div>
        )}
      </div>
    );
  }

  if (block.type === 'image') {
    return (
      <div className="learning-block image-learning-block">
        {block.title ? <h3>{block.title}</h3> : null}
        {block.content ? (
          <img className="learning-image" src={block.content} alt={block.title || 'Фото материала'} />
        ) : (
          <div className="pdf-empty-state"><strong>Фото не прикреплено</strong></div>
        )}
      </div>
    );
  }

  return null;
}

export default function CourseLearningPage() {
  const { seminarId } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [sections, setSections] = useState([]);
  const [progress, setProgress] = useState([]);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [certificateResult, setCertificateResult] = useState(null);
  const [working, setWorking] = useState(false);

  const completedSectionIds = useMemo(
    () => new Set(progress.filter((item) => item.is_completed).map((item) => item.section_id)),
    [progress]
  );

  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeSectionId) || sections[0],
    [sections, activeSectionId]
  );

  const allCompleted = sections.length > 0 && sections.every((section) => completedSectionIds.has(section.id));
  const progressPercent = sections.length ? Math.round((completedSectionIds.size / sections.length) * 100) : 0;

  const loadCourse = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCourseForLearning(seminarId, user);
      setCourse(data.course);
      setSections(data.sections);
      setProgress(data.progress);
      setActiveSectionId((prev) => prev || data.sections[0]?.id || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourse();
  }, [seminarId, user?.id, user?.role]);

  const handleCompleteSection = async () => {
    if (!activeSection) return;
    setError('');
    setMessage('');
    setCertificateResult(null);
    try {
      setWorking(true);
      await markSectionCompleted(activeSection.id);
      await loadCourse();
      setMessage('Раздел отмечен как ознакомленный.');
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const handleCertificate = async () => {
    setError('');
    setMessage('');
    setCertificateResult(null);
    try {
      setWorking(true);
      const result = await requestCertificate({ course, profile: user });
      const response = result?.certificateResponse || {};
      setCertificateResult(response);
      setMessage('Сертификат успешно выпущен. Теперь его можно скачать или открыть страницу проверки.');
      await loadCourse();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <section className="page-section top-spaced"><div className="container"><div className="card content-card">Загрузка курса...</div></div></section>;
  }

  if (error && !course) {
    return (
      <section className="page-section top-spaced">
        <div className="container">
          <div className="card content-card error-card">{error}</div>
          <Link to={`/seminars/${seminarId}`} className="text-link">Вернуться к описанию семинара</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section top-spaced learning-page-section">
      <div className="learning-layout">
        <aside className="card learning-sidebar">
          <Link to={`/seminars/${course.slug}`} className="text-link">← Описание семинара</Link>
          <h2>{course.title}</h2>
          <div className="progress-mini">
            <div className="progress-mini-head"><span>Прогресс</span><strong>{progressPercent}%</strong></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPercent}%` }} /></div>
          </div>

          <div className="learning-section-list">
            {sections.map((section, index) => {
              const done = completedSectionIds.has(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`learning-section-button ${activeSection?.id === section.id ? 'active' : ''}`}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <span>{done ? '✓' : index + 1}</span>
                  <strong>{section.title}</strong>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="card learning-content-card">
          {error ? <div className="error-text">{error}</div> : null}
          {message ? <div className="success-text">{message}</div> : null}
          {certificateResult ? (
            <div className="certificate-result-card">
              <div>
                <strong>Сертификат выпущен</strong>
                {certificateResult.certificate_number ? <span>Номер: {certificateResult.certificate_number}</span> : null}
                {certificateResult.status ? <span>Статус: {certificateResult.status}</span> : null}
              </div>
              <div className="certificate-result-actions">
                {certificateResult.pdf_url ? (
                  <a className="cta-button small" href={certificateResult.pdf_url} target="_blank" rel="noreferrer">Скачать PDF</a>
                ) : null}
                {certificateResult.verify_url || certificateResult.verification_url ? (
                  <a className="ghost-inline-button" href={certificateResult.verify_url || certificateResult.verification_url} target="_blank" rel="noreferrer">Открыть проверку</a>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeSection ? (
            <>
              <div className="learning-content-head">
                <span className="badge">Раздел</span>
                <h1>{activeSection.title}</h1>
                {activeSection.description ? <p>{activeSection.description}</p> : null}
              </div>

              <div className="learning-blocks-list">
                {activeSection.blocks.length ? (
                  activeSection.blocks.map((block) => <ContentBlock key={block.id} block={block} />)
                ) : (
                  <div className="pdf-empty-state"><strong>Материалы в этом разделе пока не добавлены.</strong></div>
                )}
              </div>

              <div className="learning-bottom-actions">
                <button
                  type="button"
                  className="cta-button"
                  onClick={handleCompleteSection}
                  disabled={working || completedSectionIds.has(activeSection.id)}
                >
                  {completedSectionIds.has(activeSection.id) ? 'Раздел уже отмечен' : 'Ознакомлен с разделом'}
                </button>

                {allCompleted && course.certificate ? (
                  <button type="button" className="ghost-inline-button certificate-action" onClick={handleCertificate} disabled={working}>
                    Получить сертификат
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="pdf-empty-state"><strong>Разделы пока не добавлены.</strong></div>
          )}
        </main>
      </div>
    </section>
  );
}
