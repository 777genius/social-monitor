import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/value_objects/summary_refresh_schedule.dart';

typedef SummaryRefreshClock = DateTime Function();

class WorkspaceSummaryRefreshStatus extends StatefulWidget {
  const WorkspaceSummaryRefreshStatus({
    super.key,
    required this.collectedAt,
    this.onRefreshDue,
    this.clock = DateTime.now,
  });

  final DateTime collectedAt;
  final VoidCallback? onRefreshDue;
  final SummaryRefreshClock clock;

  @override
  State<WorkspaceSummaryRefreshStatus> createState() =>
      _WorkspaceSummaryRefreshStatusState();
}

class _WorkspaceSummaryRefreshStatusState
    extends State<WorkspaceSummaryRefreshStatus> {
  Timer? _timer;
  late DateTime _now;
  DateTime? _lastRefreshAttemptAt;

  @override
  void initState() {
    super.initState();
    _now = widget.clock();
    _requestRefreshIfDue();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = widget.clock());
      _requestRefreshIfDue();
    });
  }

  @override
  void didUpdateWidget(covariant WorkspaceSummaryRefreshStatus oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.collectedAt != widget.collectedAt) {
      _lastRefreshAttemptAt = null;
      _requestRefreshIfDue();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final next = SummaryRefreshSchedule.nextScheduledAt(_now);
    final remaining = SummaryRefreshSchedule.remaining(now: _now, next: next);
    final updateDue = SummaryRefreshSchedule.isUpdateDue(
      now: _now,
      collectedAt: widget.collectedAt,
    );
    final text =
        'Collected through ${_dateTimeLabel(widget.collectedAt.toUtc())} UTC'
        '${updateDue ? ' · updating now' : ''}'
        ' · next update in ${_durationLabel(remaining)}'
        ' at ${_timeLabel(next)} UTC';
    final textStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
      color: Theme.of(context).colorScheme.onSurfaceVariant,
      fontWeight: FontWeight.w600,
      letterSpacing: 0,
    );

    return Semantics(
      liveRegion: true,
      label: text,
      child: Wrap(
        key: const ValueKey('workspace-summary-refresh-status'),
        spacing: AppSpacing.xs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Icon(
            Icons.schedule_outlined,
            size: 15,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          Text(text, style: textStyle),
        ],
      ),
    );
  }

  void _requestRefreshIfDue() {
    final callback = widget.onRefreshDue;
    if (callback == null ||
        !SummaryRefreshSchedule.isUpdateDue(
          now: _now,
          collectedAt: widget.collectedAt,
        )) {
      return;
    }
    final previous = _lastRefreshAttemptAt;
    if (previous != null &&
        _now.difference(previous) < const Duration(minutes: 1)) {
      return;
    }
    _lastRefreshAttemptAt = _now;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) callback();
    });
  }
}

String _durationLabel(Duration value) {
  final hours = value.inHours.toString().padLeft(2, '0');
  final minutes = (value.inMinutes % 60).toString().padLeft(2, '0');
  final seconds = (value.inSeconds % 60).toString().padLeft(2, '0');
  return '$hours:$minutes:$seconds';
}

String _dateTimeLabel(DateTime value) {
  final year = value.year.toString().padLeft(4, '0');
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '$year-$month-$day ${_timeLabel(value)}';
}

String _timeLabel(DateTime value) {
  final hour = value.hour.toString().padLeft(2, '0');
  final minute = value.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}
