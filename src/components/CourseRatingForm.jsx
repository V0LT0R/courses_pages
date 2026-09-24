import { useEffect, useState } from 'react';
import { getMyCourseRating, saveCourseRating } from '../lib/ratingService';
import { clearCourseCache } from '../lib/courseService';
import { userMessage } from '../lib/errors';

export default function CourseRatingForm({ courseId }) {
  const [rating, setRating] = useState(0);
  const [savedRating, setSavedRating] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let active = true;
    getMyCourseRating(courseId).then(value => {
      if (active) { setSavedRating(value); setRating(value || 0); }
    }).catch(err => { if (active) setError(userMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId]);

  const submit = async event => {
    event.preventDefault();
    if (saving || !rating) return;
    setSaving(true); setError('');
    try {
      const saved = await saveCourseRating(courseId, rating);
      setSavedRating(saved);
      clearCourseCache();
    } catch (err) { setError(userMessage(err)); }
    finally { setSaving(false); }
  };

  if (collapsed) return <div className="course-rating-prompt"><button type="button" className="ghost-inline-button small" onClick={() => setCollapsed(false)}>Оценить семинар</button><span className="muted">Необязательно</span></div>;
  return <form className="course-rating-form" onSubmit={submit}>
    <div><h3>Как вам семинар?</h3><p>Оценка необязательна и помогает другим участникам выбрать семинар.</p></div>
    <fieldset disabled={loading || saving}>
      <legend>Ваша оценка</legend>
      <div className="rating-stars">
        {[1, 2, 3, 4, 5].map(value => <label key={value} className={value <= rating ? 'selected' : ''}>
          <input type="radio" name="course-rating" value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} из 5`} />
          <span aria-hidden="true">★</span>
        </label>)}
        <span className="rating-value">{loading ? 'Загрузка…' : rating ? `${rating} из 5` : 'Выберите оценку'}</span>
      </div>
    </fieldset>
    {error && <div className="error-text" role="alert">{error}</div>}
    <div role="status">{savedRating ? `Спасибо! Ваша оценка: ${savedRating} из 5. Её можно изменить.` : ''}</div>
    <div className="form-actions">
      <button type="submit" className="cta-button small" disabled={loading || saving || !rating || rating === savedRating}>{saving ? 'Сохраняем…' : savedRating ? 'Изменить оценку' : 'Отправить оценку'}</button>
      <button type="button" className="ghost-inline-button small" onClick={() => setCollapsed(true)} disabled={saving}>Позже</button>
    </div>
  </form>;
}
