import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../formatters/summary_period_formats.dart';
import 'reader_summary_collection_stats.dart';

part 'workspace_summary_period_calendar_dialog.dart';
part 'workspace_summary_period_calendar_legend.dart';
part 'workspace_summary_period_preset_selector.dart';
part 'workspace_summary_period_toolbar_controls.dart';

const _toolbarSingleRowMinWidth = 960.0;
const _toolbarDateMaxWidth = 220.0;
const _toolbarPresetMaxWidth = 420.0;
const _toolbarStatsWidth = 260.0;

class WorkspaceSummaryPeriodToolbar extends StatelessWidget {
  const WorkspaceSummaryPeriodToolbar({
    super.key,
    required this.selectedPeriod,
    required this.selectedPreset,
    required this.availableSummaryPeriods,
    required this.canNavigateToPreviousPeriod,
    required this.canNavigateToNextPeriod,
    required this.isCurrentPeriod,
    required this.onPeriodChanged,
    required this.onPreviousPeriod,
    required this.onCurrentPeriod,
    required this.onNextPeriod,
    required this.onCalendarDateSelected,
    this.isGenerating = false,
    this.onGenerate,
    this.onExport,
    this.collectionStatsSummary,
    this.calendarNow,
  });

  final SummaryPeriod selectedPeriod;
  final SummaryPeriodPreset selectedPreset;
  final List<SummaryPeriod> availableSummaryPeriods;
  final bool canNavigateToPreviousPeriod;
  final bool canNavigateToNextPeriod;
  final bool isCurrentPeriod;
  final ValueChanged<SummaryPeriodPreset> onPeriodChanged;
  final VoidCallback onPreviousPeriod;
  final VoidCallback onCurrentPeriod;
  final VoidCallback onNextPeriod;
  final ValueChanged<DateTime> onCalendarDateSelected;
  final bool isGenerating;
  final VoidCallback? onGenerate;
  final VoidCallback? onExport;
  final ReaderSummary? collectionStatsSummary;
  final DateTime? calendarNow;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.sizeOf(context).width;
        final screen = AppScreenClass.of(context);
        final compact =
            screen.isCompact || maxWidth < _toolbarSingleRowMinWidth;
        final navigation = _PeriodNavigationGroup(
          canNavigateToPreviousPeriod: canNavigateToPreviousPeriod,
          canNavigateToNextPeriod: canNavigateToNextPeriod,
          isCurrentPeriod: isCurrentPeriod,
          onPreviousPeriod: onPreviousPeriod,
          onCurrentPeriod: onCurrentPeriod,
          onNextPeriod: onNextPeriod,
        );
        final dateButton = _PeriodDateButton(
          label: summaryPeriodToolbarLabel(selectedPeriod),
          onPressed: () => _choosePeriodDate(context),
        );
        final presetSelector = _SummaryPeriodPresetSelector(
          selectedPreset: selectedPreset,
          onPeriodChanged: onPeriodChanged,
          expand: true,
        );
        final actions = Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (onGenerate != null) ...[
              _RegenerateButton(
                isGenerating: isGenerating,
                onPressed: isGenerating ? null : onGenerate,
              ),
              const SizedBox(width: AppSpacing.sm + 4),
            ],
            _ExportButton(onPressed: onExport),
          ],
        );
        final collectionStats = collectionStatsSummary == null
            ? null
            : ReaderSummaryCollectionStats(
                summary: collectionStatsSummary!,
                showHeading: false,
                compact: true,
              );

        if (compact) {
          final compactSelector = _SummaryPeriodPresetSelector(
            selectedPreset: selectedPreset,
            onPeriodChanged: onPeriodChanged,
            expand: true,
          );
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  navigation,
                  const SizedBox(width: AppSpacing.sm + 4),
                  Flexible(child: dateButton),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Expanded(child: compactSelector),
                  const SizedBox(width: AppSpacing.sm + 4),
                  actions,
                ],
              ),
              if (collectionStats != null) ...[
                const SizedBox(height: AppSpacing.sm),
                collectionStats,
              ],
            ],
          );
        }

        return Row(
          children: [
            navigation,
            const SizedBox(width: AppSpacing.sm + 4),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: _toolbarDateMaxWidth),
              child: dateButton,
            ),
            const SizedBox(width: AppSpacing.md),
            Flexible(
              fit: FlexFit.loose,
              child: KeyedSubtree(
                key: const ValueKey('workspace-summary-period-presets'),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: _toolbarPresetMaxWidth,
                  ),
                  child: presetSelector,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            if (collectionStats != null) ...[
              SizedBox(width: _toolbarStatsWidth, child: collectionStats),
              const SizedBox(width: AppSpacing.md),
            ],
            const Spacer(),
            actions,
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
    final selectablePeriods = _selectablePeriods(availableSummaryPeriods);
    final picked = await showDialog<DateTime>(
      context: context,
      builder: (context) => _SummaryPeriodDateDialog(
        initialDate: initialDate,
        firstDate: firstDate,
        lastDate: lastDate,
        selectedPreset: selectedPreset,
        selectablePeriods: selectablePeriods,
        calendarNow: calendarNow,
      ),
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

List<SummaryPeriod> _selectablePeriods(List<SummaryPeriod> availablePeriods) {
  if (availablePeriods.isEmpty) {
    return const [];
  }
  final periodsByKey = <String, SummaryPeriod>{};
  void add(SummaryPeriod period) {
    periodsByKey[_summaryPeriodKey(period)] = period;
  }

  for (final period in availablePeriods) {
    add(period);
  }
  return periodsByKey.values.toList(growable: false);
}

bool _hasAvailablePeriodForDate({
  required DateTime date,
  required SummaryPeriodPreset preset,
  required List<SummaryPeriod> availablePeriods,
  required DateTime? calendarNow,
}) {
  final period = preset.resolveForCalendarDate(date, now: calendarNow);
  return availablePeriods.any(
    (available) => _sameSummaryPeriod(available, period),
  );
}

bool _sameSummaryPeriod(SummaryPeriod left, SummaryPeriod right) {
  return left.cadence == right.cadence &&
      _datePickerDate(left.startedAt) == _datePickerDate(right.startedAt) &&
      _datePickerDate(left.endedAt) == _datePickerDate(right.endedAt) &&
      left.timezone == right.timezone;
}

String _summaryPeriodKey(SummaryPeriod period) {
  return [
    period.cadence.name,
    period.startedAt.toUtc().toIso8601String(),
    period.endedAt.toUtc().toIso8601String(),
    period.timezone,
  ].join('|');
}
