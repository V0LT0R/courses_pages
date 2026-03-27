import { Link } from 'react-router-dom';
import Hero from '../components/Hero';
import SectionTitle from '../components/SectionTitle';
import SeminarCard from '../components/SeminarCard';
import { seminars, news, questionnaireStats } from '../data/seminars';

export default function HomePage() {
  return (
    <>
      <Hero />

      <section className="rounded-section light-section">
        <div className="container">
          <SectionTitle
            eyebrow="Цели проекта"
            title="Что должно быть на сайте"
            text="Структура ориентирована на страницы курсов в логике Coursera, но с визуальным стилем, согласованным с текущим дизайном сайта AQUAGEO.KZ."
          />

          <div className="feature-grid">
            {[
              'Опросник и отображение результатов на сайте',
              'История семинаров и размещение PDF-материалов',
              'Отдельные страницы курсов с описанием, лектором и сертификатом',
              'Отзывы на каждый семинар в формате оценки курса',
              'Новости о семинарах со ссылками на регистрацию',
              'Окно регистрации на отдельной странице'
            ].map((item) => (
              <div className="feature-card" key={item}>{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="container">
          <SectionTitle eyebrow="Курсы" title="Актуальные семинары" />
          <div className="cards-grid">
            {seminars.map((seminar) => (
              <SeminarCard key={seminar.id} seminar={seminar} />
            ))}
          </div>
        </div>
      </section>

      <section className="content-section alt-section">
        <div className="container two-column">
          <div className="info-panel">
            <SectionTitle eyebrow="Опросник" title="Сводные результаты обратной связи" />
            <div className="stats-grid">
              <div className="stat-card"><strong>{questionnaireStats.totalResponses}</strong><span>ответов</span></div>
              <div className="stat-card"><strong>{questionnaireStats.courseSatisfaction}%</strong><span>понравился курс</span></div>
              <div className="stat-card"><strong>{questionnaireStats.practicalValue}%</strong><span>видят практическую ценность</span></div>
              <div className="stat-card"><strong>{questionnaireStats.lecturerClarity}%</strong><span>оценили лектора</span></div>
            </div>
            <Link to="/results" className="text-link strong-link">Смотреть результаты полностью</Link>
          </div>

          <div className="info-panel dark-panel">
            <SectionTitle eyebrow="Новости" title="Ближайшие объявления" />
            <div className="news-list compact">
              {news.map((item) => (
                <div key={item.id} className="news-item">
                  <span>{item.date}</span>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
            <Link to="/news" className="cta-button small">Все новости</Link>
          </div>
        </div>
      </section>
    </>
  );
}
