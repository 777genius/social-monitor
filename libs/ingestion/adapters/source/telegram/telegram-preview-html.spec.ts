import { captureNativeText, readContentCapture } from '../../../domain/value-objects/source-content-capture';
import { parseTelegramPreview } from './telegram-preview-html';
import { telegramHtml, telegramMessageHtml } from './telegram-preview.spec-support';

describe('Telegram inert HTML parsing', () => {
  it('preserves own text, breaks and link targets without including reply previews', () => {
    const html = telegramHtml(telegramMessageHtml(3, '<b>Release &amp; details</b><br><br>Read <a href="https://example.com/release">the announcement</a>',
      '<a class="tgme_widget_message_reply"><div class="tgme_widget_message_text js-message_reply_text">Unrelated reply text</div></a>'));
    const page = parseTelegramPreview(html, 'example_channel');
    expect(page.posts[0]?.text).toBe('Release & details\n\nRead the announcement (https://example.com/release)');
    expect(page.posts[0]?.links).toEqual(['https://example.com/release']);
    expect(page.posts[0]?.incomplete).toBe(false);
  });

  it('refuses app/login/error pages and channel identity mismatches', () => {
    expect(() => parseTelegramPreview('<html>Please open Telegram</html>', 'example_channel')).toThrow('unavailable');
    expect(() => parseTelegramPreview(telegramHtml('', 'other_channel'), 'example_channel')).toThrow('unavailable');
    expect(parseTelegramPreview(telegramHtml(''), 'example_channel').posts).toEqual([]);
    expect(() => parseTelegramPreview(telegramHtml('<div class="tgme_widget_message" data-post="foreign_channel/9"></div>'), 'example_channel')).toThrow('no valid');
  });

  it('marks unsupported media and rich-text previews incomplete', () => {
    const page = parseTelegramPreview(telegramHtml(telegramMessageHtml(1, '', '<div class="tgme_widget_message_error">Please open Telegram to view this post</div>')), 'example_channel');
    expect(page.posts[0]?.incomplete).toBe(true);
    expect(page.warnings).toContain('telegram.preview_content_incomplete');
  });

  it('does not mistake ordinary post or quoted reply wording for a Telegram placeholder', () => {
    const page = parseTelegramPreview(telegramHtml(telegramMessageHtml(4,
      'The button label is View in Telegram.',
      '<a class="tgme_widget_message_reply"><div class="js-message_reply_text">Please open Telegram to view</div></a>')), 'example_channel');
    expect(page.posts[0]?.incomplete).toBe(false);
    expect(page.warnings).toEqual([]);
  });

  it('detects Telegram media placeholders even when a readable caption exists', () => {
    const page = parseTelegramPreview(telegramHtml(telegramMessageHtml(5, 'Available caption',
      '<div class="message_media_not_supported"><div class="message_media_not_supported_label">Please open Telegram to view</div></div>')), 'example_channel');
    expect(page.posts[0]?.incomplete).toBe(true);
  });

  it('does not label a photo caption as the entire native post', () => {
    const page = parseTelegramPreview(telegramHtml(telegramMessageHtml(6, 'Photo caption',
      '<a class="tgme_widget_message_photo_wrap"></a>')), 'example_channel');
    expect(page.posts[0]).toMatchObject({ text: 'Photo caption', incomplete: true });
  });

  it('does not call partial provider-native capture a complete presentation', () => {
    const captured = captureNativeText({ title: 'Preview', body: 'Available excerpt', canonicalUrl: 'https://t.me/example_channel/1',
      metadata: { nativeContentIncomplete: true } }, 'telegram', new Date('2026-10-18T12:00:00Z'));
    expect(readContentCapture(captured)?.presentationComplete).toBe(false);
  });

  it('does not split an emoji at the retained text limit', () => {
    const page = parseTelegramPreview(telegramHtml(telegramMessageHtml(7, 'a'.repeat(63_999) + '😀 suffix')), 'example_channel');
    expect(page.posts[0]?.text).toBe('a'.repeat(63_999));
    expect(page.posts[0]?.incomplete).toBe(true);
  });
});
