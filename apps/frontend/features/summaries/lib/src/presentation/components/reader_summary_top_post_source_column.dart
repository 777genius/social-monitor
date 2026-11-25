part of 'reader_summary_brief_surface.dart';

class _TopPostSourceColumn extends StatelessWidget {
  const _TopPostSourceColumn({
    required this.item,
    required this.rating,
    this.dateLabel,
  });

  final TopRead item;
  final Widget rating;
  final String? dateLabel;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final handle = topPostSourceHandle(item);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _TopPostProviderTile(providerKey: item.providerKey),
        const SizedBox(width: AppSpacing.sm + 4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                readerSummaryProviderLabel(item.providerKey),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
              if (handle != null) ...[
                const SizedBox(height: 2),
                Text(
                  handle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelSmall?.copyWith(
                    color: handle.startsWith('@')
                        ? colorScheme.primary
                        : colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0,
                  ),
                ),
              ],
              if (dateLabel != null) ...[
                const SizedBox(height: 2),
                Text(
                  dateLabel!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelSmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xs),
              rating,
            ],
          ),
        ),
      ],
    );
  }
}
