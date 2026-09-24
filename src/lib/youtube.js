const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);

export function getYoutubeEmbedUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return '';

    let id = '';
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      id = url.pathname.replace(/^\//, '').split('/')[0];
    } else if (url.pathname === '/watch') {
      id = url.searchParams.get('v') || '';
    } else if (url.pathname.startsWith('/embed/')) {
      id = url.pathname.split('/embed/')[1]?.split('/')[0] || '';
    } else if (url.pathname.startsWith('/shorts/')) {
      id = url.pathname.split('/shorts/')[1]?.split('/')[0] || '';
    }

    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return '';
    return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    return '';
  }
}
