import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';

class WorkspaceSummaryPeriodToolbar extends StatelessWidget {
  const WorkspaceSummaryPeriodToolbar({
    super.key,
    required this.selectedPeriod,
    required this.selectedPreset,
    required this.canNavigateToNextPeriod,
    required this.isCurrentPeriod,
    required this.onPeriodChanged,
    required this.onPreviousPeriod,
    required this.onCurrentPeriod,
    required this.onNextPeriod,
  });

  final SummaryPeriod selectedPeriod;
  final SummaryPeriodPreset selectedPreset;
  final bool canNavigateToNextPeriod;
  final bool isCurrentPeriod;
  final ValueChanged<SummaryPeriodPreset> onPeriodChanged;
  final VoidCallback onPreviousPeriod;
  final VoidCallback onCurrentPeriod;
  final VoidCallback onNextPeriod;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    var selectorWidth = MediaQuery.sizeOf(context).width - AppSpacing.lg;
    if (selectorWidth > 420) {
      selectorWidth = 420;
    }
    if (selectorWidth < 180) {
      selectorWidth = 180;
    }

    return Wrap(
      spacing: AppSpacing.md,
      runSpacing: AppSpacing.sm,
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Workspace summary',
              style: textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
            Text(
              selectedPeriod.rangeLabel,
              style: textTheme.bodySmall?.copyWith(letterSpacing: 0),
            ),
          ],
        ),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            IconButton(
              tooltip: 'Previous period',
              icon: const Icon(Icons.chevron_left),
              onPressed: onPreviousPeriod,
            ),
            IconButton(
              tooltip: 'Current period',
              icon: const Icon(Icons.today_outlined),
              onPressed: isCurrentPeriod ? null : onCurrentPeriod,
            ),
            IconButton(
              tooltip: 'Next period',
              icon: const Icon(Icons.chevron_right),
              onPressed: canNavigateToNextPeriod ? onNextPeriod : null,
            ),
            SizedBox(
              width: selectorWidth,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SegmentedButton<SummaryPeriodPreset>(
                  showSelectedIcon: false,
                  selected: {selectedPreset},
                  segments: [
                    for (final preset in SummaryPeriodPreset.values)
                      ButtonSegment<SummaryPeriodPreset>(
                        value: preset,
                        label: Text(preset.label),
                      ),
                  ],
                  onSelectionChanged: (selection) {
                    final next = selection.firstOrNull;
                    if (next != null) {
                      onPeriodChanged(next);
                    }
                  },
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
