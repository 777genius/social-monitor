part of 'workspace_summary_period_toolbar.dart';

class _CalendarLegend extends StatelessWidget {
  const _CalendarLegend({required this.hasAvailabilityData});

  final bool hasAvailabilityData;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textStyle = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: colorScheme.onSurfaceVariant,
      fontWeight: FontWeight.w600,
      letterSpacing: 0,
    );
    final label = hasAvailabilityData
        ? 'Blue dot marks days with a saved summary'
        : 'Summary history has not loaded yet';

    return Row(
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: hasAvailabilityData
                ? colorScheme.primary
                : colorScheme.onSurfaceVariant.withValues(alpha: 0.45),
            shape: BoxShape.circle,
          ),
          child: const SizedBox.square(dimension: 6),
        ),
        const SizedBox(width: AppSpacing.xs + 2),
        Expanded(child: Text(label, style: textStyle)),
      ],
    );
  }
}
