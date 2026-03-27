import SectionTitle from '../components/SectionTitle';
import SeminarCard from '../components/SeminarCard';
import { seminars } from '../data/seminars';

export default function SeminarsPage() {
  return (
    <section className="page-section top-spaced">
      <div className="container">
        <SectionTitle
          eyebrow="Каталог"
          title="Все семинары и тренинги"
          text="Для каждого курса предусмотрена отдельная страница: описание, программа, информация о лекторе, ожидаемые результаты обучения, сертификат, отзывы и регистрация."
        />
        <div className="cards-grid">
          {seminars.map((seminar) => (
            <SeminarCard key={seminar.id} seminar={seminar} />
          ))}
        </div>
      </div>
    </section>
  );
}
