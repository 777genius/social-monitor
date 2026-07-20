import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_generation_status.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_id.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

SummaryCitationApiDto summaryCitationApiDto({
  String id = 'c-1',
  String sourceLabel = 'Reddit thread',
  String rawSnippet = 'Users compared competitor pricing tiers.',
  String feedItemId = 'feed-c-1',
  String sourceItemId = 'source-c-1',
  String? providerKey,
  String? canonicalUrl,
}) {
  return SummaryCitationApiDto(
    id: id,
    sourceLabel: sourceLabel,
    rawSnippet: rawSnippet,
    feedItemId: feedItemId,
    sourceItemId: sourceItemId,
    providerKey: providerKey,
    canonicalUrl: canonicalUrl,
  );
}

SummaryApiDto summaryApiDto({
  String id = 's-1',
  String title = 'Weekly risk summary',
  String status = 'ready',
  String bodyText =
      'Pricing pressure increased while launch sentiment stayed stable.',
  List<SummaryCitationApiDto>? citations,
  String freshnessLabel = 'Today',
  bool feedbackSubmitted = false,
}) {
  return SummaryApiDto(
    id: id,
    title: title,
    status: status,
    bodyText: bodyText,
    citations: citations ?? [summaryCitationApiDto()],
    freshnessLabel: freshnessLabel,
    feedbackSubmitted: feedbackSubmitted,
  );
}

GeneratedSummary generatedSummary({
  String id = 's-1',
  String title = 'Weekly risk summary',
  String bodyPreview =
      'Pricing pressure increased while launch sentiment stayed stable.',
  SummaryGenerationStatus status = SummaryGenerationStatus.ready,
  List<SummaryCitation> citations = const [
    SummaryCitation(
      id: 'c-1',
      sourceLabel: 'Reddit thread',
      safeSnippet: 'Users compared competitor pricing tiers.',
      feedItemId: 'feed-c-1',
      sourceItemId: 'source-c-1',
    ),
  ],
  String freshnessLabel = 'Today',
  bool feedbackSubmitted = false,
}) {
  return GeneratedSummary(
    id: SummaryId(id),
    title: title,
    bodyPreview: bodyPreview,
    status: status,
    citations: citations,
    freshnessLabel: freshnessLabel,
    feedbackSubmitted: feedbackSubmitted,
  );
}

PageResult<GeneratedSummary> generatedSummaryPage(
  List<GeneratedSummary> items, {
  PageRequest request = const PageRequest(),
}) {
  return PageResult<GeneratedSummary>(items: items, request: request);
}
