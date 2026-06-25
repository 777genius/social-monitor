import 'top_read.dart';

final class ReaderTopicSection {
  const ReaderTopicSection({
    required this.title,
    required this.insight,
    required this.items,
    required this.citationIds,
    this.topicId,
  });

  final String title;
  final String insight;
  final List<TopRead> items;
  final List<String> citationIds;
  final String? topicId;
}
