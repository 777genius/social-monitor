import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';

class ReaderSummaryHeader extends StatelessWidget {
  const ReaderSummaryHeader({
    super.key,
    required this.title,
    required this.isRefreshing,
    required this.freshnessLabel,
    required this.isDegraded,
    required this.summaryWindow,
  });

  final String title;
  final bool isRefreshing;
  final String freshnessLabel;
  final bool isDegraded;
  final SummaryWindow summaryWindow;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.auto_awesome_outlined),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
              Text(
                _summaryWindowLabel(summaryWindow),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        ),
        AppStatusBadge(
          label: isRefreshing ? 'Refreshing' : freshnessLabel,
          tone: isDegraded ? AppStatusTone.warning : AppStatusTone.success,
        ),
      ],
    );
  }
}

String _summaryWindowLabel(SummaryWindow window) {
  final startsAt = window.startsAt?.toUtc();
  final endsAt = window.endsAt?.toUtc();
  if (startsAt == null || endsAt == null) {
    return window.label;
  }
  return '${window.label}: ${_dateTimeLabel(startsAt)} - ${_timeLabel(endsAt)} UTC';
}

String _dateTimeLabel(DateTime value) {
  return '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')} '
      '${_timeLabel(value)}';
}

String _timeLabel(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
