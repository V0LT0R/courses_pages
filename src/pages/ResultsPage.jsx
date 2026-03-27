import { questionnaireStats } from '../data/seminars';

export default function ResultsPage() {
  const bars = [
    ['Понравился курс', questionnaireStats.courseSatisfaction],
    ['Практическая ценность', questionnaireStats.practicalValue],
    ['Понятность лектора', questionnaireStats.lecturerClarity],
    ['Интерес к сертификату', questionnaireStats.certificateInterest],
  ];

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <div className="card results-card">
          <span className="badge">Результаты опросника</span>
          <h1>Сводная аналитика по отзывам участников</h1>
          <p>Этот блок можно подключить к базе данных и отображать результаты динамически после прохождения семинаров.</p>
          <div className="stats-grid large">
            <div className="stat-card"><strong>{questionnaireStats.totalResponses}</strong><span>всего ответов</span></div>
            <div className="stat-card"><strong>4.8 / 5</strong><span>средняя оценка курса</span></div>
            <div className="stat-card"><strong>89%</strong><span>готовы рекомендовать</span></div>
          </div>
          <div className="bar-chart">
            {bars.map(([label, value]) => (
              <div className="bar-row" key={label}>
                <div className="bar-label">{label}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${value}%` }} /></div>
                <div className="bar-value">{value}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
