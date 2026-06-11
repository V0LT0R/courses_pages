import { Link } from 'react-router-dom';

export default function SeminarCard({ seminar }) {
  return (
    <article className="card seminar-card">
      <img src={seminar.image} alt={seminar.title} className="card-image" />
      <div className="card-body">
        <div className="card-badge-row">
          <span className="badge">{seminar.category}</span>
          {seminar.certificate ? <span className="pdf-chip">Сертификат</span> : null}
        </div>
        <h3>{seminar.title}</h3>
        <p>{seminar.shortDescription}</p>
        <div className="meta-row">
          <span>{seminar.date}</span>
          <span>⭐ {seminar.rating}</span>
        </div>
        <div className="card-actions">
          <Link to={`/seminars/${seminar.slug || seminar.id}`} className="text-link">Подробнее</Link>
          <Link to={`/register/${seminar.slug || seminar.id}`} className="cta-button small">Регистрация</Link>
        </div>
      </div>
    </article>
  );
}
