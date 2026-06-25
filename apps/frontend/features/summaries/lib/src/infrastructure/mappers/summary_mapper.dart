import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/summary_generation_status.dart';
import '../../domain/value_objects/summary_id.dart';
import '../api/summary_api_dto.dart';

final class SummaryMapper {
  const SummaryMapper();

  GeneratedSummary toDomain(SummaryApiDto dto) {
    return GeneratedSummary(
      id: SummaryId(_nonEmpty(dto.id, fallback: 'summary-unknown')),
      title: _nonEmpty(dto.title, fallback: 'Untitled summary'),
      bodyPreview: _safeText(dto.bodyText, fallback: 'No summary available'),
      status: _statusFromApi(dto.status),
      citations: dto.citations.map(_citationToDomain).toList(growable: false),
      freshnessLabel: _nonEmpty(dto.freshnessLabel, fallback: 'Unknown'),
      feedbackSubmitted: dto.feedbackSubmitted,
    );
  }

  ReaderSummary readerSummaryToDomain(ReaderSummaryApiDto dto) {
    return ReaderSummary(
      id: _nonEmpty(dto.id, fallback: 'summary-unknown'),
      title: _nonEmpty(dto.title, fallback: 'Workspace summary'),
      executiveSummary: _safeText(
        dto.executiveSummary,
        fallback: 'No summary available',
      ),
      userId: _nonEmptyOrNull(dto.userId),
      content: _readerSummaryContentToDomain(dto.content),
      topStories: dto.topStories
          .map(_summaryStoryToDomain)
          .toList(growable: false),
      repeatedSignals: dto.repeatedSignals
          .map(_repeatedSignalToDomain)
          .toList(growable: false),
      citations: dto.citations.map(_citationToDomain).toList(growable: false),
      summaryWindow: SummaryWindow.current(),
      freshnessLabel: _nonEmpty(dto.freshnessLabel, fallback: 'Unknown'),
      isDegraded: dto.isDegraded,
    );
  }

  ReaderSummaryJobSnapshot summaryJobToDomain(ReaderSummaryJobApiDto dto) {
    return ReaderSummaryJobSnapshot(
      id: _nonEmpty(dto.id, fallback: 'summary-job-unknown'),
      status: _summaryJobStatusFromApi(dto.status),
      created: dto.created,
      summaryId: dto.summaryId,
      failureReason: dto.failureReason,
      requestedAt: dto.requestedAt,
      startedAt: dto.startedAt,
      completedAt: dto.completedAt,
      failedAt: dto.failedAt,
    );
  }

  SummaryCitation _citationToDomain(SummaryCitationApiDto dto) {
    return SummaryCitation(
      id: _nonEmpty(dto.id, fallback: 'citation-unknown'),
      sourceLabel: _nonEmpty(dto.sourceLabel, fallback: 'Unknown source'),
      safeSnippet: _safeText(
        dto.rawSnippet,
        fallback: 'No citation snippet available',
      ),
      canonicalUrl: _safeUrl(dto.canonicalUrl),
    );
  }

  ReaderSummaryContent _readerSummaryContentToDomain(
    ReaderSummaryContentApiDto dto,
  ) {
    return ReaderSummaryContent(
      headline: _nonEmpty(dto.headline, fallback: 'Workspace summary'),
      oneLineTakeaway: _safeText(
        dto.oneLineTakeaway,
        fallback: 'No summary takeaway available',
      ),
      bullets: _safeTextList(dto.bullets),
      qualityState: ReaderSummaryQualityState(
        status: _nonEmpty(dto.qualityState.status, fallback: 'ready'),
        flags: _safeTextList(dto.qualityState.flags),
        warnings: _safeTextList(dto.qualityState.warnings),
        isSingleSource: dto.qualityState.isSingleSource,
      ),
      topicSections: dto.topicSections
          .map(_topicSectionToDomain)
          .toList(growable: false),
      sourceMix: dto.sourceMix.map(_sourceMixToDomain).toList(growable: false),
      topReads: dto.topReads.map(_readerItemToDomain).toList(growable: false),
      trendDelta: ReaderTrendDelta(
        newSignals: _safeTextList(dto.trendDelta.newSignals),
        growingSignals: _safeTextList(dto.trendDelta.growingSignals),
        repeatedSignals: _safeTextList(dto.trendDelta.repeatedSignals),
        fadingSignals: _safeTextList(dto.trendDelta.fadingSignals),
      ),
      openQuestions: _safeTextList(dto.openQuestions),
      risks: _safeTextList(dto.risks),
      nextActions: dto.nextActions
          .map(_nextActionToDomain)
          .toList(growable: false),
    );
  }

  ReaderTopicSection _topicSectionToDomain(ReaderTopicSectionApiDto dto) {
    return ReaderTopicSection(
      topicId: _nonEmptyOrNull(dto.topicId),
      title: _nonEmpty(dto.title, fallback: 'Topic signal'),
      insight: _safeText(dto.insight, fallback: 'No topic insight available'),
      items: dto.items.map(_readerItemToDomain).toList(growable: false),
      citationIds: dto.citationIds,
    );
  }

