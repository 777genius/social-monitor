import { JSDOM } from 'jsdom';
import type { TelegramPreviewPage, TelegramPreviewPost } from './telegram-preview-client.port';
import { TelegramPreviewError } from './telegram-preview-client.port';

const textLimit = 64_000;

export const parseTelegramPreview = (html: string, channel: string): TelegramPreviewPage => {
  const dom = new JSDOM(html); // No scripts, resources, cookies or browser session.
  try {
    const document = dom.window.document;
    const history = document.querySelector('.tgme_channel_history');
    const username = document.querySelector('.tgme_channel_info_header_username')?.textContent?.trim().replace(/^@/, '').toLowerCase();
    const messages = [...document.querySelectorAll('.tgme_widget_message[data-post]')];
    if (history === null || (messages.length === 0 && username !== channel)) {
      throw new TelegramPreviewError('Telegram public preview is unavailable or requires the app', 'unavailable', false);
    }
    if (username !== undefined && username !== channel) {
      throw new TelegramPreviewError('Telegram public preview channel does not match the request', 'unavailable', false);
    }
    const warnings: string[] = [];
    const posts: TelegramPreviewPost[] = [];
    for (const message of messages) {
      const match = /^([a-zA-Z][a-zA-Z0-9_]*)\/(\d+)$/.exec(message.getAttribute('data-post') ?? '');
      const id = Number(match?.[2]);
      if (match?.[1]?.toLowerCase() !== channel || !Number.isSafeInteger(id) || id <= 0) {
        warnings.push('telegram.collection_incomplete:invalid_post_identity');
        continue;
      }
      const date = message.querySelector('.tgme_widget_message_date time[datetime], time[datetime]')?.getAttribute('datetime');
      const parsedDate = date === undefined || date === null ? undefined : new Date(date);
      const publishedAt = parsedDate !== undefined && Number.isFinite(parsedDate.getTime()) ? parsedDate : undefined;
      const textElement = message.querySelector('.tgme_widget_message_text.js-message_text');
      const copy = textElement?.cloneNode(true) as Element | undefined;
      copy?.querySelectorAll('.tgme_widget_message_reply, .js-message_reply_text, script, style').forEach((node) => node.remove());
      copy?.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
      copy?.querySelectorAll('p, div, blockquote, li, pre').forEach((node) => node.append('\n'));
      const links = new Set<string>();
      copy?.querySelectorAll('a[href]').forEach((node) => {
        try {
          const url = new URL(node.getAttribute('href') ?? '');
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
          links.add(url.toString());
          if (node.textContent?.trim() !== url.toString()) node.append(` (${url.toString()})`);
        } catch { /* Keep readable label; never interpret arbitrary links. */ }
      });
      const raw = copy?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
      const incomplete = raw.length === 0 || raw.length > textLimit ||
        message.querySelector('.tgme_widget_message_error, .tgme_widget_message_text_has_more, .message_media_not_supported, ' +
          '.tgme_widget_message_photo_wrap, .tgme_widget_message_video_player, .tgme_widget_message_document_wrap, ' +
          '.tgme_widget_message_voice_player, .tgme_widget_message_audio_player, .tgme_widget_message_sticker_wrap') !== null;
      if (incomplete) warnings.push('telegram.preview_content_incomplete');
      if (publishedAt === undefined) warnings.push('telegram.collection_incomplete:invalid_post_timestamp');
      posts.push({ id, text: raw.slice(0, textLimit), publishedAt, links: [...links], incomplete,
        views: parseViews(message.querySelector('.tgme_widget_message_views')?.textContent ?? '') });
    }
    if (messages.length > 0 && posts.length === 0) {
      throw new TelegramPreviewError('Telegram public preview contains no valid channel messages', 'unavailable', false);
    }
    return { posts: posts.sort((a, b) => b.id - a.id), warnings: [...new Set(warnings)] };
  } finally { dom.window.close(); }
};

const parseViews = (text: string): number | undefined => {
  const match = /^(\d+(?:\.\d+)?)([KM])?$/i.exec(text.trim());
  if (match === null) return undefined;
  const factor = match[2]?.toUpperCase() === 'M' ? 1_000_000 : match[2]?.toUpperCase() === 'K' ? 1000 : 1;
  const value = Math.round(Number(match[1]) * factor);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};
