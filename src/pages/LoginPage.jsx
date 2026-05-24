import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(form.email, form.password);
      navigate('/cabinet');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page-section top-spaced">
      <div className="container narrow-container">
        <div className="card content-card">
          <p className="eyebrow dark">Вход</p>
          <h1>Личный кабинет семинаров</h1>
          <p>Администратор управляет пользователями и всеми семинарами. Пользователь может создавать семинары и редактировать только свои записи.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>Email</span><input type="email" name="email" value={form.email} onChange={handleChange} required /></label>
            <label><span>Пароль</span><input type="password" name="password" value={form.password} onChange={handleChange} required /></label>
            {error ? <div className="error-text">{error}</div> : null}
            <button type="submit" className="cta-button">{loading ? 'Входим...' : 'Войти'}</button>
          </form>
        </div>
      </div>
    </section>
  );
}
