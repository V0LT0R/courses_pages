import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { enrollInCourse, getCourseBySlug, getEnrollment } from '../lib/courseService';

export default function SeminarDetailPage() {
  const { seminarId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [seminar, setSeminar] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const course = await getCourseBySlug(seminarId, user);
        if (!active) return;
        if (!course) {
          setError('Семинар не найден.');
          setSeminar(null);
          return;
        }
        setSeminar(course);
        if (isAuthenticated) {
          const currentEnrollment = await getEnrollment(course.uuid);
          if (active) setEnrollment(currentEnrollment);
        } else {
          setEnrollment(null);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [seminarId, user?.id, user?.role, isAuthenticated]);

  const handleEnroll = async () => {
    if (!seminar) return;
    if (!isAuthenticated) {
      navigate(`/register/${seminar.slug}`);
      return;
    }

    try {
      setEnrolling(true);
      await enrollInCourse(seminar.uuid);
      navigate(`/learn/${seminar.slug}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnrolling(false);
    }
  };

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
              <p className="lead-text course-lead-text">{seminar.description}</p>
              <div className="detail-meta">
                <span>{seminar.date}</span>
                <span>{seminar.duration}</span>
                <span>{seminar.format}</span>
              </div>
              <div className="hero-actions compact-actions">
                {enrollment ? (
                  <Link to={`/learn/${seminar.slug}`} className="cta-button">Перейти к материалам</Link>
                ) : (
                  <button className="cta-button" type="button" onClick={handleEnroll} disabled={enrolling}>
                    {enrolling ? 'Регистрируем...' : 'Зарегистрироваться на семинар'}
                  </button>
                )}
                {!isAuthenticated ? <Link to="/login" className="ghost-inline-button">Уже есть аккаунт</Link> : null}
              </div>
            </div>
          </div>

          <div className="card content-card">
            <h2>Чему научатся участники</h2>
            {seminar.outcomes?.length ? (
              <ul className="styled-list">
                {seminar.outcomes.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p>Менеджер пока не добавил результаты обучения.</p>
            )}
          </div>

          <div className="card content-card">
            <h2>Как устроены материалы</h2>
            <p>
              После регистрации откроется страница курса: слева будут разделы, справа — текстовые блоки,
              YouTube видео и PDF материалы в том порядке, который задал менеджер семинара.
            </p>
          </div>
        </div>

        <aside className="detail-sidebar">
          <div className="card sidebar-card lecturer-card">
            {seminar.lecturer.photo ? <img src={seminar.lecturer.photo} alt={seminar.lecturer.name} className="lecturer-photo" /> : null}
            <h3>Лектор</h3>
            <strong>{seminar.lecturer.name || 'Лектор не указан'}</strong>
            <p className="muted">{seminar.lecturer.role}</p>
            <p>{seminar.lecturer.bio}</p>
          </div>

          <div className="card sidebar-card">
            <h3>Сертификат</h3>
            <p>{seminar.certificate ? 'После отметки всех разделов появится кнопка получения сертификата.' : 'Сертификат не предусмотрен.'}</p>
          </div>

          <div className="card sidebar-card">
            <h3>Доступ</h3>
            <p>{enrollment ? 'Вы уже зарегистрированы на этот семинар.' : 'Материалы открываются после регистрации на семинар.'}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
