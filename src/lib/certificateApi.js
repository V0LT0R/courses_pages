import { apiRequest } from './api';

function normalizeLanguage(value) {
  const lang = String(value || 'ru').toLowerCase();
  return ['ru', 'kz', 'en'].includes(lang) ? lang : 'ru';
}

function normalizeCourseType(value) {
  return value === 'internship' ? 'internship' : 'course';
}

export function buildCertificatePayload(payload) {
  const completedAt = payload.completedAt || new Date().toISOString();
  return {
    external_user_id: String(payload.externalUserId || payload.userId || 'unknown_user'),
    full_name: payload.fullName || payload.full_name || 'Без имени',
    course_id: String(payload.courseId || payload.courseSlug || payload.course_id || 'course'),
    course_name: payload.courseName || payload.courseTitle || payload.course_name || 'Курс',
    course_type: normalizeCourseType(payload.courseType || payload.course_type),
    course_duration_hours: Number(payload.courseDurationHours || payload.course_duration_hours || 40),
    score: 100,
    completed_at: completedAt,
    language: normalizeLanguage(payload.language),
  };
}

export async function sendCertificateData(payload) {
  const normalizedPayload = buildCertificatePayload(payload);

  // API-ключ внешнего сервиса хранится на backend в .env.
  // Frontend отправляет только данные сертификата на локальный серверный proxy.
  return apiRequest('/certificates/generate', {
    method: 'POST',
    body: JSON.stringify(normalizedPayload),
  });
}
