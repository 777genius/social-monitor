import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/summary_api_dto.dart';
import 'briefing_reader_brief_rest_mapper.dart';

final class GeneratedSummaryRestMapper {
  const GeneratedSummaryRestMapper();

  static const _readerBriefMapper = BriefingReaderBriefRestMapper();

  SummaryPageApiDto list(generated.ListSummariesResponseDto dto) {
    return SummaryPageApiDto(
      items: dto.items.map(artifact).toList(growable: false),
      nextCursor: dto.nextCursor,
    );
  }

  BriefingApiDto briefing(generated.BriefingArtifactResponseDto dto) {
    return BriefingApiDto(
      id: dto.briefingId,
      title: dto.headline,
      executiveSummary: _briefingBodyText(
        executiveSummary: dto.executiveSummary,
        noSignalReason: dto.noSignalReason,
      ),
      userId: dto.userId,
      readerBrief: _readerBriefMapper.map(dto.readerBrief),
      topStories: dto.topStories
          .map(
            (story) => BriefingStoryApiDto(
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
            (signal) => BriefingRepeatedSignalApiDto(
              title: signal.title,
              topicIds: signal.topicIds,
              citationIds: signal.citationIds,
            ),
          )
          .toList(growable: false),
      citations: dto.citations.map(_briefingCitation).toList(growable: false),
      freshnessLabel: _briefingFreshnessLabel(dto.freshness),
      isDegraded: dto.qualityFlags.any(_isDegradedBriefingFlag),
    );
  }

  BriefingJobApiDto requestedBriefingJob(
    generated.RequestBriefingResponseDto dto,
  ) {
    return BriefingJobApiDto(
      id: dto.briefingJobId,
      status: _requestBriefingStatus(dto.status),
      created: dto.created,
    );
  }

  BriefingJobApiDto briefingJobStatus(
    generated.BriefingJobStatusResponseDto dto,
  ) {
    return BriefingJobApiDto(
      id: dto.briefingJobId,
      status: _briefingJobStatus(dto.status),
      briefingId: dto.briefingId,
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

  SummaryCitationApiDto _briefingCitation(
    generated.BriefingCitationViewDto dto,
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

  bool _isDegradedBriefingFlag(
    generated.BriefingArtifactResponseDtoQualityFlagsQualityFlags flag,
  ) {
    return switch (flag) {
      generated.BriefingArtifactResponseDtoQualityFlagsQualityFlags.noSignal ||
      generated
          .BriefingArtifactResponseDtoQualityFlagsQualityFlags
          .lowConfidence ||
      generated
          .BriefingArtifactResponseDtoQualityFlagsQualityFlags
          .conflictingEvidence ||
      generated
          .BriefingArtifactResponseDtoQualityFlagsQualityFlags
          .limitedSources ||
      generated
          .BriefingArtifactResponseDtoQualityFlagsQualityFlags
          .partialEvidence ||
      generated
          .BriefingArtifactResponseDtoQualityFlagsQualityFlags
          .contextUnavailable => true,
      generated
          .BriefingArtifactResponseDtoQualityFlagsQualityFlags
          .providerFailed =>
        true,
      generated.BriefingArtifactResponseDtoQualityFlagsQualityFlags.$unknown =>
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

  String _briefingFreshnessLabel(generated.BriefingFreshnessDto freshness) {
    return switch (freshness.status) {
      generated.BriefingFreshnessDtoStatusStatus.fresh => 'Fresh',
      generated.BriefingFreshnessDtoStatusStatus.stale => 'Stale',
      generated.BriefingFreshnessDtoStatusStatus.$unknown => 'Unknown',
    };
  }

  String _requestBriefingStatus(
    generated.RequestBriefingResponseDtoStatusStatus status,
  ) {
    return switch (status) {
      generated.RequestBriefingResponseDtoStatusStatus.requested => 'requested',
      generated.RequestBriefingResponseDtoStatusStatus.running => 'running',
      generated.RequestBriefingResponseDtoStatusStatus.completed => 'completed',
      generated.RequestBriefingResponseDtoStatusStatus.noSignal => 'no_signal',
      generated.RequestBriefingResponseDtoStatusStatus.failed => 'failed',
      generated.RequestBriefingResponseDtoStatusStatus.$unknown => 'unknown',
    };
  }

  String _briefingJobStatus(
    generated.BriefingJobStatusResponseDtoStatusStatus status,
  ) {
    return switch (status) {
      generated.BriefingJobStatusResponseDtoStatusStatus.requested =>
        'requested',
      generated.BriefingJobStatusResponseDtoStatusStatus.running => 'running',
      generated.BriefingJobStatusResponseDtoStatusStatus.completed =>
        'completed',
      generated.BriefingJobStatusResponseDtoStatusStatus.noSignal =>
        'no_signal',
      generated.BriefingJobStatusResponseDtoStatusStatus.failed => 'failed',
      generated.BriefingJobStatusResponseDtoStatusStatus.$unknown => 'unknown',
    };
  }

  String _briefingBodyText({
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
    return normalized.isEmpty ? 'No briefing available' : normalized;
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
