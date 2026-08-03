import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/weekly_summary_artifact.dart';
import '../../domain/entities/weekly_summary_section.dart';
import '../../domain/entities/weekly_summary_story.dart';
import '../../domain/value_objects/weekly_summary_week.dart';
import '../formatters/weekly_summary_projection_text.dart';
import 'weekly_summary_provenance_panel.dart';

class WeeklySummaryArtifactPanel extends StatelessWidget {
  const WeeklySummaryArtifactPanel({
    super.key,
    required this.artifact,
    required this.week,
  });

  final WeeklySummaryArtifact artifact;
  final WeeklySummaryWeek week;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const ValueKey('weekly-summary-artifact'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppEntityHeader(
          title: artifact.headline,
          subtitle: 'Certified weekly projection for ${weeklySummaryWeekLabel(week)}',
          status: const AppStatusBadge(
            label: 'Certified complete',
            tone: AppStatusTone.success,
          ),
          metadata: [
            AppEntityMetadata(
              label: 'Stories',
              value: artifact.stories.length.toString(),
            ),
            AppEntityMetadata(
              label: 'Citations',
              value: artifact.citations.length.toString(),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          weeklySummaryCitationLabel(artifact.headlineCitationIds),
          style: Theme.of(context).textTheme.labelMedium,
        ),
        const SizedBox(height: AppSpacing.lg),
        _NarrativeBlock(
          title: 'Takeaway',
          text: artifact.takeaway,
          citationIds: artifact.takeawayCitationIds,
        ),
        const SizedBox(height: AppSpacing.md),
        _NarrativeBlock(
          title: 'Weekly synthesis',
          text: artifact.synthesis,
          citationIds: artifact.synthesisCitationIds,
        ),
        const SizedBox(height: AppSpacing.lg),
        const AppSectionHeader(
          title: 'Stories',
          description:
              'Certified weekly stories preserve the observed window and their direct evidence references.',
        ),
        const SizedBox(height: AppSpacing.md),
        AppDataList<WeeklySummaryStory>(
          items: artifact.stories,
          stableId: (story) => story.storyId,
          emptyTitle: 'No certified stories',
          emptyMessage: 'No weekly story clusters were published for this window.',
          itemBuilder: (context, story, index) => _StoryTile(story: story),
        ),
        const SizedBox(height: AppSpacing.lg),
        const AppSectionHeader(
          title: 'Evidence-backed sections',
          description:
              'Every section identifies the source story, claim type, observed period, and evidence citations.',
        ),
        const SizedBox(height: AppSpacing.md),
        AppDataList<WeeklySummarySection>(
          items: artifact.sections,
          stableId: (section) => section.sectionId,
          emptyTitle: 'No published sections',
          emptyMessage: 'The certified artifact contains no section-level narrative.',
          itemBuilder: (context, section, index) => _SectionTile(section: section),
        ),
        const SizedBox(height: AppSpacing.lg),
        WeeklySummaryProvenancePanel(
          provenance: artifact.provenance,
          citations: artifact.citations,
        ),
      ],
    );
  }
}

class _NarrativeBlock extends StatelessWidget {
  const _NarrativeBlock({
    required this.title,
    required this.text,
    required this.citationIds,
  });

  final String title;
  final String text;
  final List<String> citationIds;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: '$title with ${citationIds.length} evidence citations',
      child: SelectionArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.xs),
            Text(text, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: AppSpacing.sm),
            Text(
              weeklySummaryCitationLabel(citationIds),
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryTile extends StatelessWidget {
  const _StoryTile({required this.story});

  final WeeklySummaryStory story;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'Story ${story.headline}',
      child: ListTile(
        title: Text(story.headline),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xs),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(story.summary),
              Text('${story.observedFrom} to ${story.observedThrough} UTC'),
              Text(weeklySummaryCitationLabel(story.citationIds)),
            ],
          ),
        ),
        trailing: AppStatusBadge(label: weeklySummaryStoryStatusLabel(story.status)),
      ),
    );
  }
}

class _SectionTile extends StatelessWidget {
  const _SectionTile({required this.section});

  final WeeklySummarySection section;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'Section ${section.heading}',
      child: ListTile(
        title: Text(section.heading),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xs),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(section.text),
              Text(
                '${weeklySummarySectionKindLabel(section.kind)} · ${weeklySummaryClaimTypeLabel(section.claimType)}',
              ),
              Text('Story id: ${section.storyId}'),
              Text('${section.observedFrom} to ${section.observedThrough} UTC'),
              Text(weeklySummaryCitationLabel(section.citationIds)),
            ],
          ),
        ),
      ),
    );
  }
}
