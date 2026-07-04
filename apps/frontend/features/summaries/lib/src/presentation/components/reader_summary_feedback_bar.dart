part of 'reader_summary_brief_surface.dart';

/// Compact "Was this summary helpful?" bar wired to reader feedback actions.
class ReaderSummaryFeedbackBar extends StatelessWidget {
  const ReaderSummaryFeedbackBar({
    super.key,
    required this.summary,
    required this.readerActionState,
    required this.intentForAction,
    required this.onAction,
  });

  final ReaderSummary summary;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final UserActionIntent Function(ReaderAction action) intentForAction;
  final ReaderActionSelected onAction;

  @override
  Widget build(BuildContext context) {
    final relevantAction = _actionOfKind('mark_relevant');
    final notRelevantAction = _actionOfKind('mark_not_relevant');
    if (relevantAction == null && notRelevantAction == null) {
      return const SizedBox.shrink();
    }

    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final submittedKind = switch (readerActionState) {
      ReadyViewState<ReaderActionResult>(:final value)
          when summaryHelpfulFeedbackActionKinds.contains(value.kind) =>
        value.kind,
      _ => null,
    };
    final busy = readerActionState is LoadingViewState<ReaderActionResult>;

    if (submittedKind != null) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.check_circle_outline_rounded,
            size: 16,
            color: AppColors.success,
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            'Thanks - your feedback tunes future summaries.',
            key: const ValueKey('reader-summary-feedback-thanks'),
            style: textTheme.labelSmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              letterSpacing: 0,
            ),
          ),
        ],
      );
    }

    return Wrap(
      spacing: AppSpacing.sm + 4,
      runSpacing: AppSpacing.sm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          'Was this summary helpful?',
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
        if (relevantAction != null)
          _FeedbackButton(
            key: const ValueKey('reader-summary-feedback-helpful'),
            icon: Icons.thumb_up_alt_outlined,
            label: 'Helpful',
            enabled: !busy && intentForAction(relevantAction).isEnabled,
            onPressed: () => onAction(relevantAction),
          ),
        if (notRelevantAction != null)
          _NotHelpfulButton(
            action: notRelevantAction,
            enabled: !busy && intentForAction(notRelevantAction).isEnabled,
            onAction: onAction,
          ),
      ],
    );
  }

  ReaderAction? _actionOfKind(String kind) {
    for (final action in summary.content.nextActions) {
      if (action.kind == kind) {
        return action;
      }
    }
    return null;
  }
}

class _NotHelpfulButton extends StatelessWidget {
  const _NotHelpfulButton({
    required this.action,
    required this.enabled,
    required this.onAction,
  });

  final ReaderAction action;
  final bool enabled;
  final ReaderActionSelected onAction;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<ReaderFeedbackReason>(
      key: const ValueKey('reader-summary-feedback-not-helpful'),
      tooltip: 'Not helpful - tell us why',
      enabled: enabled,
      position: PopupMenuPosition.under,
      onSelected: (reason) => onAction(action, reason),
      itemBuilder: (context) => [
        for (final reason in ReaderFeedbackReason.values)
          PopupMenuItem<ReaderFeedbackReason>(
            value: reason,
            child: Text(reason.label),
          ),
      ],
      child: _FeedbackButton(
        icon: Icons.thumb_down_alt_outlined,
        label: 'Not helpful',
        enabled: enabled,
        onPressed: null,
      ),
    );
  }
}

class _FeedbackButton extends StatelessWidget {
  const _FeedbackButton({
    super.key,
    required this.icon,
    required this.label,
    required this.enabled,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final foreground = enabled
        ? colorScheme.onSurfaceVariant
        : colorScheme.onSurfaceVariant.withValues(alpha: 0.45);
    return Material(
      color: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: InkWell(
        onTap: enabled ? onPressed : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm + 4,
            vertical: AppSpacing.xs + 2,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: foreground),
              const SizedBox(width: AppSpacing.xs + 2),
              Text(
                label,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: foreground,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
