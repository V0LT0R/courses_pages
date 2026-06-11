import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { enrollInCourse, getCourseBySlug } from '../lib/courseService';

export default function RegisterPage() {
  const { seminarId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, registerStudent } = useAuth();
  const [seminar, setSeminar] = useState(null);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', passwordRepeat: '' });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCourseBySlug(seminarId, user)
      .then((course) => {
        setSeminar(course);
        if (!course) setError('Семинар не найден.');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [seminarId, user?.id, user?.role]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const enrollAndGo = async (courseUuid, slug) => {
    await enrollInCourse(courseUuid);
    navigate(`/learn/${slug}`);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!seminar) return;
    setError('');
    setMessage('');

    if (!agree) {
      setError('Подтвердите согласие на обработку данных.');
      return;
    }

    if (!isAuthenticated && form.password !== form.passwordRepeat) {
      setError('Пароли не совпадают.');
      return;
    }

    try {
      setSubmitting(true);
      if (!isAuthenticated) {
        await registerStudent({ fullName: form.fullName, email: form.email, password: form.password });
      }
      await enrollAndGo(seminar.uuid, seminar.slug);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <section className="page-section top-spaced"><div className="container"><div className="card content-card">Загрузка...</div></div></section>;
  }

  return (
    <section className="page-section top-spaced">
      <div className="container register-layout">
        <div className="card register-card">
          <span className="badge">Регистрация на семинар</span>
          <h1>{seminar?.title || 'Семинар'}</h1>
          {seminar ? <p>{seminar.date} · {seminar.format} · {seminar.location}</p> : null}

          {isAuthenticated ? (
            <div className="success-text">
              Вы вошли как <strong>{user?.fullName || user?.name}</strong>. Нажмите кнопку ниже, чтобы записаться на семинар.
            </div>
          ) : (
            <p className="muted">Создайте аккаунт студента. Email проверяется на уникальность, а полное имя потом используется для отправки данных на сертификат.</p>
          )}

          <form className="register-form" onSubmit={handleSubmit}>
            {!isAuthenticated ? (
              <div className="form-grid">
                <label>
                  <span>ФИО</span>
                  <input name="fullName" type="text" value={form.fullName} onChange={handleChange} placeholder="Введите полное имя" required />
                </label>
                <label>
                  <span>Email</span>
                  <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="name@example.com" required />
                </label>
                <label>
                  <span>Пароль</span>
                  <input name="password" type="password" value={form.password} onChange={handleChange} minLength="6" required />
                </label>
                <label>
                  <span>Повторите пароль</span>
                  <input name="passwordRepeat" type="password" value={form.passwordRepeat} onChange={handleChange} minLength="6" required />
                </label>
              </div>
            ) : null}

            <label className="checkbox-row">
              <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
              <span>Согласен(на) на обработку персональных данных и получение организационных уведомлений.</span>
            </label>

            {message ? <div className="success-text">{message}</div> : null}
            {error ? <div className="error-text">{error}</div> : null}

            <div className="form-actions">
              <button type="submit" className="cta-button" disabled={submitting || !seminar}>
                {submitting ? 'Сохраняем...' : 'Зарегистрироваться и открыть курс'}
              </button>
              {!isAuthenticated ? <Link to="/login" className="ghost-inline-button">Уже есть аккаунт</Link> : null}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
