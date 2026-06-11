import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SeminarForm from '../components/SeminarForm';
import {
  createManager,
  getCourseForEdit,
  listCourses,
  listMyEnrollments,
  listProfiles,
  saveCourseWithContent,
} from '../lib/courseService';

function ProfileForm({ user, onSave }) {
  const [form, setForm] = useState({
    fullName: user?.fullName || user?.name || '',
    organization: user?.organization || '',
    phone: user?.phone || '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      fullName: user?.fullName || user?.name || '',
      organization: user?.organization || '',
      phone: user?.phone || '',
    });
  }, [user?.id, user?.fullName, user?.name, user?.organization, user?.phone]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await onSave(form);
      setMessage('Профиль обновлен.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="seminar-form" onSubmit={handleSubmit}>
      <div className="form-grid profile-grid">
        <label><span>ФИО</span><input name="fullName" value={form.fullName} onChange={handleChange} required /></label>
        <label><span>Организация</span><input name="organization" value={form.organization} onChange={handleChange} placeholder="Необязательно" /></label>
        <label><span>Телефон</span><input name="phone" value={form.phone} onChange={handleChange} placeholder="Необязательно" /></label>
      </div>
      {message ? <div className="success-text">{message}</div> : null}
      {error ? <div className="error-text">{error}</div> : null}
      <div className="form-actions"><button className="cta-button" type="submit" disabled={saving}>{saving ? 'Сохраняем...' : 'Сохранить профиль'}</button></div>
    </form>
  );
}

