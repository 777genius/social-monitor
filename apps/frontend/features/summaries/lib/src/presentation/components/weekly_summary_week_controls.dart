import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/value_objects/weekly_summary_week.dart';
import '../formatters/weekly_summary_projection_text.dart';

class WeeklySummaryWeekControls extends StatelessWidget {
  const WeeklySummaryWeekControls({
    super.key,
    required this.week,
    required this.onPreviousWeek,
    required this.onNextWeek,
    required this.onRetry,
  });

  final WeeklySummaryWeek week;
  final VoidCallback onPreviousWeek;
  final VoidCallback onNextWeek;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final label = weeklySummaryWeekLabel(week);
    return Semantics(
      container: true,
      label: 'Weekly summary window $label',
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          AppButton(
            controlKeyBase: 'weekly-summary-previous',
            label: 'Previous week',
            icon: Icons.chevron_left,
            onPressed: onPreviousWeek,
            variant: AppButtonVariant.secondary,
          ),
          AppStatusBadge(label: label),
          AppButton(
            controlKeyBase: 'weekly-summary-next',
            label: 'Next week',
            icon: Icons.chevron_right,
            onPressed: onNextWeek,
            variant: AppButtonVariant.secondary,
          ),
          AppButton(
            controlKeyBase: 'weekly-summary-retry',
            label: 'Retry',
            icon: Icons.refresh,
            onPressed: onRetry,
            variant: AppButtonVariant.text,
          ),
        ],
      ),
    );
  }
}
