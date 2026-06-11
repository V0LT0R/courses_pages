import { useEffect, useMemo, useState } from 'react';
import { normalizeSlug, uploadCourseImage, uploadCoursePdf } from '../lib/courseService';

const defaultImage = 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80';
const defaultLecturerPhoto = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80';

const initialState = {
  title: '',
  slug: '',
  category: '',
  date: '',
  duration: '',
  format: '',
  location: '',
  image: defaultImage,
  shortDescription: '',
  description: '',
  outcomesText: '',
  lecturerName: '',
  lecturerRole: '',
  lecturerBio: '',
  lecturerPhoto: defaultLecturerPhoto,
  certificate: true,
  rating: 5,
};

function createSection(index = 1) {
  return {
    localId: crypto.randomUUID(),
    title: `Раздел ${index}`,
    description: '',
    blocks: [],
  };
}

function createBlock(type) {
  return {
    localId: crypto.randomUUID(),
    type,
    title: '',
    content: '',
    filePath: '',
  };
}

function mapSeminarToForm(seminar) {
  if (!seminar) return initialState;
  return {
    title: seminar.title || '',
    slug: seminar.slug || seminar.id || '',
    category: seminar.category || '',
    date: seminar.date || '',
    duration: seminar.duration || '',
    format: seminar.format || '',
    location: seminar.location || '',
    image: seminar.image || defaultImage,
    shortDescription: seminar.shortDescription || '',
    description: seminar.description || '',
    outcomesText: (seminar.outcomes || []).join('\n'),
    lecturerName: seminar.lecturer?.name || '',
    lecturerRole: seminar.lecturer?.role || '',
    lecturerBio: seminar.lecturer?.bio || '',
    lecturerPhoto: seminar.lecturer?.photo || defaultLecturerPhoto,
    certificate: Boolean(seminar.certificate),
    rating: seminar.rating || 5,
  };
}

function mapSections(seminar) {
  if (!seminar?.sections?.length) return [createSection(1)];
  return seminar.sections.map((section, sectionIndex) => ({
    localId: section.id || crypto.randomUUID(),
    id: section.id,
    title: section.title || `Раздел ${sectionIndex + 1}`,
    description: section.description || '',
    blocks: (section.blocks || []).map((block) => ({
      localId: block.id || crypto.randomUUID(),
      id: block.id,
      type: block.type,
      title: block.title || '',
      content: block.content || '',
      filePath: block.filePath || '',
    })),
  }));
}

