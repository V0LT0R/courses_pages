const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export { API_URL, API_ORIGIN };

export function resolveAssetUrl(url) {
  if (!url) return '';
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  if (url.startsWith('/uploads/')) return `${API_ORIGIN}${url}`;
  return url;
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Ошибка запроса');
  }
  return data;
}

export async function uploadPdfFile(file) {
  const token = localStorage.getItem('auth_token');
  const formData = new FormData();
  formData.append('pdf', file);

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/uploads/pdf`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить PDF файл');
  }
  return data;
}
