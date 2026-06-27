import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/summary_api_dto.dart';
import 'reader_summary_content_rest_mapper.dart';

final class GeneratedSummaryRestMapper {
  const GeneratedSummaryRestMapper();

  static const _readerSummaryContentMapper = ReaderSummaryContentRestMapper();

  SummaryPageApiDto list(generated.ListSummariesResponseDto dto) {
    return SummaryPageApiDto(
      items: dto.items.map(artifact).toList(growable: false),
      nextCursor: dto.nextCursor,
    );
  }

  ReaderSummaryApiDto readerSummary(generated.ReaderSummaryArtifactResponseDto dto) {
    return ReaderSummaryApiDto(
      id: dto.readerSummaryId,
      title: dto.headline,
      executiveSummary: _readerSummaryBodyText(
        executiveSummary: dto.executiveSummary,
        noSignalReason: dto.noSignalReason,
      ),
      userId: dto.userId,
      content: _readerSummaryContentMapper.map(dto.readerBrief),
      topStories: dto.topStories
          .map(
            (story) => SummaryStoryApiDto(
              title: story.title,
              summary: story.summary,
              topicCount: story.topicIds.length,
              providerCount: story.providerKeys.length,
              citationIds: story.citationIds,
            ),
          )
          .toList(growable: false),
      repeatedSignals: dto.repeatedSignals
          .map(
            (signal) => RepeatedSignalApiDto(
              title: signal.title,
              topicIds: signal.topicIds,
              citationIds: signal.citationIds,
            ),
          )
          .toList(growable: false),
      citations: dto.citations
          .map(_readerSummaryCitation)
          .toList(growable: false),
      freshnessLabel: _readerSummaryFreshnessLabel(dto.freshness),
      isDegraded: dto.qualityFlags.any(_isDegradedReaderSummaryFlag),
    );
  }

  ReaderSummaryJobApiDto requestedReaderSummaryJob(
    generated.RequestReaderSummaryResponseDto dto,
  ) {
    return ReaderSummaryJobApiDto(
      id: dto.readerSummaryJobId,
      status: _requestReaderSummaryStatus(dto.status),
      created: dto.created,
    );
  }

  ReaderSummaryJobApiDto readerSummaryJobStatus(
    generated.ReaderSummaryJobStatusResponseDto dto,
  ) {
    return ReaderSummaryJobApiDto(
      id: dto.readerSummaryJobId,
      status: _readerSummaryJobStatus(dto.status),
      summaryId: dto.readerSummaryId,
      failureReason: dto.failureReason,
      requestedAt: dto.requestedAt,
      startedAt: dto.startedAt,
      completedAt: dto.completedAt,
      failedAt: dto.failedAt,
    );
  }

  SummaryApiDto artifact(
    generated.SummaryArtifactResponseDto dto, {
    String? status,
    bool feedbackSubmitted = false,
  }) {
    return SummaryApiDto(
      id: dto.summaryId,
      title: dto.headline,
      status: status ?? _artifactStatus(dto.qualityFlags),
      bodyText: _bodyText(
        executiveSummary: dto.executiveSummary,
        keyPointClaims: dto.keyPoints.map((point) => point.claim),
        sourceHighlights: dto.sourceHighlights,
        noSignalReason: dto.noSignalReason,
      ),
      citations: dto.citations.map(_citation).toList(growable: false),
      freshnessLabel: _freshnessLabel(dto.freshness),
      feedbackSubmitted: feedbackSubmitted,
    );
  }

  SummaryApiDto detail(
    generated.SummaryResponseDto dto, {
    String? status,
    bool feedbackSubmitted = false,
  }) {
    return SummaryApiDto(
      id: dto.summaryId,
      title: dto.headline,
      status: status ?? _detailStatus(dto.qualityFlags),
      bodyText: _bodyText(
        executiveSummary: dto.executiveSummary,
        keyPointClaims: dto.keyPoints.map((point) => point.claim),
        sourceHighlights: dto.sourceHighlights,
        noSignalReason: dto.noSignalReason,
      ),
      citations: dto.citations.map(_citation).toList(growable: false),
      freshnessLabel: _freshnessLabel(dto.freshness),
      feedbackSubmitted: feedbackSubmitted,
    );
  }

