import { useParams } from 'react-router-dom';
import { seminars } from '../data/seminars';

export default function RegisterPage() {
  const { seminarId } = useParams();
  const seminar = seminars.find((item) => item.id === seminarId) || seminars[0];

  return (
    <section className="page-section top-spaced">
      <div className="container register-layout">
        <div className="card register-card">
          <span className="badge">Регистрация на семинар</span>
          <h1>{seminar.title}</h1>
          <p>{seminar.date} · {seminar.format} · {seminar.location}</p>

          <form className="register-form">
            <div className="form-grid">
              <label>
                ФИО
                <input type="text" placeholder="Введите полное имя" />
              </label>
              <label>
                Email
                <input type="email" placeholder="name@example.com" />
              </label>
              <label>
                Организация
                <input type="text" placeholder="Университет / компания" />
              </label>
              <label>
                Телефон
                <input type="text" placeholder="+7 (...)" />
              </label>
            </div>
            <label>
              Цель участия
              <textarea rows="5" placeholder="Кратко опишите, зачем хотите пройти семинар"></textarea>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" />
              <span>Согласен(на) на обработку персональных данных и получение организационных уведомлений.</span>
            </label>
            <button type="button" className="cta-button">Отправить заявку</button>
          </form>
        </div>
      </div>
    </section>
  );
}
