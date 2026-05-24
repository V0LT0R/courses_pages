import { useEffect, useMemo, useState } from 'react';
import { apiRequest, resolveAssetUrl } from '../lib/api';

export default function MaterialsPage() {
  const [seminars, setSeminars] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/seminars')
      .then((data) => {
        setSeminars(data);
        const firstWithPdf = data.find((item) => item.pdf) || data[0];
        setSelectedId(firstWithPdf?.id || '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedSeminar = useMemo(
    () => seminars.find((item) => item.id === selectedId) || seminars[0],
    [seminars, selectedId]
  );

  const pdfUrl = resolveAssetUrl(selectedSeminar?.pdf);
  const viewerUrl = pdfUrl && !pdfUrl.includes('#') ? `${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1` : pdfUrl;

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <div className="card materials-card">
          <span className="badge">Материалы семинаров</span>
          <h1>Архив презентаций и методических файлов</h1>
          <p>Здесь отображаются PDF файлы, которые были загружены в кабинете при создании или редактировании семинара.</p>

          {loading ? <div className="card content-card">Загрузка материалов...</div> : null}
          {error ? <div className="card content-card error-card">{error}</div> : null}

          {!loading && !error ? (
            <div className="materials-grid">
              <div className="materials-list">
                {seminars.map((seminar) => (
                  <button
                    type="button"
                    className={`material-item material-button ${seminar.id === selectedSeminar?.id ? 'active' : ''}`}
                    key={seminar.id}
                    onClick={() => setSelectedId(seminar.id)}
                  >
                    <h3>{seminar.title}</h3>
                    <p>{seminar.date}</p>
                    <span className={seminar.pdf ? 'text-link' : 'muted'}>{seminar.pdf ? 'PDF доступен' : 'PDF не добавлен'}</span>
                  </button>
                ))}
              </div>
              <div className="pdf-viewer-frame pretty-pdf-frame">
                {pdfUrl ? (
                  <iframe title={`PDF: ${selectedSeminar.title}`} src={viewerUrl} />
                ) : (
                  <div className="pdf-empty-state inside-frame">
                    <strong>Выберите семинар с PDF файлом</strong>
                    <p>Если файл не отображается, загрузите PDF в кабинете управления.</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
