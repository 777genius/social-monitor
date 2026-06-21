const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export const extractYoutubeVideoId = (value: string): string | null => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  if (hostname === 'youtu.be') {
    return normalizeVideoId(url.pathname.split('/').filter(Boolean)[0]);
  }

  if (!isYoutubeHostname(hostname)) {
    return null;
  }

  if (url.pathname === '/watch') {
    return normalizeVideoId(url.searchParams.get('v'));
  }

  const [kind, id] = url.pathname.split('/').filter(Boolean);
  if (kind === 'shorts' || kind === 'embed' || kind === 'live') {
    return normalizeVideoId(id);
  }

  return null;
};

export const isYoutubeVideoUrl = (value: string): boolean => extractYoutubeVideoId(value) !== null;

const normalizeVideoId = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return YOUTUBE_VIDEO_ID_PATTERN.test(trimmed) ? trimmed : null;
};

const isYoutubeHostname = (hostname: string): boolean =>
  hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
