import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_briefing.dart';
import '../../domain/value_objects/briefing_reader_action_target.dart';
import 'reader_briefing_sections.dart';

typedef BriefingReaderActionSelected =
    void Function(
      BriefingNextAction action, [
      BriefingReaderFeedbackReason? feedbackReason,
    ]);

class ReaderBriefingNextActions extends StatelessWidget {
  const ReaderBriefingNextActions({
    super.key,
    required this.actions,
    required this.actionState,
    required this.activeActionIdempotencyKey,
    required this.lastActionIdempotencyKey,
    required this.intentForAction,
    required this.onAction,
  });

  final List<BriefingNextAction> actions;
  final AsyncViewState<BriefingReaderActionResult> actionState;
  final String? activeActionIdempotencyKey;
  final String? lastActionIdempotencyKey;
  final UserActionIntent Function(BriefingNextAction action) intentForAction;
  final BriefingReaderActionSelected onAction;

  @override
  Widget build(BuildContext context) {
    final actionViews = actions
        .map((action) {
          final intent = intentForAction(action);
          return (
            action: action,
            intent: intent,
            state: _visualStateFor(intent),
          );
        })
        .toList(growable: false);
    final visibleActionViews = actionViews
        .where(
          (view) =>
              view.intent.isEnabled ||
              view.state != _ReaderActionVisualState.idle,
        )
        .take(3)
        .toList(growable: false);
    if (visibleActionViews.isEmpty) {
      return const SizedBox.shrink();
    }
    final statusMessage = _statusMessage(actionViews);

    return ReaderBriefingSection(
      title: 'Next actions',
      icon: Icons.checklist_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppCommandBar(
            actions: visibleActionViews
                .map((view) {
                  final enabled =
                      view.intent.isEnabled &&
                      view.state != _ReaderActionVisualState.loading &&
                      view.state != _ReaderActionVisualState.saved;
                  return AppCommandAction(
                    label: _actionLabel(view.action, view.state),
                    icon: _actionIcon(view.action.kind, view.state),
                    controlKeyBase: 'reader-brief-action-${view.action.kind}',
                    enabled: enabled,
                    reason: _actionReason(view.action, view.intent, view.state),
                    variant: AppButtonVariant.secondary,
                    onPressed: enabled
                        ? () => _handleAction(context, view.action)
                        : null,
                  );
                })
                .toList(growable: false),
          ),
          if (statusMessage != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Row(
              children: [
                Icon(
                  statusMessage.icon,
                  size: 16,
                  color: statusMessage.color(context),
                ),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(
                    statusMessage.label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: statusMessage.color(context),
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  void _handleAction(BuildContext context, BriefingNextAction action) {
    if (action.kind != 'mark_not_relevant') {
      onAction(action);
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            0,
            AppSpacing.md,
            AppSpacing.md,
          ),
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: BriefingReaderFeedbackReason.values
                .map(
                  (reason) => FilledButton.tonalIcon(
                    key: ValueKey(
                      'reader-brief-feedback-reason-${reason.apiValue}',
                    ),
                    onPressed: () {
                      Navigator.of(context).pop();
                      onAction(action, reason);
                    },
                    icon: Icon(_feedbackReasonIcon(reason), size: 18),
                    label: Text(reason.label),
                  ),
                )
                .toList(growable: false),
          ),
        ),
      ),
    );
  }

  _ReaderActionVisualState _visualStateFor(UserActionIntent intent) {
    final idempotencyKey = intent.idempotencyKey;
    if (idempotencyKey == null || idempotencyKey.isEmpty) {
      return _ReaderActionVisualState.idle;
    }
    if (actionState is LoadingViewState<BriefingReaderActionResult> &&
        activeActionIdempotencyKey == idempotencyKey) {
      return _ReaderActionVisualState.loading;
    }
    if (actionState case ReadyViewState<BriefingReaderActionResult>(
      :final value,
    ) when value.idempotencyKey == idempotencyKey) {
      return _ReaderActionVisualState.saved;
    }
    if (actionState is FailureViewState<BriefingReaderActionResult> &&
        lastActionIdempotencyKey == idempotencyKey) {
      return _ReaderActionVisualState.failed;
    }
    return _ReaderActionVisualState.idle;
  }

  String _actionLabel(
    BriefingNextAction action,
    _ReaderActionVisualState state,
  ) {
    return switch (state) {
      _ReaderActionVisualState.loading => 'Saving',
      _ReaderActionVisualState.saved when action.kind == 'mark_relevant' =>
        'Marked relevant',
      _ReaderActionVisualState.saved when action.kind == 'mark_not_relevant' =>
        'Marked not relevant',
      _ReaderActionVisualState.saved when action.kind == 'read_source' =>
        'Opened',
      _ReaderActionVisualState.saved => 'Saved',
      _ when action.kind == 'read_source' => 'Read source',
      _ => action.label,
    };
  }

  String _actionReason(
    BriefingNextAction action,
    UserActionIntent intent,
    _ReaderActionVisualState state,
  ) {
    if (state == _ReaderActionVisualState.loading) {
      return 'Saving preference feedback';
    }
    if (state == _ReaderActionVisualState.saved) {
      return action.kind == 'read_source'
          ? 'Source opened'
          : 'Saved to preferences';
    }
    if (state == _ReaderActionVisualState.failed) {
      final current = actionState;
      if (current is FailureViewState<BriefingReaderActionResult>) {
        return current.failure.message;
      }
    }
    return intent.disabledReasonCode ?? action.reason;
  }

  _ReaderActionStatusMessage? _statusMessage(
    List<
      ({
        BriefingNextAction action,
        UserActionIntent intent,
        _ReaderActionVisualState state,
      })
    >
    actionViews,
  ) {
    for (final view in actionViews) {
      if (view.state == _ReaderActionVisualState.loading) {
        return const _ReaderActionStatusMessage(
          label: 'Saving preference feedback',
          icon: Icons.sync_outlined,
          tone: _ReaderActionStatusTone.neutral,
        );
      }
      if (view.state == _ReaderActionVisualState.failed) {
        return const _ReaderActionStatusMessage(
          label: 'Action failed. Try again.',
          icon: Icons.error_outline,
          tone: _ReaderActionStatusTone.warning,
        );
      }
      if (view.state == _ReaderActionVisualState.saved &&
          view.action.kind != 'read_source') {
        return const _ReaderActionStatusMessage(
          label: 'Saved to preferences',
          icon: Icons.check_circle_outline,
          tone: _ReaderActionStatusTone.success,
        );
      }
    }
    return null;
  }

  IconData _actionIcon(String kind, _ReaderActionVisualState state) {
    if (state == _ReaderActionVisualState.saved) {
      return Icons.check_circle_outline;
    }
    if (state == _ReaderActionVisualState.loading) {
      return Icons.sync_outlined;
    }
    return switch (kind) {
      'watch_repository' => Icons.visibility_outlined,
      'add_topic_rule' => Icons.rule_outlined,
      'request_deeper_scan' => Icons.radar_outlined,
      'mark_relevant' => Icons.thumb_up_alt_outlined,
      'mark_not_relevant' => Icons.thumb_down_alt_outlined,
      'ignore_low_confidence' => Icons.visibility_off_outlined,
      _ => Icons.open_in_new_outlined,
    };
  }

  IconData _feedbackReasonIcon(BriefingReaderFeedbackReason reason) {
    return switch (reason) {
      BriefingReaderFeedbackReason.notSameStory => Icons.call_split_outlined,
      BriefingReaderFeedbackReason.duplicate => Icons.control_point_duplicate,
      BriefingReaderFeedbackReason.lowQualitySource =>
        Icons.report_gmailerrorred_outlined,
      BriefingReaderFeedbackReason.overratedProvider =>
        Icons.trending_down_outlined,
    };
  }
}

enum _ReaderActionVisualState { idle, loading, saved, failed }

enum _ReaderActionStatusTone { neutral, success, warning }

final class _ReaderActionStatusMessage {
  const _ReaderActionStatusMessage({
    required this.label,
    required this.icon,
    required this.tone,
  });

  final String label;
  final IconData icon;
  final _ReaderActionStatusTone tone;

  Color color(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return switch (tone) {
      _ReaderActionStatusTone.neutral => colorScheme.onSurfaceVariant,
      _ReaderActionStatusTone.success => AppColors.teal,
      _ReaderActionStatusTone.warning => colorScheme.error,
    };
  }
}
