export function getYoutubeEmbedUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value.trim());
    let id = '';

    if (url.hostname.includes('youtu.be')) {
      id = url.pathname.replace('/', '').split('/')[0];
    } else if (url.pathname.startsWith('/watch')) {
      id = url.searchParams.get('v') || '';
    } else if (url.pathname.startsWith('/embed/')) {
      id = url.pathname.split('/embed/')[1]?.split('/')[0] || '';
    } else if (url.pathname.startsWith('/shorts/')) {
      id = url.pathname.split('/shorts/')[1]?.split('/')[0] || '';
    }

    if (!id) return value;
    return `https://www.youtube.com/embed/${id}`;
  } catch {
    return value;
  }
}
