import '../../domain/aggregates/weekly_summary_projection.dart';
import '../../domain/entities/weekly_summary_section.dart';
import '../../domain/entities/weekly_summary_story.dart';
import '../../domain/value_objects/weekly_summary_week.dart';

String weeklySummaryWeekLabel(WeeklySummaryWeek week) =>
    '${week.startedOnIso} to ${week.endedOnIso} UTC';

String weeklySummaryStatusLabel(WeeklySummaryProjectionStatus status) =>
    switch (status) {
      WeeklySummaryProjectionStatus.complete => 'Certified complete',
      WeeklySummaryProjectionStatus.partial => 'Evidence incomplete',
      WeeklySummaryProjectionStatus.unavailable => 'Unavailable',
    };

String weeklySummaryBlockingReasonTitle(WeeklySummaryBlockingReason reason) =>
    switch (reason) {
      WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete =>
        'Daily evidence is incomplete',
      WeeklySummaryBlockingReason.activeWeeklyCertifiedArtifactMissing =>
        'Certified weekly artifact is missing',
    };

String weeklySummaryBlockingReasonDescription(
  WeeklySummaryBlockingReason reason,
) =>
    switch (reason) {
      WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete =>
        'All seven certified daily evidence records are required before the weekly artifact can be displayed.',
      WeeklySummaryBlockingReason.activeWeeklyCertifiedArtifactMissing =>
        'No active artifact has passed the weekly certification and publication checks for this window.',
    };

String weeklySummaryStoryStatusLabel(WeeklySummaryStoryStatus status) =>
    switch (status) {
      WeeklySummaryStoryStatus.newStory => 'New',
      WeeklySummaryStoryStatus.developing => 'Developing',
      WeeklySummaryStoryStatus.resolved => 'Resolved',
      WeeklySummaryStoryStatus.watch => 'Watch',
    };

String weeklySummarySectionKindLabel(WeeklySummarySectionKind kind) =>
    switch (kind) {
      WeeklySummarySectionKind.lead => 'Lead',
      WeeklySummarySectionKind.development => 'Development',
      WeeklySummarySectionKind.whyItMatters => 'Why it matters',
      WeeklySummarySectionKind.watch => 'Watch',
    };

String weeklySummaryClaimTypeLabel(WeeklySummaryClaimType claimType) =>
    switch (claimType) {
      WeeklySummaryClaimType.snapshot => 'Snapshot claim',
      WeeklySummaryClaimType.evolution => 'Evolution claim',
      WeeklySummaryClaimType.resolution => 'Resolution claim',
    };

String weeklySummaryCitationLabel(Iterable<String> citationIds) =>
    citationIds.isEmpty
        ? 'No direct citation ids'
        : 'Citations: ${citationIds.join(', ')}';
