import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/domain/value_objects/telegram_public_channel.dart';
import 'package:social_monitor_sources/src/presentation/formatters/scan_run_display_formatters.dart';
import 'package:social_monitor_sources/src/presentation/view_models/source_binding_form_draft.dart';

void main() {
  test(
    'public channel inputs normalize to the same credentialless binding',
    () {
      for (final input in [
        'Example_Channel',
        '@Example_Channel',
        'https://t.me/Example_Channel',
        'https://t.me/s/Example_Channel/',
      ]) {
        final draft = SourceBindingFormDraft()
          ..updateProvider('telegram')
          ..query = input;
        expect(draft.validate(), isNull);
        expect(draft.config(), {
          'mode': 'account_feed',
          'channel': 'example_channel',
        });
      }
    },
  );
  test('private links, posts, services and foreign hosts are rejected', () {
    for (final input in [
      '',
      'https://t.me/+invite',
      'https://t.me/c/123/4',
      'https://t.me/channel/1',
      'https://other.example/channel',
      'https://t.me/channel?auth=x',
      'https://user:pass@t.me/channel',
      'http://t.me/channel',
      'https://t.me/%63hannel',
      'https://t.me//channel',
      'https://t.me/share',
    ]) {
      expect(normalizeTelegramPublicChannel(input), isNull, reason: input);
      final draft = SourceBindingFormDraft()
        ..updateProvider('telegram')
        ..query = input;
      expect(
        draft.validate()?.code,
        'source_bindings.telegram_public_channel_required',
      );
    }
  });
  test(
    'switching providers resets Telegram mode without changing RSS serialization',
    () {
      final draft = SourceBindingFormDraft()
        ..updateProvider('telegram')
        ..query = '@example_channel';
      draft.updateProvider('reddit');
      expect(draft.mode, 'search');
      draft.updateProvider('rss');
      draft.feedUrl = 'https://example.test/feed';
      expect(draft.config(), {'feedUrl': 'https://example.test/feed'});
    },
  );
  test('incomplete scans explain backfill and preview limitations', () {
    expect(
      scanOperatorActionLabel('wait_for_collection_backfill'),
      contains('subsequent scans'),
    );
    expect(
      scanOperatorActionLabel('inspect_incomplete_source_content'),
      contains('public preview'),
    );
  });
}
