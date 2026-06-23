import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_topics/src/infrastructure/api/topic_mutation_api_dto.dart';
import 'package:social_monitor_topics/src/infrastructure/api_clients/generated_topics_api_client.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  test('rejects non generated api runtime objects', () {
    expect(
      () => GeneratedTopicsApiClient.fromRuntime(runtime: Object()),
      throwsArgumentError,
    );
  });

  test('fails closed for mutations not present in backend contract', () async {
    final runtime = createGeneratedApiRuntime(
      const GeneratedApiConfiguration(baseUrl: 'https://example.invalid'),
    );
    addTearDown(runtime.close);
    final client = GeneratedTopicsApiClient.fromRuntime(runtime: runtime);

    final update = await client.updateTopic(
      const UpdateTopicApiRequestDto(
        scope: testWorkspaceScope,
        id: 'topic-pricing',
        name: 'Competitor pricing',
        query: 'pricing',
      ),
    );
    final archive = await client.archiveTopic(
      const ArchiveTopicApiRequestDto(id: 'topic-pricing'),
    );

    expect(update, isA<ResultFailure>());
    expect((update as ResultFailure).failure.code, 'topics.update_unavailable');
    expect(archive, isA<ResultFailure>());
    expect(
      (archive as ResultFailure).failure.code,
      'topics.archive_unavailable',
    );
  });
}
