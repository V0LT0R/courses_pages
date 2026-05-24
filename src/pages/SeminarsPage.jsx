import { useEffect, useState } from 'react';
import SectionTitle from '../components/SectionTitle';
import SeminarCard from '../components/SeminarCard';
import { apiRequest } from '../lib/api';

export default function SeminarsPage() {
  const [seminars, setSeminars] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/seminars')
      .then(setSeminars)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <SectionTitle
          eyebrow="Каталог"
          title="Все семинары и тренинги"
          text="Теперь каталог берется из PostgreSQL через API. Администратор управляет всеми семинарами и пользователями, а обычный пользователь может добавлять семинары и редактировать только свои."
        />

        {loading ? <div className="card content-card">Загрузка семинаров...</div> : null}
        {error ? <div className="card content-card error-card">{error}</div> : null}

        {!loading && !error ? (
          <div className="cards-grid">
            {seminars.map((seminar) => (
              <SeminarCard key={seminar.id} seminar={seminar} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