function ManagerCreateForm({ onCreate }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      await onCreate(form);
      setForm({ fullName: '', email: '', password: '' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <form className="seminar-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label><span>ФИО менеджера</span><input name="fullName" value={form.fullName} onChange={handleChange} required /></label>
        <label><span>Email</span><input name="email" type="email" value={form.email} onChange={handleChange} required /></label>
        <label><span>Временный пароль</span><input name="password" type="password" value={form.password} onChange={handleChange} minLength="6" required /></label>
      </div>
      <div className="form-actions"><button className="cta-button" type="submit" disabled={creating}>{creating ? 'Создаем...' : 'Создать менеджера'}</button></div>
    </form>
  );
}

function RoleBadge({ role }) {
  const label = role === 'admin' ? 'Админ' : role === 'manager' ? 'Менеджер' : 'Студент';
  return <span className="badge">{label}</span>;
}

export default function CabinetPage() {
  const { user, isAdmin, isManager, canManageSeminars, logout, saveProfile } = useAuth();
  const [seminars, setSeminars] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [users, setUsers] = useState([]);
  const [editingSeminar, setEditingSeminar] = useState(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const managedSeminars = useMemo(() => {
    if (isAdmin) return seminars;
    if (isManager) return seminars.filter((seminar) => seminar.createdBy === user?.id);
    return [];
  }, [seminars, isAdmin, isManager, user]);

  const loadData = async () => {
    setError('');
    setLoading(true);
    try {
      const requests = [listCourses(user), listMyEnrollments(user)];
      if (isAdmin) requests.push(listProfiles());
      const [seminarsData, enrollmentsData, usersData] = await Promise.all(requests);
      setSeminars(seminarsData);
      setEnrollments(enrollmentsData);
      if (isAdmin) setUsers(usersData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user?.id, user?.role, isAdmin]);

  const handleCreateSeminar = async (payload) => {
    try {
      await saveCourseWithContent(payload, user);
      setMessage('Семинар создан.');
      setCreating(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateSeminar = async (payload) => {
    try {
      await saveCourseWithContent(payload, user, editingSeminar.uuid);
      setMessage('Семинар обновлен.');
      setEditingSeminar(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStartEdit = async (seminar) => {
    setError('');
    try {
      const course = await getCourseForEdit(seminar.uuid, user);
      setEditingSeminar(course);
      setCreating(false);
      setActiveTab('seminars');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateManager = async (payload) => {
    try {
      await createManager(payload);
      setMessage('Менеджер создан.');
      await loadData();
    } catch (err) {
      setError(`${err.message}. Проверьте, что Supabase Edge Function create-manager развернута.`);
    }
  };

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <div className="card content-card">
          <div className="cabinet-header">
            <div>
              <p className="eyebrow dark">Кабинет</p>
              <h1>{canManageSeminars ? 'Управление семинарами' : 'Мой профиль'}</h1>
              <p>Вы вошли как <strong>{user?.fullName || user?.name}</strong> · <RoleBadge role={user?.role} /></p>
            </div>
            <button className="ghost-inline-button" onClick={logout}>Выйти</button>
          </div>

          <div className="tab-row">
            <button className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Профиль</button>
            <button className={`tab-button ${activeTab === 'myCourses' ? 'active' : ''}`} onClick={() => setActiveTab('myCourses')}>Мои семинары</button>
            {canManageSeminars ? <button className={`tab-button ${activeTab === 'seminars' ? 'active' : ''}`} onClick={() => setActiveTab('seminars')}>Управление курсами</button> : null}
            {isAdmin ? <button className={`tab-button ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>Пользователи</button> : null}
          </div>

          {loading ? <div className="card inset-card">Загрузка данных...</div> : null}
          {message ? <div className="success-text">{message}</div> : null}
          {error ? <div className="error-text">{error}</div> : null}

          {activeTab === 'profile' ? (
            <div className="card inset-card">
              <h3>Данные профиля</h3>
              <ProfileForm user={user} onSave={saveProfile} />
            </div>
          ) : null}

          {activeTab === 'myCourses' ? (
            <div className="admin-list">
              {enrollments.length ? enrollments.map((item) => (
                <div key={item.id} className="admin-list-item card">
                  <div>
                    <strong>{item.course?.title}</strong>
                    <p>{item.course?.date} · {item.course?.format}</p>
                    <p>{item.completed_at ? 'Завершен' : 'В процессе'}</p>
                  </div>
                  <div className="item-actions">
                    <Link className="cta-button small" to={`/learn/${item.course?.slug}`}>Перейти</Link>
                    <Link className="text-link" to={`/seminars/${item.course?.slug}`}>Описание</Link>
                  </div>
                </div>
              )) : <div className="card inset-card">Вы пока не зарегистрированы на семинары.</div>}
            </div>
          ) : null}

          {activeTab === 'seminars' && canManageSeminars ? (
            <>
              <div className="toolbar-row">
                <button className="cta-button small" onClick={() => { setCreating((prev) => !prev); setEditingSeminar(null); }}>
                  {creating ? 'Скрыть форму' : 'Создать семинар'}
                </button>
              </div>

              {creating ? (
                <div className="card inset-card">
                  <h3>Новый семинар</h3>
                  <SeminarForm submitText="Сохранить" onSubmit={handleCreateSeminar} onCancel={() => setCreating(false)} />
                </div>
              ) : null}

              {editingSeminar ? (
                <div className="card inset-card">
                  <h3>Редактирование семинара</h3>
                  <SeminarForm seminar={editingSeminar} submitText="Обновить" onSubmit={handleUpdateSeminar} onCancel={() => setEditingSeminar(null)} />
                </div>
              ) : null}

              <div className="admin-list">
                {managedSeminars.length ? managedSeminars.map((seminar) => (
                  <div key={seminar.uuid} className="admin-list-item card">
                    <div>
                      <strong>{seminar.title}</strong>
                      <p>{seminar.date} · {seminar.location}</p>
                      <p>{seminar.createdBy === user?.id ? 'Ваш семинар' : 'Создан другим менеджером'}</p>
                    </div>
                    <div className="item-actions">
                      <Link className="text-link" to={`/seminars/${seminar.slug}`}>Открыть</Link>
                      <button className="ghost-inline-button" onClick={() => handleStartEdit(seminar)}>Редактировать</button>
                    </div>
                  </div>
                )) : <div className="card inset-card">Семинары пока не созданы.</div>}
              </div>
            </>
          ) : null}

          {activeTab === 'users' && isAdmin ? (
            <>
              <div className="card inset-card">
                <h3>Создать менеджера</h3>
                <p className="muted">Студенты регистрируются сами. Менеджера создает только администратор через Supabase Edge Function.</p>
                <ManagerCreateForm onCreate={handleCreateManager} />
              </div>
              <div className="admin-list">
                {users.map((item) => (
                  <div key={item.id} className="admin-list-item card">
                    <div>
                      <strong>{item.fullName || item.name}</strong>
                      <p>{item.email}</p>
                    </div>
                    <RoleBadge role={item.role} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
