import { Link } from 'react-router-dom';
import { news } from '../data/seminars';

export default function NewsPage() {
  return (
    <section className="page-section top-spaced">
      <div className="container">
        <div className="section-title">
          <p className="eyebrow dark">Новости</p>
          <h1>Новости о семинарах</h1>
          <p className="section-text">В каждой новости есть ссылка на регистрацию на соответствующий семинар.</p>
        </div>
        <div className="news-list expanded">
          {news.map((item) => (
            <article className="card news-card" key={item.id}>
              <span className="muted">{item.date}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <Link to={`/register/${item.seminarId}`} className="cta-button small">Регистрация</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
