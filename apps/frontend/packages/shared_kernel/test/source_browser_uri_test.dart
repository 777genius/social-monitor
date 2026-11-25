import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
  test(
    'public Telegram links open on the browser preview without changing provenance',
    () {
      for (final host in ['t.me', 'telegram.me', 'telegram.dog']) {
        expect(
          sourceBrowserUri(
            'https://$host/example_channel/42',
            providerKey: 'telegram',
          )?.toString(),
          'https://t.me/s/example_channel/42',
        );
      }
      expect(
        sourceBrowserUri(
          'https://t.me/s/example_channel/42',
          providerKey: 'telegram',
        )?.toString(),
        'https://t.me/s/example_channel/42',
      );
    },
  );

  test(
    'untrusted schemes, credentials and non-post Telegram targets cannot launch',
    () {
      for (final url in [
        'javascript:alert(1)',
        'tg://resolve?domain=example_channel',
        'https://user:secret@t.me/example_channel/42',
        'https://t.me.evil.test/example_channel/42',
        'https://t.me/+private_invite',
        'https://t.me/example_channel/not-a-post',
      ]) {
        expect(sourceBrowserUri(url, providerKey: 'telegram'), isNull);
      }
      expect(
        sourceBrowserUri(
          'https://example.test/article',
          providerKey: 'rss',
        )?.toString(),
        'https://example.test/article',
      );
    },
  );
}
