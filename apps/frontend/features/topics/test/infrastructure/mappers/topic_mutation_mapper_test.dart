import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_topics/src/application/commands/archive_topic_command.dart';
import 'package:social_monitor_topics/src/application/commands/create_topic_command.dart';
import 'package:social_monitor_topics/src/application/commands/update_topic_command.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_id.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_name.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_query.dart';
import 'package:social_monitor_topics/src/infrastructure/mappers/topic_mutation_mapper.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  test('maps create update and archive commands to endpoint DTOs', () {
    const mapper = TopicMutationMapper();

    final create = mapper.createRequest(
      const CreateTopicCommand(
        scope: testWorkspaceScope,
        name: TopicName(' Market risk '),
        query: TopicQuery(' risk OR pricing '),
        idempotencyKey: 'topic-create-1',
      ),
    );
    final update = mapper.updateRequest(
      const UpdateTopicCommand(
        scope: testWorkspaceScope,
        topicId: TopicId('topic-market-risk'),
        name: TopicName('Market risk updated'),
        query: TopicQuery('risk'),
      ),
    );
    final archive = mapper.archiveRequest(
      const ArchiveTopicCommand(
        scope: testWorkspaceScope,
        topicId: TopicId('topic-market-risk'),
      ),
    );

    expect(create.name, 'Market risk');
    expect(create.query, 'risk OR pricing');
    expect(create.idempotencyKey, 'topic-create-1');
    expect(create.scope, testWorkspaceScope);
    expect(update.id, 'topic-market-risk');
    expect(update.query, 'risk');
    expect(archive.id, 'topic-market-risk');
    expect(archive.scope, testWorkspaceScope);
  });
}
