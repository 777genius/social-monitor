import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import 'reader_summary_sections.dart';

class ReaderSummaryReliabilityIndicators extends StatelessWidget {
  const ReaderSummaryReliabilityIndicators({super.key, required this.report});

  final SummaryReliabilityReport report;

  @override
  Widget build(BuildContext context) {
    if (report.risks.isEmpty) {
      return const SizedBox.shrink();
    }

    return ReaderSummarySection(
      title: 'Reliability',
      icon: Icons.shield_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              AppStatusBadge(
                label:
                    '${_levelLabel(report.riskLevel)} risk ${_percent(report.riskScore)}%',
                tone: _tone(report.riskLevel),
              ),
              for (final risk in report.risks.take(5))
                AppStatusBadge(
                  label: _riskLabel(risk.kind),
                  tone: _tone(risk.level),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          ...report.risks
              .take(2)
              .map(
                (risk) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Text(
                    risk.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      letterSpacing: 0,
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

String _riskLabel(String kind) {
  return switch (kind) {
    'duplicate_risk' => 'Duplicate risk',
    'stale_evidence' => 'Stale evidence',
    'single_source' => 'Single source',
    'weak_source' => 'Weak source',
    'low_evidence_diversity' => 'Low diversity',
    _ => 'Evidence risk',
  };
}

String _levelLabel(String level) {
  return switch (level) {
    'high' => 'High',
    'medium' => 'Medium',
    _ => 'Low',
  };
}

int _percent(double score) => (score.clamp(0, 1) * 100).round();

AppStatusTone _tone(String level) {
  return switch (level) {
    'high' => AppStatusTone.danger,
    'medium' => AppStatusTone.warning,
    _ => AppStatusTone.neutral,
  };
}