  TopRead _readerItemToDomain(TopReadApiDto dto) {
    return TopRead(
      title: _nonEmpty(dto.title, fallback: 'Untitled item'),
      providerKey: _nonEmpty(dto.providerKey, fallback: 'unknown'),
      reason: _safeText(dto.reason, fallback: 'Selected as relevant evidence'),
      matchedTopicIds: _safeTextList(dto.matchedTopicIds),
      matchedRules: _safeTextList(dto.matchedRules),
      signalScore: SignalScore.normalized(dto.signalScore),
      confidence: TopReadConfidence(
        level: _readerItemConfidenceLevel(dto.confidence.level),
        score: dto.confidence.score < 0
            ? 0
            : dto.confidence.score > 1
            ? 1
            : dto.confidence.score,
        rationale: _safeText(
          dto.confidence.rationale,
          fallback: 'Single-source story signal.',
        ),
      ),
      confirmedProviderKeys: _safeTextList(dto.confirmedProviderKeys),
      providerMetrics: dto.providerMetrics
          .map(
            (metric) => ProviderMetric(
              label: _nonEmpty(metric.label, fallback: 'Metric'),
              value: _nonEmpty(metric.value, fallback: '0'),
            ),
          )
          .toList(growable: false),
      whyImportant: _safeTextList(dto.whyImportant),
      whyNow: _safeText(
        dto.whyNow,
        fallback: 'Selected in the current summary window',
      ),
      citationIds: dto.citationIds,
      canonicalUrl: _safeUrl(dto.canonicalUrl),
    );
  }

  String _readerItemConfidenceLevel(String value) {
    return switch (value.trim().toLowerCase()) {
      'high' => 'high',
      'medium' => 'medium',
      _ => 'low',
    };
  }

  SourceMixEntry _sourceMixToDomain(SourceMixEntryApiDto dto) {
    return SourceMixEntry(
      providerKey: _nonEmpty(dto.providerKey, fallback: 'unknown'),
      itemCount: dto.itemCount < 0 ? 0 : dto.itemCount,
      citationCount: dto.citationCount < 0 ? 0 : dto.citationCount,
      storyClusterCount: dto.storyClusterCount < 0 ? 0 : dto.storyClusterCount,
      crossSourceClusterCount: dto.crossSourceClusterCount < 0
          ? 0
          : dto.crossSourceClusterCount,
      singleSourceOnly: dto.singleSourceOnly,
      topicIds: _safeTextList(dto.topicIds),
    );
  }

  ReaderAction _nextActionToDomain(ReaderActionApiDto dto) {
    return ReaderAction(
      kind: _nonEmpty(dto.kind, fallback: 'read_source'),
      label: _safeText(dto.label, fallback: 'Review source'),
      reason: _safeText(dto.reason, fallback: 'Recommended by summary'),
      citationIds: dto.citationIds,
      canonicalUrl: _safeUrl(dto.canonicalUrl),
    );
  }

  SummaryStory _summaryStoryToDomain(SummaryStoryApiDto dto) {
    return SummaryStory(
      title: _nonEmpty(dto.title, fallback: 'Untitled story'),
      summary: _safeText(dto.summary, fallback: 'No story summary available'),
      topicCount: dto.topicCount,
      providerCount: dto.providerCount,
      citationIds: dto.citationIds,
    );
  }

  RepeatedSignal _repeatedSignalToDomain(RepeatedSignalApiDto dto) {
    return RepeatedSignal(
      title: _nonEmpty(dto.title, fallback: 'Repeated signal'),
      topicIds: dto.topicIds,
      citationIds: dto.citationIds,
    );
  }

  SummaryGenerationStatus _statusFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'ready' => SummaryGenerationStatus.ready,
      'generating' => SummaryGenerationStatus.generating,
      'degraded' => SummaryGenerationStatus.degraded,
      'failed' => SummaryGenerationStatus.failed,
      _ => SummaryGenerationStatus.unknown,
    };
  }

  ReaderSummaryJobStatus _summaryJobStatusFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'requested' => ReaderSummaryJobStatus.requested,
      'running' => ReaderSummaryJobStatus.running,
      'completed' => ReaderSummaryJobStatus.completed,
      'no_signal' => ReaderSummaryJobStatus.noSignal,
      'failed' => ReaderSummaryJobStatus.failed,
      _ => ReaderSummaryJobStatus.unknown,
    };
  }

  String _safeText(String raw, {required String fallback}) {
    final withoutSecrets = raw
        .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9._~+/=-]+'), '[redacted]')
        .replaceAll(RegExp(r'sk-[A-Za-z0-9_-]+'), '[redacted]')
        .replaceAll(RegExp(r'client_secret\s*[:=]\s*\S+'), '[redacted]');
    final singleLine = withoutSecrets.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (singleLine.isEmpty) {
      return fallback;
    }
    return singleLine.length <= 240
        ? singleLine
        : '${singleLine.substring(0, 237)}...';
  }

  String _nonEmpty(String? value, {required String fallback}) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return fallback;
    }
    return trimmed;
  }

  String? _nonEmptyOrNull(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }

  List<String> _safeTextList(List<String> values) {
    return values
        .map((value) => _safeText(value, fallback: ''))
        .where((value) => value.isNotEmpty)
        .toList(growable: false);
  }

  String? _safeUrl(String? value) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return null;
    }
    final parsed = Uri.tryParse(trimmed);
    if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
      return null;
    }
    if (parsed.scheme != 'https' && parsed.scheme != 'http') {
      return null;
    }
    final redactedQuery = Map<String, String>.fromEntries(
      parsed.queryParameters.entries.where(
        (entry) => !_looksSecretQueryKey(entry.key),
      ),
    );
    return Uri(
      scheme: parsed.scheme,
      host: parsed.host,
      port: parsed.hasPort ? parsed.port : null,
      path: parsed.path,
      queryParameters: redactedQuery.isEmpty ? null : redactedQuery,
    ).toString();
  }

  bool _looksSecretQueryKey(String key) {
    final normalized = key.toLowerCase();
    return normalized.contains('token') ||
        normalized.contains('secret') ||
        normalized.contains('key') ||
        normalized.contains('password');
  }
}
