import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/generated_briefing.dart';
import 'reader_briefing_sections.dart';

class ReaderBriefingQualitySummary extends StatelessWidget {
  const ReaderBriefingQualitySummary({
    super.key,
    required this.qualityState,
    required this.isDegraded,
  });

  final BriefingReaderQualityState qualityState;
  final bool isDegraded;

  @override
  Widget build(BuildContext context) {
    return ReaderBriefingSection(
      title: 'Quality',
      icon: Icons.verified_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              AppStatusBadge(
                label: _statusLabel(qualityState.status),
                tone: _statusTone(qualityState.status, isDegraded),
              ),
              if (qualityState.isSingleSource)
                const AppStatusBadge(
                  label: 'Single-source',
                  tone: AppStatusTone.warning,
                ),
              ...qualityState.flags
                  .take(3)
                  .map(
                    (flag) => AppStatusBadge(
                      label: _flagLabel(flag),
                      tone: AppStatusTone.neutral,
                    ),
                  ),
            ],
          ),
          if (qualityState.warnings.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            ...qualityState.warnings
                .take(2)
                .map(
                  (warning) => Text(
                    warning,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
          ],
        ],
      ),
    );
  }

  String _statusLabel(String value) {
    return switch (value) {
      'partial' => 'Partial',
      'limited_sources' => 'Limited sources',
      'low_confidence' => 'Low confidence',
      'no_signal' => 'No signal',
      'failed_provider' => 'Provider failed',
      _ => 'Ready',
    };
  }

  String _flagLabel(String value) {
    return value
        .split('_')
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }

  AppStatusTone _statusTone(String value, bool isDegraded) {
    return switch (value) {
      'ready' when !isDegraded => AppStatusTone.success,
      'failed_provider' || 'no_signal' => AppStatusTone.danger,
      _ => AppStatusTone.warning,
    };
  }
}
