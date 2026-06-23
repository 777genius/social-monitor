import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/topic_summary.dart';
import '../commands/archive_topic_command.dart';
import '../commands/create_topic_command.dart';
import '../commands/update_topic_command.dart';
import '../queries/list_topics_query.dart';

abstract interface class TopicCatalog {
  Future<Result<PageResult<TopicSummary>>> listTopics(ListTopicsQuery query);

  Future<Result<TopicSummary>> createTopic(CreateTopicCommand command);

  Future<Result<TopicSummary>> updateTopic(UpdateTopicCommand command);

  Future<Result<TopicSummary>> archiveTopic(ArchiveTopicCommand command);
}
