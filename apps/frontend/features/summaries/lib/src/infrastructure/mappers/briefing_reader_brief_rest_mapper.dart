import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/summary_api_dto.dart';

final class BriefingReaderBriefRestMapper {
  const BriefingReaderBriefRestMapper();

  BriefingReaderBriefApiDto map(generated.BriefingReaderBriefDto dto) {
    return BriefingReaderBriefApiDto(
      headline: dto.headline,
      oneLineTakeaway: dto.oneLineTakeaway,
      bullets: dto.bullets,
      qualityState: BriefingReaderQualityStateApiDto(
        status: dto.qualityState.status.json ?? 'ready',
        flags: dto.qualityState.flags
            .map((flag) => flag.json ?? 'unknown')
            .where((flag) => flag != 'unknown')
            .toList(growable: false),
        warnings: dto.qualityState.warnings,
        isSingleSource: dto.qualityState.isSingleSource,
      ),
      topicSections: dto.topicSections
          .map(_topicSection)
          .toList(growable: false),
      sourceMix: dto.sourceMix.map(_sourceMixEntry).toList(growable: false),
      topReads: dto.topReads.map(_readerItem).toList(growable: false),
      trendDelta: BriefingTrendDeltaApiDto(
        newSignals: dto.trendDelta.newSignals,
        growingSignals: dto.trendDelta.growingSignals,
        repeatedSignals: dto.trendDelta.repeatedSignals,
        fadingSignals: dto.trendDelta.fadingSignals,
      ),
      openQuestions: dto.openQuestions,
      risks: dto.risks,
      nextActions: dto.nextActions.map(_nextAction).toList(growable: false),
    );
  }

  BriefingTopicSectionApiDto _topicSection(
    generated.BriefingReaderTopicSectionDto dto,
  ) {
    return BriefingTopicSectionApiDto(
      topicId: dto.topicId,
      title: dto.title,
      insight: dto.insight,
      items: dto.items.map(_readerItem).toList(growable: false),
      citationIds: dto.citationIds,
    );
  }

  BriefingReaderItemApiDto _readerItem(generated.BriefingReaderItemDto dto) {
    return BriefingReaderItemApiDto(
      title: dto.title,
      providerKey: dto.providerKey,
      reason: dto.reason,
      matchedTopicIds: dto.matchedTopicIds,
      matchedRules: dto.matchedRules,
      signalScore: _safeScore(dto.signalScore),
      providerMetrics: dto.providerMetrics
          .map(
            (metric) => BriefingProviderMetricApiDto(
              label: metric.label,
              value: metric.value,
            ),
          )
          .toList(growable: false),
      whyImportant: dto.whyImportant,
      whyNow: dto.whyNow,
      canonicalUrl: dto.canonicalUrl,
      citationIds: dto.citationIds,
    );
  }

  BriefingSourceMixEntryApiDto _sourceMixEntry(
    generated.BriefingSourceMixEntryDto dto,
  ) {
    return BriefingSourceMixEntryApiDto(
      providerKey: dto.providerKey,
      itemCount: _safeCount(dto.itemCount),
      citationCount: _safeCount(dto.citationCount),
      storyClusterCount: _safeCount(dto.storyClusterCount),
      crossSourceClusterCount: _safeCount(dto.crossSourceClusterCount),
      singleSourceOnly: dto.singleSourceOnly,
      topicIds: dto.topicIds,
    );
  }

  BriefingNextActionApiDto _nextAction(generated.BriefingNextActionDto dto) {
    return BriefingNextActionApiDto(
      kind: dto.kind.json ?? 'read_source',
      label: dto.label,
      reason: dto.reason,
      citationIds: dto.citationIds,
      canonicalUrl: dto.canonicalUrl,
    );
  }

  int _safeCount(num value) {
    if (!value.isFinite || value < 0) {
      return 0;
    }
    return value.round();
  }

  double _safeScore(num value) {
    if (!value.isFinite || value < 0) {
      return 0;
    }
    return value.toDouble();
  }
}
