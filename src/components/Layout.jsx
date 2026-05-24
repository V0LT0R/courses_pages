import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Главная' },
  { to: '/seminars', label: 'Семинары' },
  { to: '/materials', label: 'Материалы' },
  { to: '/news', label: 'Новости' },
  { to: '/questionnaire', label: 'Опросник' },
  { to: '/results', label: 'Результаты' },
];

export default function Layout() {
  const { isAuthenticated } = useAuth();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container header-inner">
          <NavLink to="/" className="logo">AQUAGEO.KZ</NavLink>
          <nav className="main-nav">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {item.label}
              </NavLink>
            ))}
            <NavLink to={isAuthenticated ? '/cabinet' : '/login'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Кабинет
            </NavLink>
          </nav>
          <NavLink to={isAuthenticated ? '/cabinet' : '/login'} className="cta-button small">{isAuthenticated ? 'Управление' : 'Войти'}</NavLink>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-line" />
        <div className="container footer-new">
          <div className="footer-left">
            <img src="/image/aitu-logo.png" alt="logo" className="footer-logo-img" />
          </div>
          <div className="footer-center">
            <NavLink to="/about">О ПРОЕКТЕ</NavLink>
            <NavLink to="/seminars">МОНИТОРИНГ</NavLink>
          </div>
          <div className="footer-right">
            <h3>Контакты</h3>
            <p>Tel: +7 747 300 0533</p>
            <p>Alexander.Neftissov@astanait.edu.kz</p>
            <p>Проспект Мангилик Ел, C1, Astana IT University, Есиль район, Астана, Казахстан</p>
            <p>9 AM — 6 PM</p>
          </div>
          <button className="scroll-top" onClick={scrollToTop}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 19V5M12 5L6 11M12 5L18 11" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
}
