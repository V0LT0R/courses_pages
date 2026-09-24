export function safeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}

export function validateStudentRegistration({ fullName, email, password }) {
  const cleanName = String(fullName || '').trim().replace(/\s+/g, ' ');
  const cleanEmail = normalizeEmail(email);
  const errors = [];

  if (cleanName.length < 2 || cleanName.length > 120) errors.push('ФИО должно содержать от 2 до 120 символов.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errors.push('Укажите корректный email.');
  if (String(password || '').length < 8) errors.push('Пароль должен содержать минимум 8 символов.');
  if (String(password || '').length > 128) errors.push('Пароль слишком длинный. Максимум 128 символов.');

  return { fullName: cleanName, email: cleanEmail, password: String(password || ''), errors };
}
