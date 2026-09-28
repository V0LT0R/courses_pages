import { Link } from 'react-router-dom';

export default function CertificateCheckBanner() {
  return <aside className="card certificate-check-banner">
    <div><h2>Проверка подлинности сертификата</h2><p>Введите номер с сертификата, чтобы проверить его владельца, курс и дату выдачи.</p></div>
    <Link className="cta-button" to="/check-certificate">Проверить сертификат</Link>
  </aside>;
}
