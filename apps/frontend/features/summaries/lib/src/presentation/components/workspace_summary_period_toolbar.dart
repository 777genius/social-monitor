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
    required this.onCalendarDateSelected,
    this.calendarNow,
  });

  final SummaryPeriod selectedPeriod;
  final SummaryPeriodPreset selectedPreset;
  final bool canNavigateToNextPeriod;
  final bool isCurrentPeriod;
  final ValueChanged<SummaryPeriodPreset> onPeriodChanged;
  final VoidCallback onPreviousPeriod;
  final VoidCallback onCurrentPeriod;
  final VoidCallback onNextPeriod;
  final ValueChanged<DateTime> onCalendarDateSelected;
  final DateTime? calendarNow;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final availableWidth = MediaQuery.sizeOf(context).width - AppSpacing.lg;
    var selectorWidth = availableWidth;
    if (selectorWidth > 420) {
      selectorWidth = 420;
    }
    if (selectorWidth < 180) {
      selectorWidth = 180;
    }
    var headerWidth = availableWidth;
    if (headerWidth > 520) {
      headerWidth = 520;
    }
    if (headerWidth < 180) {
      headerWidth = 180;
    }

    return Wrap(
      spacing: AppSpacing.md,
      runSpacing: AppSpacing.sm,
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: headerWidth),
          child: Column(
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
                'Shared UTC period: ${selectedPeriod.utcRangeLabel}',
                softWrap: true,
                style: textTheme.bodySmall?.copyWith(letterSpacing: 0),
              ),
            ],
          ),
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
              key: const ValueKey('workspace-summary-period-calendar'),
              tooltip: 'Choose period date',
              icon: const Icon(Icons.calendar_today_outlined),
              onPressed: () => _choosePeriodDate(context),
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

  Future<void> _choosePeriodDate(BuildContext context) async {
    final lastDate = _datePickerDate(
      selectedPreset.latestSelectableCalendarDate(now: calendarNow),
    );
    final firstDate = DateTime(2020);
    final initialDate = _clampDate(
      _datePickerDate(selectedPeriod.calendarFocusDate),
      firstDate,
      lastDate,
    );
    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: firstDate,
      lastDate: lastDate,
      helpText: 'Choose ${selectedPreset.label.toLowerCase()} period',
      fieldLabelText: 'Summary period date',
    );

    if (picked != null) {
      onCalendarDateSelected(picked);
    }
  }
}

DateTime _datePickerDate(DateTime value) {
  final utc = value.toUtc();
  return DateTime(utc.year, utc.month, utc.day);
}

DateTime _clampDate(DateTime value, DateTime firstDate, DateTime lastDate) {
  if (value.isBefore(firstDate)) {
    return firstDate;
  }

  if (value.isAfter(lastDate)) {
    return lastDate;
  }

  return value;
}
