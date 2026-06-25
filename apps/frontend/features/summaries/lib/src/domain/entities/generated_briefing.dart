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
    required this.userId,
    required this.readerBrief,
    required this.topStories,
    required this.repeatedSignals,
    required this.citations,
    required this.freshnessLabel,
    required this.isDegraded,
  });

  final String id;
  final String title;
  final String executiveSummary;
  final String? userId;
  final BriefingReaderBrief readerBrief;
  final List<BriefingStory> topStories;
  final List<BriefingRepeatedSignal> repeatedSignals;
  final List<SummaryCitation> citations;
  final String freshnessLabel;
  final bool isDegraded;
}

final class BriefingReaderBrief {
  const BriefingReaderBrief({
    required this.headline,
    required this.oneLineTakeaway,
    required this.bullets,
    required this.qualityState,
    required this.topicSections,
    required this.sourceMix,
    required this.topReads,
    required this.trendDelta,
    required this.openQuestions,
    required this.risks,
    required this.nextActions,
  });

  final String headline;
  final String oneLineTakeaway;
  final List<String> bullets;
  final BriefingReaderQualityState qualityState;
  final List<BriefingTopicSection> topicSections;
  final List<BriefingSourceMixEntry> sourceMix;
  final List<BriefingReaderItem> topReads;
  final BriefingTrendDelta trendDelta;
  final List<String> openQuestions;
  final List<String> risks;
  final List<BriefingNextAction> nextActions;
}

final class BriefingReaderItem {
  const BriefingReaderItem({
    required this.title,
    required this.providerKey,
    required this.reason,
    required this.matchedTopicIds,
    required this.matchedRules,
    required this.signalScore,
    required this.confidence,
    required this.confirmedProviderKeys,
    required this.providerMetrics,
    required this.whyImportant,
    required this.whyNow,
    required this.citationIds,
    this.canonicalUrl,
  });

  final String title;
  final String providerKey;
  final String reason;
  final List<String> matchedTopicIds;
  final List<String> matchedRules;
  final double signalScore;
  final BriefingReaderItemConfidence confidence;
  final List<String> confirmedProviderKeys;
  final List<BriefingProviderMetric> providerMetrics;
  final List<String> whyImportant;
  final String whyNow;
  final List<String> citationIds;
  final String? canonicalUrl;
}

final class BriefingReaderItemConfidence {
  const BriefingReaderItemConfidence({
    required this.level,
    required this.score,
    required this.rationale,
  });

  final String level;
  final double score;
  final String rationale;
}

final class BriefingProviderMetric {
  const BriefingProviderMetric({required this.label, required this.value});

  final String label;
  final String value;
}

final class BriefingTopicSection {
  const BriefingTopicSection({
    required this.title,
    required this.insight,
    required this.items,
    required this.citationIds,
    this.topicId,
  });

  final String title;
  final String insight;
  final List<BriefingReaderItem> items;
  final List<String> citationIds;
  final String? topicId;
}

final class BriefingSourceMixEntry {
  const BriefingSourceMixEntry({
    required this.providerKey,
    required this.itemCount,
    required this.citationCount,
    required this.storyClusterCount,
    required this.crossSourceClusterCount,
    required this.singleSourceOnly,
    required this.topicIds,
  });

  final String providerKey;
  final int itemCount;
  final int citationCount;
  final int storyClusterCount;
  final int crossSourceClusterCount;
  final bool singleSourceOnly;
  final List<String> topicIds;
}

final class BriefingReaderQualityState {
  const BriefingReaderQualityState({
    required this.status,
    required this.flags,
    required this.warnings,
    required this.isSingleSource,
  });

  final String status;
  final List<String> flags;
  final List<String> warnings;
  final bool isSingleSource;
}

final class BriefingTrendDelta {
  const BriefingTrendDelta({
    required this.newSignals,
    required this.growingSignals,
    required this.repeatedSignals,
    required this.fadingSignals,
  });

  final List<String> newSignals;
  final List<String> growingSignals;
  final List<String> repeatedSignals;
  final List<String> fadingSignals;
}

final class BriefingNextAction {
  const BriefingNextAction({
    required this.kind,
    required this.label,
    required this.reason,
    required this.citationIds,
    this.canonicalUrl,
  });

  final String kind;
  final String label;
  final String reason;
  final List<String> citationIds;
  final String? canonicalUrl;
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
