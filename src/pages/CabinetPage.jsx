import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import SeminarForm from '../components/SeminarForm';

function UserCreateForm({ onCreate }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <form className="seminar-form" onSubmit={(e) => { e.preventDefault(); onCreate(form); setForm({ name: '', email: '', password: '', role: 'user' }); }}>
      <div className="form-grid">
        <label><span>Имя</span><input name="name" value={form.name} onChange={handleChange} required /></label>
        <label><span>Email</span><input name="email" type="email" value={form.email} onChange={handleChange} required /></label>
        <label><span>Пароль</span><input name="password" type="password" value={form.password} onChange={handleChange} required /></label>
        <label><span>Роль</span><select name="role" value={form.role} onChange={handleChange}><option value="user">Пользователь</option><option value="admin">Админ</option></select></label>
      </div>
      <div className="form-actions"><button className="cta-button" type="submit">Создать пользователя</button></div>
    </form>
  );
}

export default function CabinetPage() {
  const { user, isAdmin, logout } = useAuth();
  const [seminars, setSeminars] = useState([]);
  const [users, setUsers] = useState([]);
  const [editingSeminar, setEditingSeminar] = useState(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('seminars');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const visibleSeminars = useMemo(() => seminars, [seminars]);

  const loadData = async () => {
    setError('');
    try {
      const seminarsData = await apiRequest('/seminars');
      setSeminars(seminarsData);
      if (isAdmin) {
        const usersData = await apiRequest('/users');
        setUsers(usersData);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [isAdmin]);

  const handleCreateSeminar = async (payload) => {
    try {
      await apiRequest('/seminars', { method: 'POST', body: JSON.stringify(payload) });
      setMessage('Семинар создан.');
      setCreating(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateSeminar = async (payload) => {
    try {
      await apiRequest(`/seminars/${editingSeminar.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage('Семинар обновлен.');
      setEditingSeminar(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateUser = async (payload) => {
    try {
      await apiRequest('/users', { method: 'POST', body: JSON.stringify(payload) });
      setMessage('Пользователь создан.');
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <div className="card content-card">
          <div className="cabinet-header">
            <div>
              <p className="eyebrow dark">Кабинет</p>
              <h1>Управление семинарами</h1>
              <p>Вы вошли как <strong>{user?.name}</strong> ({isAdmin ? 'админ' : 'пользователь'}).</p>
            </div>
            <button className="ghost-inline-button" onClick={logout}>Выйти</button>
          </div>

          <div className="tab-row">
            <button className={`tab-button ${activeTab === 'seminars' ? 'active' : ''}`} onClick={() => setActiveTab('seminars')}>Семинары</button>
            {isAdmin ? <button className={`tab-button ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>Пользователи</button> : null}
          </div>

          {message ? <div className="success-text">{message}</div> : null}
          {error ? <div className="error-text">{error}</div> : null}

          {activeTab === 'seminars' ? (
            <>
              <div className="toolbar-row">
                <button className="cta-button small" onClick={() => { setCreating((prev) => !prev); setEditingSeminar(null); }}>
                  {creating ? 'Скрыть форму' : 'Создать семинар'}
                </button>
              </div>

              {creating ? <div className="card inset-card"><h3>Новый семинар</h3><SeminarForm submitText="Сохранить" onSubmit={handleCreateSeminar} onCancel={() => setCreating(false)} /></div> : null}

              {editingSeminar ? <div className="card inset-card"><h3>Редактирование семинара</h3><SeminarForm seminar={editingSeminar} submitText="Обновить" onSubmit={handleUpdateSeminar} onCancel={() => setEditingSeminar(null)} /></div> : null}

              <div className="admin-list">
                {visibleSeminars.map((seminar) => (
                  <div key={seminar.id} className="admin-list-item card">
                    <div>
                      <strong>{seminar.title}</strong>
                      <p>{seminar.date} · {seminar.location}</p>
                      <p>Автор: {seminar.author?.name} ({seminar.author?.role === 'admin' ? 'админ' : 'пользователь'})</p>
                      <p>{seminar.pdf ? 'PDF материал прикреплен' : 'PDF материал не добавлен'}</p>
                    </div>
                    <div className="item-actions">
                      <a className="text-link" href={`/seminars/${seminar.id}`}>Открыть</a>
                      {seminar.canEdit ? <button className="ghost-inline-button" onClick={() => { setEditingSeminar(seminar); setCreating(false); }}>Редактировать</button> : <span className="muted">Только просмотр</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {activeTab === 'users' && isAdmin ? (
            <>
              <div className="card inset-card"><h3>Создать пользователя</h3><UserCreateForm onCreate={handleCreateUser} /></div>
              <div className="admin-list">
                {users.map((item) => (
                  <div key={item.id} className="admin-list-item card">
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.email}</p>
                    </div>
                    <span className="badge">{item.role === 'admin' ? 'Админ' : 'Пользователь'}</span>
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