  SummaryCitationApiDto _citation(generated.SummaryCitationViewDto dto) {
    final field = dto.field.json ?? 'evidence';
    return SummaryCitationApiDto(
      id: dto.citationId,
      sourceLabel: '${_providerLabel(dto.providerKey)} ${dto.label}',
      rawSnippet: _citationSnippet(
        providerKey: dto.providerKey,
        field: field,
        sourceItemId: dto.sourceItemId,
      ),
      canonicalUrl: dto.canonicalUrl,
    );
  }

  SummaryCitationApiDto _readerSummaryCitation(
    generated.ReaderSummaryCitationViewDto dto,
  ) {
    final field = dto.field.json ?? 'evidence';
    return SummaryCitationApiDto(
      id: dto.citationId,
      sourceLabel: '${_providerLabel(dto.providerKey)} ${dto.label}',
      rawSnippet: _citationSnippet(
        providerKey: dto.providerKey,
        field: field,
        sourceItemId: dto.sourceItemId,
      ),
      canonicalUrl: dto.canonicalUrl,
    );
  }

  String _citationSnippet({
    required String providerKey,
    required String field,
    required String sourceItemId,
  }) {
    final provider = _providerLabel(providerKey);
    return '$provider citation references $field evidence from source item $sourceItemId.';
  }

  String _providerLabel(String providerKey) {
    return switch (providerKey.toLowerCase()) {
      'github-trending-page' => 'GitHub Trending',
      'github-repo-radar' => 'Repo Radar',
      'github-issues' || 'github' => 'GitHub',
      'hacker-news' || 'hn' => 'Hacker News',
      'reddit' => 'Reddit',
      'rss' => 'RSS',
      _ => providerKey,
    };
  }

  String _artifactStatus(
    List<generated.SummaryArtifactResponseDtoQualityFlagsQualityFlags> flags,
  ) {
    if (flags.any(_isDegradedArtifactFlag)) {
      return 'degraded';
    }
    return 'ready';
  }

  String _detailStatus(
    List<generated.SummaryResponseDtoQualityFlagsQualityFlags> flags,
  ) {
    if (flags.any(_isDegradedDetailFlag)) {
      return 'degraded';
    }
    return 'ready';
  }

  bool _isDegradedArtifactFlag(
    generated.SummaryArtifactResponseDtoQualityFlagsQualityFlags flag,
  ) {
    return switch (flag) {
      generated.SummaryArtifactResponseDtoQualityFlagsQualityFlags.noSignal ||
      generated
          .SummaryArtifactResponseDtoQualityFlagsQualityFlags
          .lowConfidence ||
      generated
          .SummaryArtifactResponseDtoQualityFlagsQualityFlags
          .conflictingEvidence ||
      generated
          .SummaryArtifactResponseDtoQualityFlagsQualityFlags
          .limitedSources => true,
      generated.SummaryArtifactResponseDtoQualityFlagsQualityFlags.$unknown =>
        false,
    };
  }

  bool _isDegradedDetailFlag(
    generated.SummaryResponseDtoQualityFlagsQualityFlags flag,
  ) {
    return switch (flag) {
      generated.SummaryResponseDtoQualityFlagsQualityFlags.noSignal ||
      generated.SummaryResponseDtoQualityFlagsQualityFlags.lowConfidence ||
      generated
          .SummaryResponseDtoQualityFlagsQualityFlags
          .conflictingEvidence ||
      generated.SummaryResponseDtoQualityFlagsQualityFlags.limitedSources =>
        true,
      generated.SummaryResponseDtoQualityFlagsQualityFlags.$unknown => false,
    };
  }

