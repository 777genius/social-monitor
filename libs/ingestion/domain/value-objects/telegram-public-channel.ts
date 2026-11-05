/** Public usernames only: no invite, post, credential or arbitrary egress URL. */
export const telegramPublicChannel = (value: string): string | undefined => {
  let candidate = value.trim();
  if (/^t\.me\//i.test(candidate)) candidate = `https://${candidate}`;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || url.hostname !== 't.me' || url.port ||
          url.username || url.password || url.search || url.hash) return undefined;
      const match = /^\/(?:s\/)?([a-zA-Z][a-zA-Z0-9_]{0,31})\/?$/.exec(url.pathname);
      candidate = match?.[1] ?? '';
    } catch { return undefined; }
  }
  candidate = candidate.replace(/^@/, '');
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(candidate)) return undefined;
  // These are Telegram service routes, not channel usernames.
  if (['s', 'joinchat', 'addstickers', 'share', 'login', 'proxy', 'iv', 'c'].includes(candidate.toLowerCase())) return undefined;
  return candidate.toLowerCase();
};
