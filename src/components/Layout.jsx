import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Главная' },
  { to: '/seminars', label: 'Семинары' },
  { to: '/materials', label: 'Материалы' },
  { to: '/news', label: 'Новости' },
  { to: '/questionnaire', label: 'Опросник' },
  { to: '/results', label: 'Результаты' },
];

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container header-inner">
          <NavLink to="/" className="logo">AQUAGEO.KZ</NavLink>
          <nav className="main-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/seminars" className="cta-button small">Мониторинг</NavLink>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <div className="logo footer-logo">AQUAGEO.KZ</div>
            <p>Платформа для мониторинга воды, обучения специалистов и публикации материалов семинаров.</p>
          </div>
          <div>
            <h4>Разделы</h4>
            <ul>
              <li>Семинары</li>
              <li>Регистрация</li>
              <li>Материалы в PDF</li>
              <li>Отзывы и опросы</li>
            </ul>
          </div>
          <div>
            <h4>Контакты</h4>
            <ul>
              <li>info@aquageo.kz</li>
              <li>+7 (700) 000-00-00</li>
              <li>Казахстан</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
