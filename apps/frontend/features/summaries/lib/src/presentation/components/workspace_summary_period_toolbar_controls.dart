part of 'workspace_summary_period_toolbar.dart';

class _PeriodDateNavigation extends StatelessWidget {
  const _PeriodDateNavigation({
    super.key,
    required this.canNavigateToPreviousPeriod,
    required this.canNavigateToNextPeriod,
    required this.showToday,
    required this.dateLabel,
    required this.onPreviousPeriod,
    required this.onNextPeriod,
    required this.onDatePressed,
  });

  final bool canNavigateToPreviousPeriod;
  final bool canNavigateToNextPeriod;
  final bool showToday;
  final String dateLabel;
  final VoidCallback onPreviousPeriod;
  final VoidCallback onNextPeriod;
  final VoidCallback onDatePressed;

  @override
  Widget build(BuildContext context) {
    return _ToolbarSurface(
      child: Row(
        children: [
          _ToolbarIconButton(
            tooltip: 'Previous period',
            icon: Icons.chevron_left_rounded,
            onPressed: canNavigateToPreviousPeriod ? onPreviousPeriod : null,
          ),
          Expanded(
            child: _PeriodDateButton(
              label: showToday ? 'Today' : dateLabel,
              onPressed: onDatePressed,
            ),
          ),
          _ToolbarIconButton(
            tooltip: 'Next period',
            icon: Icons.chevron_right_rounded,
            onPressed: canNavigateToNextPeriod ? onNextPeriod : null,
          ),
        ],
      ),
    );
  }
}

class _PeriodDateButton extends StatelessWidget {
  const _PeriodDateButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      key: const ValueKey('workspace-summary-period-calendar'),
      onTap: onPressed,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.calendar_today_outlined,
              size: 16,
              color: colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: AppSpacing.sm),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.xs),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 18,
              color: colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

class _RegenerateButton extends StatelessWidget {
  const _RegenerateButton({required this.isGenerating, this.onPressed});

  final bool isGenerating;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return _ToolbarSurface(
      child: _ToolbarIconButton(
        key: const ValueKey('workspace-summary-toolbar-generate'),
        tooltip: isGenerating ? 'Generating summary' : 'Regenerate summary',
        icon: isGenerating
            ? Icons.hourglass_top_rounded
            : Icons.auto_awesome_outlined,
        color: colorScheme.primary,
        onPressed: onPressed,
      ),
    );
  }
}

class _ExportButton extends StatelessWidget {
  const _ExportButton({this.onPressed});

  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return _ToolbarSurface(
      child: InkWell(
        key: const ValueKey('workspace-summary-export'),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm + 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.download_outlined,
                size: 17,
                color: onPressed == null
                    ? colorScheme.onSurfaceVariant.withValues(alpha: 0.45)
                    : colorScheme.onSurface,
              ),
              const SizedBox(width: AppSpacing.sm - 2),
              Text(
                'Export',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: onPressed == null
                      ? colorScheme.onSurfaceVariant.withValues(alpha: 0.45)
                      : colorScheme.onSurface,
                  fontWeight: FontWeight.w600,
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

class _ToolbarSurface extends StatelessWidget {
  const _ToolbarSurface({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Material(
      color: colorScheme.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: SizedBox(height: 40, child: child),
    );
  }
}

class _ToolbarIconButton extends StatelessWidget {
  const _ToolbarIconButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    this.color,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return IconButton(
      tooltip: tooltip,
      constraints: const BoxConstraints.tightFor(width: 38, height: 38),
      padding: EdgeInsets.zero,
      color: color ?? colorScheme.onSurfaceVariant,
      disabledColor: colorScheme.onSurfaceVariant.withValues(alpha: 0.38),
      icon: Icon(icon, size: 20),
      onPressed: onPressed,
    );
  }
}