export default function SeminarForm({ seminar, onSubmit, onCancel, submitText }) {
  const [form, setForm] = useState(initialState);
  const [sections, setSections] = useState([createSection(1)]);
  const [uploadingKey, setUploadingKey] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(mapSeminarToForm(seminar));
    setSections(mapSections(seminar));
    setUploadError('');
    setUploadingKey('');
    setFormError('');
    setSubmitting(false);
  }, [seminar]);

  const generatedSlug = useMemo(() => normalizeSlug(form.slug || form.title), [form.slug, form.title]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const updateSection = (sectionIndex, patch) => {
    setSections((prev) => prev.map((section, index) => index === sectionIndex ? { ...section, ...patch } : section));
  };

  const addSection = () => setSections((prev) => [...prev, createSection(prev.length + 1)]);

  const removeSection = (sectionIndex) => {
    setSections((prev) => prev.length === 1 ? prev : prev.filter((_, index) => index !== sectionIndex));
  };

  const moveSection = (sectionIndex, direction) => {
    setSections((prev) => {
      const next = [...prev];
      const target = sectionIndex + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[sectionIndex], next[target]] = [next[target], next[sectionIndex]];
      return next;
    });
  };

  const addBlock = (sectionIndex, type) => {
    setSections((prev) => prev.map((section, index) => {
      if (index !== sectionIndex) return section;
      return { ...section, blocks: [...section.blocks, createBlock(type)] };
    }));
  };

  const updateBlock = (sectionIndex, blockIndex, patch) => {
    setSections((prev) => prev.map((section, sIndex) => {
      if (sIndex !== sectionIndex) return section;
      return {
        ...section,
        blocks: section.blocks.map((block, bIndex) => bIndex === blockIndex ? { ...block, ...patch } : block),
      };
    }));
  };

  const removeBlock = (sectionIndex, blockIndex) => {
    setSections((prev) => prev.map((section, sIndex) => {
      if (sIndex !== sectionIndex) return section;
      return { ...section, blocks: section.blocks.filter((_, bIndex) => bIndex !== blockIndex) };
    }));
  };

  const moveBlock = (sectionIndex, blockIndex, direction) => {
    setSections((prev) => prev.map((section, sIndex) => {
      if (sIndex !== sectionIndex) return section;
      const blocks = [...section.blocks];
      const target = blockIndex + direction;
      if (target < 0 || target >= blocks.length) return section;
      [blocks[blockIndex], blocks[target]] = [blocks[target], blocks[blockIndex]];
      return { ...section, blocks };
    }));
  };

  const handlePdfUpload = async (sectionIndex, blockIndex, file) => {
    if (!file) return;
    const key = `${sectionIndex}-${blockIndex}`;
    setUploadError('');
    setUploadingKey(key);
    try {
      const uploaded = await uploadCoursePdf(file);
      updateBlock(sectionIndex, blockIndex, {
        title: sections[sectionIndex].blocks[blockIndex].title || uploaded.originalName,
        content: uploaded.url,
        filePath: uploaded.path,
      });
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadingKey('');
    }
  };

  const handleImageUpload = async (sectionIndex, blockIndex, file) => {
    if (!file) return;
    const key = `image-${sectionIndex}-${blockIndex}`;
    setUploadError('');
    setUploadingKey(key);
    try {
      const uploaded = await uploadCourseImage(file);
      updateBlock(sectionIndex, blockIndex, {
        title: sections[sectionIndex].blocks[blockIndex].title || uploaded.originalName,
        content: uploaded.url,
        filePath: uploaded.path,
      });
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadingKey('');
    }
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    slug: generatedSlug,
    category: form.category.trim(),
    date: form.date.trim(),
    duration: form.duration.trim(),
    format: form.format.trim(),
    location: form.location.trim(),
    image: form.image.trim(),
    shortDescription: form.shortDescription.trim(),
    description: form.description.trim(),
    outcomes: form.outcomesText.split('\n').map((item) => item.trim()).filter(Boolean),
    lecturer: {
      name: form.lecturerName.trim(),
      role: form.lecturerRole.trim(),
      bio: form.lecturerBio.trim(),
      photo: form.lecturerPhoto.trim(),
    },
    certificate: form.certificate,
    rating: Number(form.rating || 5),
    sections: sections.map((section) => ({
      title: section.title.trim(),
      description: section.description.trim(),
      blocks: section.blocks.map((block) => ({
        type: block.type,
        title: block.title.trim(),
        content: block.content.trim(),
        filePath: block.filePath,
      })),
    })),
  });

  const validatePayload = (payload) => {
    const missing = [];
    if (!payload.title) missing.push('название семинара');
    if (!payload.category) missing.push('категорию');
    if (!payload.date) missing.push('дату');
    if (!payload.duration) missing.push('длительность');
    if (!payload.format) missing.push('формат');
    if (!payload.location) missing.push('локацию');
    if (!payload.shortDescription) missing.push('короткое описание');
    if (!payload.description) missing.push('полное описание');
    if (!payload.image) missing.push('URL фото семинара');

    payload.sections.forEach((section, index) => {
      if (!section.title) missing.push(`название раздела ${index + 1}`);
    });

    return missing;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    const payload = buildPayload();
    const missing = validatePayload(payload);

    if (missing.length) {
      setFormError(`Заполните обязательные поля: ${missing.join(', ')}.`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить семинар.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="seminar-form" onSubmit={handleSubmit} noValidate>
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
        <label><span>Лектор</span><input name="lecturerName" value={form.lecturerName} onChange={handleChange} /></label>
        <label><span>Должность лектора</span><input name="lecturerRole" value={form.lecturerRole} onChange={handleChange} /></label>
        <label className="full"><span>Био лектора</span><textarea name="lecturerBio" value={form.lecturerBio} onChange={handleChange} rows="4" /></label>
        <label className="checkbox-row"><input name="certificate" type="checkbox" checked={form.certificate} onChange={handleChange} /><span>Выдавать сертификат</span></label>
      </div>

      <div className="course-builder">
        <div className="course-builder-head">
          <div>
            <h3>Структура семинара</h3>
            <p>Добавляйте разделы и блоки материалов в любом порядке: текст, YouTube видео, PDF, снова текст и так далее.</p>
          </div>
          <button type="button" className="cta-button small" onClick={addSection}>Добавить раздел</button>
        </div>

        {uploadError ? <div className="error-text">{uploadError}</div> : null}

        <div className="sections-editor-list">
          {sections.map((section, sectionIndex) => (
            <div className="section-editor-card" key={section.localId}>
              <div className="section-editor-head">
                <strong>Раздел {sectionIndex + 1}</strong>
                <div className="mini-actions">
                  <button type="button" className="ghost-inline-button small" onClick={() => moveSection(sectionIndex, -1)}>↑</button>
                  <button type="button" className="ghost-inline-button small" onClick={() => moveSection(sectionIndex, 1)}>↓</button>
                  <button type="button" className="ghost-inline-button small danger" onClick={() => removeSection(sectionIndex)} disabled={sections.length === 1}>Удалить</button>
                </div>
              </div>

              <div className="form-grid">
                <label><span>Название раздела</span><input value={section.title} onChange={(e) => updateSection(sectionIndex, { title: e.target.value })} required /></label>
                <label><span>Краткое описание раздела</span><input value={section.description} onChange={(e) => updateSection(sectionIndex, { description: e.target.value })} /></label>
              </div>

              <div className="block-add-row">
                <button type="button" className="ghost-inline-button small" onClick={() => addBlock(sectionIndex, 'text')}>+ Текст</button>
                <button type="button" className="ghost-inline-button small" onClick={() => addBlock(sectionIndex, 'youtube')}>+ YouTube видео</button>
                <button type="button" className="ghost-inline-button small" onClick={() => addBlock(sectionIndex, 'pdf')}>+ PDF</button>
                <button type="button" className="ghost-inline-button small" onClick={() => addBlock(sectionIndex, 'image')}>+ Фото</button>
              </div>

              <div className="blocks-editor-list">
                {section.blocks.map((block, blockIndex) => (
                  <div className="content-block-editor" key={block.localId}>
                    <div className="content-block-head">
                      <span className="badge">{block.type === 'text' ? 'Текст' : block.type === 'youtube' ? 'Видео' : block.type === 'pdf' ? 'PDF' : 'Фото'}</span>
                      <div className="mini-actions">
                        <button type="button" className="ghost-inline-button small" onClick={() => moveBlock(sectionIndex, blockIndex, -1)}>↑</button>
                        <button type="button" className="ghost-inline-button small" onClick={() => moveBlock(sectionIndex, blockIndex, 1)}>↓</button>
                        <button type="button" className="ghost-inline-button small danger" onClick={() => removeBlock(sectionIndex, blockIndex)}>Удалить</button>
                      </div>
                    </div>

                    <label><span>Заголовок блока</span><input value={block.title} onChange={(e) => updateBlock(sectionIndex, blockIndex, { title: e.target.value })} placeholder="Можно оставить пустым" /></label>

                    {block.type === 'text' ? (
                      <label><span>Текст</span><textarea rows="6" value={block.content} onChange={(e) => updateBlock(sectionIndex, blockIndex, { content: e.target.value })} placeholder="Введите материал раздела" /></label>
                    ) : null}

                    {block.type === 'youtube' ? (
                      <label><span>YouTube ссылка</span><input value={block.content} onChange={(e) => updateBlock(sectionIndex, blockIndex, { content: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." /></label>
                    ) : null}

                    {block.type === 'pdf' ? (
                      <div className="pdf-upload-card compact-builder-upload">
                        <label><span>PDF URL</span><input value={block.content} onChange={(e) => updateBlock(sectionIndex, blockIndex, { content: e.target.value })} placeholder="Можно вставить ссылку или загрузить файл" /></label>
                        <div className="pdf-upload-area">
                          <input
                            id={`pdf-${section.localId}-${block.localId}`}
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(e) => handlePdfUpload(sectionIndex, blockIndex, e.target.files?.[0])}
                            disabled={uploadingKey === `${sectionIndex}-${blockIndex}`}
                          />
                          <label htmlFor={`pdf-${section.localId}-${block.localId}`} className="pdf-upload-button">
                            {uploadingKey === `${sectionIndex}-${blockIndex}` ? 'Загрузка...' : 'Загрузить PDF'}
                          </label>
                          {block.content ? <a className="text-link" href={block.content} target="_blank" rel="noreferrer">Открыть файл</a> : <span className="muted">Файл не выбран</span>}
                        </div>
                      </div>
                    ) : null}

                    {block.type === 'image' ? (
                      <div className="pdf-upload-card compact-builder-upload image-upload-card">
                        <label><span>Фото URL</span><input value={block.content} onChange={(e) => updateBlock(sectionIndex, blockIndex, { content: e.target.value })} placeholder="Можно вставить ссылку или загрузить изображение" /></label>
                        <div className="pdf-upload-area">
                          <input
                            id={`image-${section.localId}-${block.localId}`}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={(e) => handleImageUpload(sectionIndex, blockIndex, e.target.files?.[0])}
                            disabled={uploadingKey === `image-${sectionIndex}-${blockIndex}`}
                          />
                          <label htmlFor={`image-${section.localId}-${block.localId}`} className="pdf-upload-button">
                            {uploadingKey === `image-${sectionIndex}-${blockIndex}` ? 'Загрузка...' : 'Загрузить фото'}
                          </label>
                          {block.content ? <a className="text-link" href={block.content} target="_blank" rel="noreferrer">Открыть фото</a> : <span className="muted">Фото не выбрано</span>}
                        </div>
                        {block.content ? <img className="builder-image-preview" src={block.content} alt={block.title || 'Фото материала'} /> : null}
                      </div>
                    ) : null}
                  </div>
                ))}

                {!section.blocks.length ? <div className="muted empty-block-hint">В этом разделе пока нет материалов.</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {formError ? <div className="error-text">{formError}</div> : null}

      <div className="form-actions">
        <button type="submit" className="cta-button" disabled={submitting}>
          {submitting ? 'Сохраняем...' : submitText}
        </button>
        {onCancel ? <button type="button" className="ghost-inline-button" onClick={onCancel}>Отмена</button> : null}
      </div>
    </form>
  );
}
