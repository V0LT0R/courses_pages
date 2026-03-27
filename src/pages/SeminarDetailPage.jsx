import { Link, useParams } from 'react-router-dom';
import { seminars } from '../data/seminars';

export default function SeminarDetailPage() {
  const { seminarId } = useParams();
  const seminar = seminars.find((item) => item.id === seminarId) || seminars[0];

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

          <div className="card content-card">
            <h2>Отзывы о семинаре</h2>
            <div className="review-list">
              {seminar.reviews.map((review) => (
                <div className="review-card" key={`${review.author}-${review.text}`}>
                  <div className="review-head">
                    <strong>{review.author}</strong>
                    <span>{'★'.repeat(review.rating)}</span>
                  </div>
                  <p>{review.text}</p>
                </div>
              ))}
            </div>
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
            <h3>Сертификат</h3>
            <p>{seminar.certificate ? 'После завершения выдается электронный сертификат участника.' : 'Сертификат не предусмотрен.'}</p>
          </div>

          <div className="card sidebar-card">
            <h3>Материалы</h3>
            <p>Материалы доступны только для просмотра в формате PDF.</p>
            <Link to="/materials" className="text-link">Перейти к материалам</Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
