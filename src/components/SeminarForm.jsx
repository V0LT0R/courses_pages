import { useEffect, useState } from 'react';
import { resolveAssetUrl, uploadPdfFile } from '../lib/api';

const initialState = {
  title: '',
  slug: '',
  category: '',
  date: '',
  duration: '',
  format: '',
  location: '',
  image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
  shortDescription: '',
  description: '',
  outcomesText: '',
  lecturerName: '',
  lecturerRole: '',
  lecturerBio: '',
  lecturerPhoto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
  certificate: true,
  rating: 5,
  pdf: '',
};

function mapSeminarToForm(seminar) {
  if (!seminar) return initialState;
  return {
    title: seminar.title || '',
    slug: seminar.id || '',
    category: seminar.category || '',
    date: seminar.date || '',
    duration: seminar.duration || '',
    format: seminar.format || '',
    location: seminar.location || '',
    image: seminar.image || initialState.image,
    shortDescription: seminar.shortDescription || '',
    description: seminar.description || '',
    outcomesText: (seminar.outcomes || []).join('\n'),
    lecturerName: seminar.lecturer?.name || '',
    lecturerRole: seminar.lecturer?.role || '',
    lecturerBio: seminar.lecturer?.bio || '',
    lecturerPhoto: seminar.lecturer?.photo || initialState.lecturerPhoto,
    certificate: Boolean(seminar.certificate),
    rating: seminar.rating || 5,
    pdf: seminar.pdf || '',
  };
}

export default function SeminarForm({ seminar, onSubmit, onCancel, submitText }) {
  const [form, setForm] = useState(initialState);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfUploadError, setPdfUploadError] = useState('');
  const [pdfUploadName, setPdfUploadName] = useState('');

  useEffect(() => {
    setForm(mapSeminarToForm(seminar));
    setPdfUploadError('');
    setPdfUploadName('');
  }, [seminar]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handlePdfUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPdfUploadError('');
    setPdfUploadName('');

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setPdfUploadError('Выберите файл в формате PDF.');
      event.target.value = '';
      return;
    }

    try {
      setUploadingPdf(true);
      const uploaded = await uploadPdfFile(file);
      setForm((prev) => ({ ...prev, pdf: uploaded.url }));
      setPdfUploadName(uploaded.originalName || file.name);
    } catch (err) {
      setPdfUploadError(err.message);
    } finally {
      setUploadingPdf(false);
      event.target.value = '';
    }
  };

  const handleRemovePdf = () => {
    setForm((prev) => ({ ...prev, pdf: '' }));
    setPdfUploadError('');
    setPdfUploadName('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      title: form.title,
      slug: form.slug,
      category: form.category,
      date: form.date,
      duration: form.duration,
      format: form.format,
      location: form.location,
      image: form.image,
      shortDescription: form.shortDescription,
      description: form.description,
      outcomes: form.outcomesText.split('\n').map((item) => item.trim()).filter(Boolean),
      lecturer: {
        name: form.lecturerName,
        role: form.lecturerRole,
        bio: form.lecturerBio,
        photo: form.lecturerPhoto,
      },
      certificate: form.certificate,
      rating: Number(form.rating || 5),
      pdf: form.pdf || null,
    });
  };

  const currentPdfUrl = resolveAssetUrl(form.pdf);

  return (
    <form className="seminar-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label><span>Название</span><input name="title" value={form.title} onChange={handleChange} required /></label>
        <label><span>Slug / URL</span><input name="slug" value={form.slug} onChange={handleChange} placeholder="naprimer-ai-seminar" /></label>
        <label><span>Категория</span><input name="category" value={form.category} onChange={handleChange} required /></label>
        <label><span>Дата</span><input name="date" value={form.date} onChange={handleChange} required /></label>
        <label><span>Длительность</span><input name="duration" value={form.duration} onChange={handleChange} required /></label>
        <label><span>Формат</span><input name="format" value={form.format} onChange={handleChange} required /></label>
        <label><span>Локация</span><input name="location" value={form.location} onChange={handleChange} required /></label>
        <label><span>Рейтинг</span><input name="rating" type="number" min="1" max="5" step="0.1" value={form.rating} onChange={handleChange} /></label>
        <label className="full"><span>Короткое описание</span><textarea name="shortDescription" value={form.shortDescription} onChange={handleChange} rows="3" required /></label>
        <label className="full"><span>Полное описание</span><textarea name="description" value={form.description} onChange={handleChange} rows="5" required /></label>
        <label className="full"><span>Результаты обучения — по одному пункту с новой строки</span><textarea name="outcomesText" value={form.outcomesText} onChange={handleChange} rows="5" /></label>
        <label><span>Фото семинара URL</span><input name="image" value={form.image} onChange={handleChange} required /></label>
        <label><span>Фото лектора URL</span><input name="lecturerPhoto" value={form.lecturerPhoto} onChange={handleChange} /></label>

        <div className="full pdf-upload-card">
          <div>
            <span className="form-label-title">PDF файл семинара</span>
            <p>Загрузите презентацию или методический файл. При редактировании можно выбрать новый PDF, и он заменит старую ссылку.</p>
          </div>
          <div className="pdf-upload-area">
            <input id="seminar-pdf-upload" type="file" accept="application/pdf,.pdf" onChange={handlePdfUpload} disabled={uploadingPdf} />
            <label htmlFor="seminar-pdf-upload" className="pdf-upload-button">
              {uploadingPdf ? 'Загрузка...' : 'Выбрать PDF файл'}
            </label>
            <span className="muted">Максимальный размер по умолчанию — 25 MB</span>
          </div>
          {pdfUploadName ? <div className="success-text compact">Загружен файл: {pdfUploadName}</div> : null}
          {pdfUploadError ? <div className="error-text compact">{pdfUploadError}</div> : null}
          {form.pdf ? (
            <div className="pdf-current-row">
              <span>Текущий PDF:</span>
              <a className="text-link" href={currentPdfUrl} target="_blank" rel="noreferrer">Открыть файл</a>
              <button type="button" className="ghost-inline-button small" onClick={handleRemovePdf}>Убрать PDF</button>
            </div>
          ) : (
            <div className="muted">PDF пока не прикреплен.</div>
          )}
        </div>

        <label className="full"><span>PDF URL / путь к файлу</span><input name="pdf" value={form.pdf || ''} onChange={handleChange} placeholder="После загрузки заполнится автоматически" /></label>
        <label><span>Лектор</span><input name="lecturerName" value={form.lecturerName} onChange={handleChange} /></label>
        <label><span>Должность лектора</span><input name="lecturerRole" value={form.lecturerRole} onChange={handleChange} /></label>
        <label className="full"><span>Био лектора</span><textarea name="lecturerBio" value={form.lecturerBio} onChange={handleChange} rows="4" /></label>
        <label className="checkbox-row"><input name="certificate" type="checkbox" checked={form.certificate} onChange={handleChange} /><span>Выдавать сертификат</span></label>
      </div>
      <div className="form-actions">
        <button type="submit" className="cta-button">{submitText}</button>
        {onCancel ? <button type="button" className="ghost-inline-button" onClick={onCancel}>Отмена</button> : null}
      </div>
    </form>
  );
}
