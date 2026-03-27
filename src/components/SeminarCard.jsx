import { Link } from 'react-router-dom';

export default function SeminarCard({ seminar }) {
  return (
    <article className="card seminar-card">
      <img src={seminar.image} alt={seminar.title} className="card-image" />
      <div className="card-body">
        <span className="badge">{seminar.category}</span>
        <h3>{seminar.title}</h3>
        <p>{seminar.shortDescription}</p>
        <div className="meta-row">
          <span>{seminar.date}</span>
          <span>⭐ {seminar.rating}</span>
        </div>
        <div className="card-actions">
          <Link to={`/seminars/${seminar.id}`} className="text-link">Подробнее</Link>
          <Link to={`/register/${seminar.id}`} className="cta-button small">Регистрация</Link>
        </div>
      </div>
    </article>
  );
}
