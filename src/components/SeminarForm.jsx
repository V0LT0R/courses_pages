import { userMessage } from '../lib/errors';
import { useEffect, useMemo, useState } from 'react';
import { normalizeSlug, uploadCourseImage, uploadCoursePdf } from '../lib/courseService';
import { PASSING_SCORE_OPTIONS } from '../lib/testService';
import { QUESTION_TYPES, questionPayload, validateTest } from '../lib/testQuestions';
import { safeHttpUrl } from '../lib/security';

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
  testEnabled: true,
  academicHours: '',
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

function createTestOption(index = 0) {
  return {
    localId: crypto.randomUUID(),
    text: '',
    isCorrect: index === 0,
  };
}

function createTestQuestion(index = 1) {
  return {
    localId: crypto.randomUUID(),
    text: '',
    options: Array.from({ length: 4 }, (_, optionIndex) => createTestOption(optionIndex)),
    type: 'single_choice',
    acceptedAnswersText: '',
    correctOptionIndex: 0,
  };
}

function createDefaultTest() {
  return {
    passingScore: 70,
    timeLimitMinutes: 10,
    questions: Array.from({ length: 5 }, (_, index) => createTestQuestion(index + 1)),
  };
}

function mapTest(seminar) {
  const source = seminar?.test;
  if (!source?.questions?.length) return createDefaultTest();
  return {
    passingScore: Number(source.passingScore || 70),
    timeLimitMinutes: Number(source.timeLimitMinutes || 10),
    questions: source.questions.map((question) => ({
      localId: question.id || crypto.randomUUID(),
      id: question.id,
      text: question.text || '',
      type: question.type || 'single_choice',
      acceptedAnswersText: (question.acceptedAnswers || []).join('\n'),
      correctOptionIndex: Number(question.correctOptionIndex || 0),
      options: (question.options || []).map((option, optionIndex) => ({
        localId: option.id || crypto.randomUUID(),
        id: option.id,
        text: option.text || '',
        isCorrect: (question.correctOptionIndices || [question.correctOptionIndex || 0]).includes(optionIndex),
      })),
    })),
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
    testEnabled: Boolean(seminar.test?.enabled),
    academicHours: seminar.academicHours ?? '',
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
  const [test, setTest] = useState(createDefaultTest());
  const [uploadingKey, setUploadingKey] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(mapSeminarToForm(seminar));
    setSections(mapSections(seminar));
    setTest(mapTest(seminar));
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

  const updateTestSettings = (patch) => setTest((prev) => ({ ...prev, ...patch }));

  const updateTestQuestion = (questionIndex, patch) => {
    setTest((prev) => ({
      ...prev,
      questions: prev.questions.map((question, index) => index === questionIndex ? { ...question, ...patch } : question),
    }));
  };

  const addTestQuestion = () => {
    setTest((prev) => ({
      ...prev,
      questions: [...prev.questions, createTestQuestion(prev.questions.length + 1)],
    }));
  };

  const removeTestQuestion = (questionIndex) => {
    setTest((prev) => prev.questions.length <= 1 ? prev : {
      ...prev,
      questions: prev.questions.filter((_, index) => index !== questionIndex),
    });
  };

  const addTestOption = (questionIndex) => {
    setTest((prev) => ({
      ...prev,
      questions: prev.questions.map((question, index) => {
        if (index !== questionIndex || question.options.length >= 6) return question;
        return { ...question, options: [...question.options, createTestOption(question.options.length)] };
      }),
    }));
  };

  const removeTestOption = (questionIndex, optionIndex) => {
    setTest((prev) => ({
      ...prev,
      questions: prev.questions.map((question, index) => {
        if (index !== questionIndex || question.options.length <= 2) return question;
        const options = question.options.filter((_, currentIndex) => currentIndex !== optionIndex);
        return { ...question, options };
      }),
    }));
  };

  const updateTestOption = (questionIndex, optionIndex, text) => {
    setTest((prev) => ({
      ...prev,
      questions: prev.questions.map((question, index) => index !== questionIndex ? question : {
        ...question,
        options: question.options.map((option, currentIndex) => currentIndex === optionIndex ? { ...option, text } : option),
      }),
    }));
  };

  const setCorrectTestOption = (questionIndex, optionIndex) => {
    setTest(prev => ({ ...prev, questions: prev.questions.map((question, index) => index !== questionIndex ? question : {
      ...question,
      options: question.options.map((option, currentIndex) => ({ ...option,
        isCorrect: question.type === 'multiple_choice' ? (currentIndex === optionIndex ? !option.isCorrect : option.isCorrect) : currentIndex === optionIndex,
      })),
    }) }));
  };

  const changeQuestionType = (index, type) => {
    const question = test.questions[index];
    const options = type === 'true_false'
      ? ['Верно', 'Неверно'].map((text, i) => ({ ...createTestOption(i), text }))
      : (question.options.length >= 2 ? question.options : [createTestOption(0), createTestOption(1)]).map((option, i) => ({ ...option, isCorrect: type === 'multiple_choice' ? option.isCorrect : i === 0 }));
    updateTestQuestion(index, { type, options });
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
      setUploadError(userMessage(err));
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
      setUploadError(userMessage(err));
    } finally {
      setUploadingKey('');
    }
  };

  const buildPayload = () => ({
    expectedUpdatedAt: seminar?.updatedAt || null,
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
    certificate: form.testEnabled,
    academicHours: form.academicHours === '' ? null : Number(form.academicHours),
    rating: Number(form.rating || 5),
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title.trim(),
      description: section.description.trim(),
      blocks: section.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        title: block.title.trim(),
        content: block.content.trim(),
        filePath: block.filePath,
      })),
    })),
    test: form.testEnabled ? {
      enabled: true,
      passingScore: Number(test.passingScore),
      timeLimitMinutes: Number(test.timeLimitMinutes),
      questions: test.questions.map(questionPayload),
    } : null,
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

    if (payload.academicHours !== null && (!Number.isInteger(payload.academicHours) || payload.academicHours < 1 || payload.academicHours > 10000)) missing.push('академические часы от 1 до 10000');
    if (payload.test) missing.push(...validateTest(payload.test));

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
      setFormError(userMessage(err) || 'Не удалось сохранить семинар.');
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
        <label className="checkbox-row"><input name="testEnabled" type="checkbox" checked={form.testEnabled} onChange={handleChange} /><span>Итоговый тест и сертификат после успешной сдачи</span></label>
        <p className="full">{form.testEnabled ? 'Семинар с сертификатом: изучение материалов и успешная сдача теста.' : 'Семинар без итогового теста и без сертификата.'}</p>
        {form.testEnabled && <label><span>Объём программы, академических часов</span><input name="academicHours" type="number" min="1" max="10000" step="1" value={form.academicHours} onChange={handleChange} placeholder="Например, 18" /><small>Укажите фактический объём. Если поле пустое, часы не печатаются.</small></label>}
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
                          {block.content ? <a className="text-link" href={safeHttpUrl(block.content)} target="_blank" rel="noreferrer">Открыть файл</a> : <span className="muted">Файл не выбран</span>}
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
                          {block.content ? <a className="text-link" href={safeHttpUrl(block.content)} target="_blank" rel="noreferrer">Открыть фото</a> : <span className="muted">Фото не выбрано</span>}
                        </div>
                        {block.content ? <img className="builder-image-preview" src={safeHttpUrl(block.content)} alt={block.title || 'Фото материала'} /> : null}
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

      {form.testEnabled && <div className="course-builder test-builder">
        <div className="course-builder-head">
          <div>
            <h3>Итоговое тестирование</h3>
            <p>От 1 до 200 вопросов разных типов. Для нескольких ответов засчитывается только полный правильный набор.</p>
          </div>
          <button type="button" className="cta-button small" onClick={addTestQuestion} disabled={test.questions.length >= 200}>Добавить вопрос</button>
        </div>

        <div className="form-grid test-settings-grid">
          <label>
            <span>Проходной балл</span>
            <select value={test.passingScore} onChange={(e) => updateTestSettings({ passingScore: Number(e.target.value) })}>
              {PASSING_SCORE_OPTIONS.map((score) => <option key={score} value={score}>{score}%</option>)}
            </select>
          </label>
          <label>
            <span>Время на тест, минут</span>
            <input type="number" min="1" max="480" step="1" value={test.timeLimitMinutes} onChange={(e) => updateTestSettings({ timeLimitMinutes: e.target.value })} />
          </label>
        </div>

        <div className="test-question-editor-list">
          {test.questions.map((question, questionIndex) => (
            <div className="section-editor-card test-question-editor" key={question.localId}>
              <div className="section-editor-head">
                <strong>Вопрос {questionIndex + 1}</strong>
                <button
                  type="button"
                  className="ghost-inline-button small danger"
                  onClick={() => removeTestQuestion(questionIndex)}
                  disabled={test.questions.length <= 1}
                >
                  Удалить вопрос
                </button>
              </div>

              <label><span>Тип вопроса</span><select value={question.type} onChange={e => changeQuestionType(questionIndex, e.target.value)}>{Object.entries(QUESTION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="test-question-text">
                <span>Текст вопроса</span>
                <textarea rows="3" maxLength="2000" value={question.text} onChange={(e) => updateTestQuestion(questionIndex, { text: e.target.value })} placeholder="Введите вопрос" />
              </label>

              {question.type === 'short_answer' ? <label><span>Допустимые ответы — по одному на строку</span><textarea rows="3" value={question.acceptedAnswersText} onChange={e => updateTestQuestion(questionIndex, { acceptedAnswersText: e.target.value })} /><small>Регистр и лишние пробелы не учитываются. Совпадение с одним из указанных вариантов.</small></label> : <>
              <div className="test-options-editor">
                {question.options.map((option, optionIndex) => (
                  <div className="test-option-editor" key={option.localId}>
                    <label className="test-correct-radio" title="Отметить правильный ответ">
                      <input
                        type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                        name={`correct-${question.localId}`}
                        checked={option.isCorrect}
                        onChange={() => setCorrectTestOption(questionIndex, optionIndex)}
                      />
                      <span>Правильный</span>
                    </label>
                    <input
                      maxLength="1000"
                      readOnly={question.type === 'true_false'}
                      value={option.text}
                      onChange={(e) => updateTestOption(questionIndex, optionIndex, e.target.value)}
                      placeholder={`Вариант ответа ${optionIndex + 1}`}
                    />
                    <button
                      type="button"
                      className="ghost-inline-button small danger"
                      onClick={() => removeTestOption(questionIndex, optionIndex)}
                      disabled={question.type === 'true_false' || question.options.length <= 2}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="ghost-inline-button small"
                onClick={() => addTestOption(questionIndex)}
                disabled={question.type === 'true_false' || question.options.length >= 6}
              >
                + Добавить вариант ответа
              </button></> }
            </div>
          ))}
        </div>
      </div>}

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
