import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import 'reader_summary_provider_label.dart';
import 'reader_summary_sections.dart';

class ReaderSummaryCoverageSummary extends StatelessWidget {
  const ReaderSummaryCoverageSummary({super.key, required this.entries});

  final List<SourceMixEntry> entries;

  @override
  Widget build(BuildContext context) {
    return ReaderSummarySection(
      title: 'Coverage',
      icon: Icons.hub_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_coverageText(entries), maxLines: 2),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: entries
                .expand((entry) => _coverageBadges(entry))
                .toList(growable: false),
          ),
        ],
      ),
    );
  }

  List<Widget> _coverageBadges(SourceMixEntry entry) {
    final provider = readerSummaryProviderLabel(entry.providerKey);
    return [
      AppStatusBadge(
        label: '$provider: ${entry.itemCount} items',
        tone: AppStatusTone.neutral,
      ),
      AppStatusBadge(
        label: '${entry.storyClusterCount} clusters',
        tone: AppStatusTone.neutral,
      ),
      if (entry.crossSourceClusterCount > 0)
        AppStatusBadge(
          label: '${entry.crossSourceClusterCount} cross-source',
          tone: AppStatusTone.success,
        )
      else if (entry.singleSourceOnly)
        const AppStatusBadge(
          label: 'needs confirmation',
          tone: AppStatusTone.warning,
        ),
    ];
  }

  String _coverageText(List<SourceMixEntry> entries) {
    final itemCount = entries.fold<int>(
      0,
      (count, entry) => count + entry.itemCount,
    );
    final clusterCount = entries.fold<int>(
      0,
      (count, entry) => count + entry.storyClusterCount,
    );
    final crossSourceCount = entries.fold<int>(
      0,
      (count, entry) => count + entry.crossSourceClusterCount,
    );
    if (entries.length == 1) {
      final provider = readerSummaryProviderLabel(entries.single.providerKey);
      return 'Only $provider contributed cited evidence across $clusterCount story clusters. Other connected providers did not confirm this yet.';
    }

    final labels = entries
        .take(3)
        .map((entry) => readerSummaryProviderLabel(entry.providerKey))
        .join(', ');
    final suffix = entries.length > 3 ? ' +${entries.length - 3} more' : '';
    return '$labels$suffix contributed $itemCount cited items across $clusterCount story clusters, with $crossSourceCount cross-source confirmations.';
  }
}
