import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_briefing.dart';
import '../../domain/value_objects/briefing_reader_action_target.dart';

class ReaderBriefingTopicSections extends StatelessWidget {
  const ReaderBriefingTopicSections({super.key, required this.sections});

  final List<BriefingTopicSection> sections;

  @override
  Widget build(BuildContext context) {
    return ReaderBriefingSection(
      title: 'By topic',
      icon: Icons.topic_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: sections
            .map((section) => _TopicSectionRow(section: section))
            .toList(growable: false),
      ),
    );
  }
}

class ReaderBriefingTrendDelta extends StatelessWidget {
  const ReaderBriefingTrendDelta({super.key, required this.delta});

  final BriefingTrendDelta delta;

  @override
  Widget build(BuildContext context) {
    return ReaderBriefingSection(
      title: 'What changed',
      icon: Icons.trending_up_outlined,
      child: Wrap(
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        children: [
          ..._trendBadges(delta.newSignals, 'New'),
          ..._trendBadges(delta.growingSignals, 'Growing'),
          ..._trendBadges(delta.repeatedSignals, 'Repeated'),
          ..._trendBadges(delta.fadingSignals, 'Fading'),
        ],
      ),
    );
  }

  List<Widget> _trendBadges(List<String> values, String label) {
    return values
        .take(2)
        .map(
          (value) => AppStatusBadge(
            label: '$label: $value',
            tone: AppStatusTone.neutral,
          ),
        )
        .toList(growable: false);
  }
}

class ReaderBriefingWatchouts extends StatelessWidget {
  const ReaderBriefingWatchouts({
    super.key,
    required this.questions,
    required this.risks,
  });

  final List<String> questions;
  final List<String> risks;

  @override
  Widget build(BuildContext context) {
    return ReaderBriefingSection(
      title: 'Watchouts',
      icon: Icons.report_problem_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...risks.take(2).map((risk) => Text('Risk: $risk')),
          ...questions.take(2).map((question) => Text('Question: $question')),
        ],
      ),
    );
  }
}

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
  final ValueChanged<BriefingNextAction> onAction;

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
    final statusMessage = _statusMessage(actionViews);

    return ReaderBriefingSection(
      title: 'Next actions',
      icon: Icons.checklist_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppCommandBar(
            actions: actionViews
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
                    onPressed: enabled ? () => onAction(view.action) : null,
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

class ReaderBriefingSection extends StatelessWidget {
  const ReaderBriefingSection({
    super.key,
    required this.title,
    required this.icon,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: AppSpacing.md),
        Row(
          children: [
            Icon(icon, size: 18),
            const SizedBox(width: AppSpacing.xs),
            Text(
              title,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        child,
      ],
    );
  }
}

class _TopicSectionRow extends StatelessWidget {
  const _TopicSectionRow({required this.section});

  final BriefingTopicSection section;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            section.title,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
          Text(section.insight, maxLines: 3, overflow: TextOverflow.ellipsis),
          if (section.items.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: section.items
                  .take(3)
                  .map(
                    (item) => AppStatusBadge(
                      label: item.title,
                      tone: AppStatusTone.neutral,
                    ),
                  )
                  .toList(growable: false),
            ),
          ],
        ],
      ),
    );
  }
}
