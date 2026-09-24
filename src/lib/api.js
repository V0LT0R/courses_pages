const API_URL = import.meta.env.VITE_API_URL || '/api';
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '') || '';

export { API_URL, API_ORIGIN };

export function resolveAssetUrl(url) {
  if (!url) return '';
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  if (url.startsWith('/uploads/')) return `${API_ORIGIN}${url}`;
  return url;
}

export async function apiRequest(path, options = {}) {
  const { accessToken, ...fetchOptions } = options;
  const token = accessToken || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      signal: options.signal || AbortSignal.timeout(25000),
      headers,
    });
  } catch (error) {
    if(error.name==='AbortError')throw error;
    throw new Error('Сервис временно недоступен. Повторите попытку позже.', {cause:error});
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Ошибка запроса');
  }
  return data;
}

