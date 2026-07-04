part of 'workspace_summary_period_toolbar.dart';

const _presetSegments = [
  SummaryPeriodPreset.daily,
  SummaryPeriodPreset.weekly,
  SummaryPeriodPreset.monthly,
];

class _SummaryPeriodPresetSelector extends StatelessWidget {
  const _SummaryPeriodPresetSelector({
    required this.selectedPreset,
    required this.onPeriodChanged,
    this.expand = false,
  });

  final SummaryPeriodPreset selectedPreset;
  final ValueChanged<SummaryPeriodPreset> onPeriodChanged;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    return _ToolbarSurface(
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: Row(
          mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
          children: [
            for (final preset in _presetSegments)
              if (expand)
                Expanded(
                  child: _SummaryPeriodPresetSegment(
                    preset: preset,
                    selected: preset == selectedPreset,
                    dense: true,
                    onPressed: () => onPeriodChanged(preset),
                  ),
                )
              else
                _SummaryPeriodPresetSegment(
                  preset: preset,
                  selected: preset == selectedPreset,
                  onPressed: () => onPeriodChanged(preset),
                ),
          ],
        ),
      ),
    );
  }
}

class _SummaryPeriodPresetSegment extends StatelessWidget {
  const _SummaryPeriodPresetSegment({
    required this.preset,
    required this.selected,
    required this.onPressed,
    this.dense = false,
  });

  final SummaryPeriodPreset preset;
  final bool selected;
  final VoidCallback onPressed;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? colorScheme.primary : Colors.transparent,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        child: InkWell(
          onTap: selected ? null : onPressed,
          child: SizedBox(
            height: 34,
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: dense ? AppSpacing.xs : AppSpacing.md + 2,
              ),
              child: Center(
                child: Text(
                  preset.label,
                  maxLines: 1,
                  overflow: TextOverflow.fade,
                  softWrap: false,
                  style: textTheme.bodySmall?.copyWith(
                    color: selected
                        ? colorScheme.onPrimary
                        : colorScheme.onSurfaceVariant,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    letterSpacing: 0,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
