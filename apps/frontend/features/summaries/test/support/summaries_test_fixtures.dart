import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_generation_status.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_id.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

const summaryWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

SummaryCitationApiDto summaryCitationApiDto({
  String id = 'c-1',
  String sourceLabel = 'Reddit thread',
  String rawSnippet = 'Users compared competitor pricing tiers.',
}) {
  return SummaryCitationApiDto(
    id: id,
    sourceLabel: sourceLabel,
    rawSnippet: rawSnippet,
  );
}

SummaryApiDto summaryApiDto({
  String id = 's-1',
  String title = 'Weekly risk briefing',
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

BriefingApiDto briefingApiDto({
  String id = 'briefing-1',
  String title = 'AI workspace briefing',
  String executiveSummary =
      'AI model launches and developer tooling changes are the strongest signals.',
  List<BriefingStoryApiDto> topStories = const [
    BriefingStoryApiDto(
      title: 'New AI coding tools gain adoption',
      summary: 'Developers discussed new agent workflows and IDE support.',
      topicCount: 2,
      providerCount: 3,
      citationIds: ['bc-1'],
    ),
  ],
  List<BriefingRepeatedSignalApiDto> repeatedSignals = const [],
  List<SummaryCitationApiDto>? citations,
  String freshnessLabel = 'Fresh',
  bool isDegraded = false,
}) {
  return BriefingApiDto(
    id: id,
    title: title,
    executiveSummary: executiveSummary,
    topStories: topStories,
    repeatedSignals: repeatedSignals,
    citations: citations ?? [summaryCitationApiDto(id: 'bc-1')],
    freshnessLabel: freshnessLabel,
    isDegraded: isDegraded,
  );
}

GeneratedSummary generatedSummary({
  String id = 's-1',
  String title = 'Weekly risk briefing',
  String bodyPreview =
      'Pricing pressure increased while launch sentiment stayed stable.',
  SummaryGenerationStatus status = SummaryGenerationStatus.ready,
  List<SummaryCitation> citations = const [
    SummaryCitation(
      id: 'c-1',
      sourceLabel: 'Reddit thread',
      safeSnippet: 'Users compared competitor pricing tiers.',
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
