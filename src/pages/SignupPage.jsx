import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
  const navigate = useNavigate();
  const { registerStudent } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', passwordRepeat: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.passwordRepeat) {
      setError('Пароли не совпадают.');
      return;
    }

    try {
      setLoading(true);
      await registerStudent({ fullName: form.fullName, email: form.email, password: form.password });
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
          <p className="eyebrow dark">Регистрация</p>
          <h1>Создать аккаунт студента</h1>
          <p>Студент может записываться на семинары, смотреть свои курсы, отмечать разделы и отправлять данные для сертификата.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>ФИО</span><input name="fullName" value={form.fullName} onChange={handleChange} required /></label>
            <label><span>Email</span><input type="email" name="email" value={form.email} onChange={handleChange} required /></label>
            <label><span>Пароль</span><input type="password" name="password" value={form.password} onChange={handleChange} minLength="6" required /></label>
            <label><span>Повторите пароль</span><input type="password" name="passwordRepeat" value={form.passwordRepeat} onChange={handleChange} minLength="6" required /></label>
            {error ? <div className="error-text">{error}</div> : null}
            <button type="submit" className="cta-button">{loading ? 'Создаем...' : 'Зарегистрироваться'}</button>
            <Link to="/login" className="text-link">У меня уже есть аккаунт</Link>
          </form>
        </div>
      </div>
    </section>
  );
}
