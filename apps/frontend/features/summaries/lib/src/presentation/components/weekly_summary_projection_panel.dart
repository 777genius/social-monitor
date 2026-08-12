import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/weekly_summary_projection.dart';
import '../formatters/weekly_summary_projection_text.dart';
import 'weekly_summary_artifact_panel.dart';
import 'weekly_summary_evidence_limitations_panel.dart';

class WeeklySummaryProjectionPanel extends StatelessWidget {
  const WeeklySummaryProjectionPanel({super.key, required this.projection});

  final WeeklySummaryProjection projection;

  @override
  Widget build(BuildContext context) {
    return switch (projection) {
      CompleteWeeklySummaryProjection(:final artifact, :final week) =>
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            WeeklySummaryEvidenceLimitationsPanel(
              limitations: projection.evidenceLimitations,
            ),
            if (projection.evidenceLimitations.isNotEmpty)
              const SizedBox(height: AppSpacing.lg),
            WeeklySummaryArtifactPanel(artifact: artifact, week: week),
          ],
        ),
      final BlockedWeeklySummaryProjection blocked =>
        _BlockedWeeklySummaryPanel(projection: blocked),
    };
  }
}

class _BlockedWeeklySummaryPanel extends StatelessWidget {
  const _BlockedWeeklySummaryPanel({required this.projection});

  final BlockedWeeklySummaryProjection projection;

  @override
  Widget build(BuildContext context) {
    final isPartial = projection.status == WeeklySummaryProjectionStatus.partial;
    final evidenceIncomplete = projection.missingDailyEvidenceDates.isNotEmpty;
    final missingDays = projection.missingDailyEvidenceDates.join(', ');
    return Semantics(
      container: true,
      liveRegion: true,
      label:
          'Weekly summary ${weeklySummaryStatusLabel(projection.status)}. ${projection.blockingReasons.length} blocking reasons.',
      child: Column(
        key: const ValueKey('weekly-summary-blocked'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppInlineProblem(
            title: switch ((isPartial, evidenceIncomplete)) {
              (true, true) => 'Certified evidence is incomplete',
              (true, false) => 'Certified weekly artifact is unavailable',
              (false, _) => 'No certified weekly summary is available',
            },
            message: switch ((isPartial, evidenceIncomplete)) {
              (true, true) =>
                'The weekly artifact is intentionally withheld until every daily evidence record is certified.',
              (true, false) =>
                'All daily evidence is certified, but no active weekly artifact passed certification and publication checks.',
              (false, _) =>
                'This week does not have a certified evidence set or active weekly artifact to display.',
            },
            tone: AppProblemTone.warning,
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              AppStatusBadge(
                label: weeklySummaryStatusLabel(projection.status),
                tone: AppStatusTone.warning,
              ),
              AppStatusBadge(
                label:
                    '${projection.certifiedDailyEvidenceDates.length} of 7 daily evidence records certified',
              ),
            ],
          ),
          if (projection.evidenceLimitations.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            WeeklySummaryEvidenceLimitationsPanel(
              limitations: projection.evidenceLimitations,
            ),
          ],
          if (missingDays.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              'Missing certified UTC dates: $missingDays',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          for (final reason in projection.blockingReasons) ...[
            ListTile(
              leading: const Icon(Icons.block_outlined),
              title: Text(weeklySummaryBlockingReasonTitle(reason)),
              subtitle: Text(
                '${weeklySummaryBlockingReasonDescription(reason)}\nCode: ${reason.code}',
              ),
            ),
            const Divider(height: 1),
          ],
        ],
      ),
    );
  }
}
