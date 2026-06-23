import 'summary_citation.dart';

final class WorkspaceBriefingSnapshot {
  const WorkspaceBriefingSnapshot({this.current});

  final GeneratedBriefing? current;
}

final class GeneratedBriefing {
  const GeneratedBriefing({
    required this.id,
    required this.title,
    required this.executiveSummary,
    required this.topStories,
    required this.repeatedSignals,
    required this.citations,
    required this.freshnessLabel,
    required this.isDegraded,
  });

  final String id;
  final String title;
  final String executiveSummary;
  final List<BriefingStory> topStories;
  final List<BriefingRepeatedSignal> repeatedSignals;
  final List<SummaryCitation> citations;
  final String freshnessLabel;
  final bool isDegraded;
}

final class BriefingStory {
  const BriefingStory({
    required this.title,
    required this.summary,
    required this.topicCount,
    required this.providerCount,
    required this.citationIds,
  });

  final String title;
  final String summary;
  final int topicCount;
  final int providerCount;
  final List<String> citationIds;
}

final class BriefingRepeatedSignal {
  const BriefingRepeatedSignal({
    required this.title,
    required this.topicIds,
    required this.citationIds,
  });

  final String title;
  final List<String> topicIds;
  final List<String> citationIds;
}
