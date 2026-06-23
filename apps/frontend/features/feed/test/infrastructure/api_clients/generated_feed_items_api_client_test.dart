import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_feed/src/infrastructure/api_clients/generated_feed_items_api_client.dart';

void main() {
  test('rejects non generated api runtime objects', () {
    expect(
      () => GeneratedFeedItemsApiClient.fromRuntime(runtime: Object()),
      throwsArgumentError,
    );
  });
}