  bool _isDegradedReaderSummaryFlag(
    generated.ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags flag,
  ) {
    return switch (flag) {
      generated.ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags.noSignal ||
      generated
          .ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags
          .lowConfidence ||
      generated
          .ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags
          .conflictingEvidence ||
      generated
          .ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags
          .limitedSources ||
      generated
          .ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags
          .partialEvidence ||
      generated
          .ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags
          .contextUnavailable => true,
      generated
          .ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags
          .providerFailed =>
        true,
      generated.ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags.$unknown =>
        false,
    };
  }

  String _freshnessLabel(generated.SummaryFreshnessDto freshness) {
    return switch (freshness.status) {
      generated.SummaryFreshnessDtoStatusStatus.fresh => 'Fresh',
      generated.SummaryFreshnessDtoStatusStatus.stale => 'Stale',
      generated.SummaryFreshnessDtoStatusStatus.$unknown => 'Unknown',
    };
  }

  String _readerSummaryFreshnessLabel(
    generated.ReaderSummaryFreshnessDto freshness,
  ) {
    return switch (freshness.status) {
      generated.ReaderSummaryFreshnessDtoStatusStatus.fresh => 'Fresh',
      generated.ReaderSummaryFreshnessDtoStatusStatus.stale => 'Stale',
      generated.ReaderSummaryFreshnessDtoStatusStatus.$unknown => 'Unknown',
    };
  }

  String _requestReaderSummaryStatus(
    generated.RequestReaderSummaryResponseDtoStatusStatus status,
  ) {
    return switch (status) {
      generated.RequestReaderSummaryResponseDtoStatusStatus.requested => 'requested',
      generated.RequestReaderSummaryResponseDtoStatusStatus.running => 'running',
      generated.RequestReaderSummaryResponseDtoStatusStatus.completed => 'completed',
      generated.RequestReaderSummaryResponseDtoStatusStatus.noSignal => 'no_signal',
      generated.RequestReaderSummaryResponseDtoStatusStatus.failed => 'failed',
      generated.RequestReaderSummaryResponseDtoStatusStatus.$unknown => 'unknown',
    };
  }

  String _readerSummaryJobStatus(
    generated.ReaderSummaryJobStatusResponseDtoStatusStatus status,
  ) {
    return switch (status) {
      generated.ReaderSummaryJobStatusResponseDtoStatusStatus.requested =>
        'requested',
      generated.ReaderSummaryJobStatusResponseDtoStatusStatus.running => 'running',
      generated.ReaderSummaryJobStatusResponseDtoStatusStatus.completed =>
        'completed',
      generated.ReaderSummaryJobStatusResponseDtoStatusStatus.noSignal =>
        'no_signal',
      generated.ReaderSummaryJobStatusResponseDtoStatusStatus.failed => 'failed',
      generated.ReaderSummaryJobStatusResponseDtoStatusStatus.$unknown => 'unknown',
    };
  }

  String _readerSummaryBodyText({
    required String executiveSummary,
    required String? noSignalReason,
  }) {
    final parts = <String>[
      executiveSummary,
      ...?noSignalReason == null ? null : <String>[noSignalReason],
    ];
    final normalized = parts
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .join(' ');
    return normalized.isEmpty ? 'No summary available' : normalized;
  }

  String _bodyText({
    required String executiveSummary,
    required Iterable<String> keyPointClaims,
    required Iterable<String> sourceHighlights,
    required String? noSignalReason,
  }) {
    final parts = <String>[
      executiveSummary,
      ...keyPointClaims,
      ...sourceHighlights,
      ...?noSignalReason == null ? null : <String>[noSignalReason],
    ];
    final normalized = parts
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .join(' ');
    return normalized.isEmpty ? 'No summary available' : normalized;
  }
}
