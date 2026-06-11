import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCourses } from '../lib/courseService';
import { useAuth } from '../context/AuthContext';

export default function MaterialsPage() {
  const { user } = useAuth();
  const [seminars, setSeminars] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCourses(user)
      .then(setSeminars)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user?.id, user?.role]);

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <div className="card materials-card">
          <span className="badge">Материалы семинаров</span>
          <h1>Материалы доступны внутри курсов</h1>
          <p>PDF, видео и текстовые блоки теперь хранятся в структуре разделов. Чтобы открыть материалы, зарегистрируйтесь на семинар и перейдите на страницу курса.</p>

          {loading ? <div className="card content-card">Загрузка материалов...</div> : null}
          {error ? <div className="card content-card error-card">{error}</div> : null}

          {!loading && !error ? (
            <div className="materials-list material-courses-list">
              {seminars.length ? seminars.map((seminar) => (
                <div className="material-item" key={seminar.uuid}>
                  <h3>{seminar.title}</h3>
                  <p>{seminar.date} · {seminar.format}</p>
                  <div className="card-actions left-actions">
                    <Link to={`/seminars/${seminar.slug}`} className="text-link">Описание</Link>
                    <Link to={`/register/${seminar.slug}`} className="cta-button small">Регистрация</Link>
                  </div>
                </div>
              )) : <div className="pdf-empty-state"><strong>Семинары пока не добавлены.</strong></div>}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
