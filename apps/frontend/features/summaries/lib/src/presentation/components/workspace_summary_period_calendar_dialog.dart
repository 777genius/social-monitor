part of 'workspace_summary_period_toolbar.dart';

class _SummaryPeriodDateDialog extends StatefulWidget {
  const _SummaryPeriodDateDialog({
    required this.initialDate,
    required this.firstDate,
    required this.lastDate,
    required this.selectedPreset,
    required this.selectablePeriods,
    required this.calendarNow,
  });

  final DateTime initialDate;
  final DateTime firstDate;
  final DateTime lastDate;
  final SummaryPeriodPreset selectedPreset;
  final List<SummaryPeriod> selectablePeriods;
  final DateTime? calendarNow;

  @override
  State<_SummaryPeriodDateDialog> createState() =>
      _SummaryPeriodDateDialogState();
}

class _SummaryPeriodDateDialogState extends State<_SummaryPeriodDateDialog> {
  late DateTime _visibleMonth;
  late DateTime _selectedDate;

  @override
  void initState() {
    super.initState();
    _selectedDate = widget.initialDate;
    _visibleMonth = DateTime(widget.initialDate.year, widget.initialDate.month);
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final hasAvailabilityData = widget.selectablePeriods.isNotEmpty;
    final canSubmit =
        !hasAvailabilityData ||
        _hasAvailablePeriodForDate(
          date: _selectedDate,
          preset: widget.selectedPreset,
          availablePeriods: widget.selectablePeriods,
          calendarNow: widget.calendarNow,
        );
    return Dialog(
      insetPadding: const EdgeInsets.all(AppSpacing.md),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _monthLabel(_visibleMonth),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Previous month',
                    icon: const Icon(Icons.chevron_left),
                    onPressed: _canShowPreviousMonth
                        ? () => setState(() {
                            _visibleMonth = _previousMonth(_visibleMonth);
                          })
                        : null,
                  ),
                  IconButton(
                    tooltip: 'Next month',
                    icon: const Icon(Icons.chevron_right),
                    onPressed: _canShowNextMonth
                        ? () => setState(() {
                            _visibleMonth = _nextMonth(_visibleMonth);
                          })
                        : null,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  for (final label in const ['S', 'M', 'T', 'W', 'T', 'F', 'S'])
                    Expanded(
                      child: Center(
                        child: Text(
                          label,
                          style: Theme.of(context).textTheme.labelMedium
                              ?.copyWith(
                                color: colorScheme.onSurfaceVariant,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0,
                              ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              _CalendarMonthGrid(
                visibleMonth: _visibleMonth,
                selectedDate: _selectedDate,
                firstDate: widget.firstDate,
                lastDate: widget.lastDate,
                selectedPreset: widget.selectedPreset,
                selectablePeriods: widget.selectablePeriods,
                calendarNow: widget.calendarNow,
                onDateSelected: (date) => setState(() {
                  _selectedDate = date;
                }),
              ),
              const SizedBox(height: AppSpacing.sm),
              _CalendarLegend(hasAvailabilityData: hasAvailabilityData),
              const SizedBox(height: AppSpacing.md),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  FilledButton(
                    onPressed: canSubmit
                        ? () => Navigator.of(context).pop(_selectedDate)
                        : null,
                    child: const Text('OK'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  bool get _canShowPreviousMonth {
    return _visibleMonth.isAfter(
      DateTime(widget.firstDate.year, widget.firstDate.month),
    );
  }

  bool get _canShowNextMonth {
    return _visibleMonth.isBefore(
      DateTime(widget.lastDate.year, widget.lastDate.month),
    );
  }
}

class _CalendarMonthGrid extends StatelessWidget {
  const _CalendarMonthGrid({
    required this.visibleMonth,
    required this.selectedDate,
    required this.firstDate,
    required this.lastDate,
    required this.selectedPreset,
    required this.selectablePeriods,
    required this.calendarNow,
    required this.onDateSelected,
  });

  final DateTime visibleMonth;
  final DateTime selectedDate;
  final DateTime firstDate;
  final DateTime lastDate;
  final SummaryPeriodPreset selectedPreset;
  final List<SummaryPeriod> selectablePeriods;
  final DateTime? calendarNow;
  final ValueChanged<DateTime> onDateSelected;

  @override
  Widget build(BuildContext context) {
    final firstOfMonth = DateTime(visibleMonth.year, visibleMonth.month);
    final leadingEmptyCells = firstOfMonth.weekday % DateTime.daysPerWeek;
    final daysInMonth = DateTime(
      visibleMonth.year,
      visibleMonth.month + 1,
      0,
    ).day;
    final totalCells = leadingEmptyCells + daysInMonth;
    final rowCount = (totalCells / DateTime.daysPerWeek).ceil();

    return Column(
      children: [
        for (var row = 0; row < rowCount; row += 1)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: Row(
              children: [
                for (var column = 0; column < DateTime.daysPerWeek; column += 1)
                  Expanded(
                    child: _CalendarDayCell(
                      date: _dateForCell(
                        firstOfMonth,
                        row * DateTime.daysPerWeek + column,
                        leadingEmptyCells,
                      ),
                      selectedDate: selectedDate,
                      firstDate: firstDate,
                      lastDate: lastDate,
                      selectedPreset: selectedPreset,
                      selectablePeriods: selectablePeriods,
                      calendarNow: calendarNow,
                      onDateSelected: onDateSelected,
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _CalendarDayCell extends StatelessWidget {
  const _CalendarDayCell({
    required this.date,
    required this.selectedDate,
    required this.firstDate,
    required this.lastDate,
    required this.selectedPreset,
    required this.selectablePeriods,
    required this.calendarNow,
    required this.onDateSelected,
  });

  final DateTime? date;
  final DateTime selectedDate;
  final DateTime firstDate;
  final DateTime lastDate;
  final SummaryPeriodPreset selectedPreset;
  final List<SummaryPeriod> selectablePeriods;
  final DateTime? calendarNow;
  final ValueChanged<DateTime> onDateSelected;

  @override
  Widget build(BuildContext context) {
    final date = this.date;
    if (date == null) {
      return const SizedBox.square(dimension: 40);
    }

    final colorScheme = Theme.of(context).colorScheme;
    final inRange = !date.isBefore(firstDate) && !date.isAfter(lastDate);
    final hasAvailabilityData = selectablePeriods.isNotEmpty;
    final hasAvailableSummary =
        hasAvailabilityData &&
        _hasAvailablePeriodForDate(
          date: date,
          preset: selectedPreset,
          availablePeriods: selectablePeriods,
          calendarNow: calendarNow,
        );
    final enabled = inRange && (!hasAvailabilityData || hasAvailableSummary);
    final selected = _sameDate(date, selectedDate);
    final keyDate = _dateKey(date);
    final foreground = enabled
        ? selected
              ? colorScheme.onPrimary
              : colorScheme.onSurface
        : colorScheme.onSurface.withValues(alpha: 0.34);
    final borderColor = hasAvailableSummary && !selected
        ? colorScheme.primary
        : Colors.transparent;

    return Center(
      child: Semantics(
        selected: selected,
        button: true,
        enabled: enabled,
        child: InkWell(
          key: ValueKey('workspace-summary-calendar-day-$keyDate'),
          onTap: enabled ? () => onDateSelected(date) : null,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: selected ? colorScheme.primary : Colors.transparent,
              shape: BoxShape.circle,
              border: Border.all(
                color: borderColor,
                width: hasAvailableSummary && !selected ? 1.5 : 0,
              ),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Text(
                  '${date.day}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: foreground,
                    fontWeight: hasAvailableSummary
                        ? FontWeight.w900
                        : FontWeight.w500,
                    letterSpacing: 0,
                  ),
                ),
                if (hasAvailableSummary && !selected)
                  Positioned(
                    bottom: 5,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: colorScheme.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const SizedBox.square(dimension: 4),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _monthLabel(DateTime month) {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return '${monthNames[month.month - 1]} ${month.year}';
}

DateTime _previousMonth(DateTime month) {
  return month.month == DateTime.january
      ? DateTime(month.year - 1, DateTime.december)
      : DateTime(month.year, month.month - 1);
}

DateTime _nextMonth(DateTime month) {
  return month.month == DateTime.december
      ? DateTime(month.year + 1, DateTime.january)
      : DateTime(month.year, month.month + 1);
}

DateTime? _dateForCell(
  DateTime firstOfMonth,
  int cellIndex,
  int leadingEmptyCells,
) {
  final day = cellIndex - leadingEmptyCells + 1;
  final daysInMonth = DateTime(
    firstOfMonth.year,
    firstOfMonth.month + 1,
    0,
  ).day;
  if (day < 1 || day > daysInMonth) {
    return null;
  }
  return DateTime(firstOfMonth.year, firstOfMonth.month, day);
}

bool _sameDate(DateTime left, DateTime right) {
  return left.year == right.year &&
      left.month == right.month &&
      left.day == right.day;
}

String _dateKey(DateTime date) {
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}
