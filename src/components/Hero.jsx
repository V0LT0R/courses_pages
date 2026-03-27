import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section className="hero-section grid-overlay">
      <div className="container hero-layout">
        <div className="hero-image-card">
          <img
            src="https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80"
            alt="Водные ресурсы"
          />
        </div>
        <div className="hero-content">
          <p className="eyebrow">Образовательный портал</p>
          <h1>Инновационная система семинаров и мониторинга водных ресурсов</h1>
          <p className="hero-text">
            Раздел обучения для размещения курсов, новостей, материалов семинаров, регистрации участников
            и сбора обратной связи в едином современном интерфейсе.
          </p>
          <div className="hero-actions">
            <Link to="/seminars" className="cta-button">Смотреть семинары</Link>
            <Link to="/materials" className="ghost-button">Материалы</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
