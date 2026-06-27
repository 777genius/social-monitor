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
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.sizeOf(context).width;
        final availableWidth = maxWidth.clamp(180.0, 520.0);
        final selectorWidth = maxWidth.clamp(180.0, 420.0);

        return Wrap(
          spacing: AppSpacing.md,
          runSpacing: AppSpacing.sm,
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: availableWidth),
              child: _SummaryPeriodHeader(selectedPeriod: selectedPeriod),
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
                  child: _SummaryPeriodPresetSelector(
                    selectedPreset: selectedPreset,
                    onPeriodChanged: onPeriodChanged,
                  ),
                ),
              ],
            ),
          ],
        );
      },
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

class _SummaryPeriodHeader extends StatelessWidget {
  const _SummaryPeriodHeader({required this.selectedPeriod});

  final SummaryPeriod selectedPeriod;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
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
    );
  }
}

class _SummaryPeriodPresetSelector extends StatelessWidget {
  const _SummaryPeriodPresetSelector({
    required this.selectedPreset,
    required this.onPeriodChanged,
  });

  final SummaryPeriodPreset selectedPreset;
  final ValueChanged<SummaryPeriodPreset> onPeriodChanged;

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(28);
    final colorScheme = Theme.of(context).colorScheme;
    return Material(
      color: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: borderRadius),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: colorScheme.outline),
          borderRadius: borderRadius,
        ),
        child: SizedBox(
          height: 40,
          child: Row(
            children: [
              for (final entry in SummaryPeriodPreset.values.indexed)
                Expanded(
                  child: _SummaryPeriodPresetSegment(
                    preset: entry.$2,
                    selected: entry.$2 == selectedPreset,
                    showLeadingDivider: entry.$1 > 0,
                    onPressed: () => onPeriodChanged(entry.$2),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryPeriodPresetSegment extends StatelessWidget {
  const _SummaryPeriodPresetSegment({
    required this.preset,
    required this.selected,
    required this.showLeadingDivider,
    required this.onPressed,
  });

  final SummaryPeriodPreset preset;
  final bool selected;
  final bool showLeadingDivider;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final selectedColor = colorScheme.primary.withValues(alpha: 0.14);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: selected ? selectedColor : Colors.transparent,
        border: showLeadingDivider
            ? Border(left: BorderSide(color: colorScheme.outline))
            : null,
      ),
      child: InkWell(
        onTap: selected ? null : onPressed,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
            child: Text(
              preset.label,
              maxLines: 1,
              overflow: TextOverflow.fade,
              softWrap: false,
              style: textTheme.bodySmall?.copyWith(
                color: selected ? colorScheme.primary : colorScheme.onSurface,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                letterSpacing: 0,
              ),
            ),
          ),
        ),
      ),
    );
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
