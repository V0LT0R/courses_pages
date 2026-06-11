import { useEffect, useState } from 'react';
import SectionTitle from '../components/SectionTitle';
import SeminarCard from '../components/SeminarCard';
import { listCourses } from '../lib/courseService';
import { useAuth } from '../context/AuthContext';

export default function SeminarsPage() {
  const { user } = useAuth();
  const [seminars, setSeminars] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listCourses(user)
      .then(setSeminars)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user?.id, user?.role]);

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <SectionTitle
          eyebrow="Каталог"
          title="Все семинары и тренинги"
          text="Выберите семинар, ознакомьтесь с описанием и зарегистрируйтесь. После регистрации материалы откроются в формате курса с разделами, видео, текстом и PDF."
        />

        {loading ? <div className="card content-card">Загрузка семинаров...</div> : null}
        {error ? <div className="card content-card error-card">{error}</div> : null}

        {!loading && !error ? (
          seminars.length ? (
            <div className="cards-grid">
              {seminars.map((seminar) => (
                <SeminarCard key={seminar.uuid} seminar={seminar} />
              ))}
            </div>
          ) : (
            <div className="card content-card">Семинары пока не добавлены.</div>
          )
        ) : null}
      </div>
    </section>
  );
}
