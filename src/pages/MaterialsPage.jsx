import { seminars } from '../data/seminars';

export default function MaterialsPage() {
  return (
    <section className="page-section top-spaced">
      <div className="container">
        <div className="card materials-card">
          <span className="badge">Материалы семинаров</span>
          <h1>Архив презентаций и методических файлов</h1>
          <p>В этом разделе материалы доступны только для просмотра в формате PDF.</p>
          <div className="materials-grid">
            <div className="materials-list">
              {seminars.map((seminar) => (
                <div className="material-item" key={seminar.id}>
                  <h3>{seminar.title}</h3>
                  <p>{seminar.date}</p>
                  <span className="text-link">PDF viewer</span>
                </div>
              ))}
            </div>
            <div className="pdf-viewer-frame">
              <iframe title="PDF материалы" src="/sample-seminar.pdf" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
