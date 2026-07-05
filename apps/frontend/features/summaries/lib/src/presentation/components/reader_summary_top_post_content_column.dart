part of 'reader_summary_brief_surface.dart';

class _TopPostContentColumn extends StatelessWidget {
  const _TopPostContentColumn({
    required this.item,
    required this.reservePreviewSpace,
  });

  final TopRead item;
  final bool reservePreviewSpace;

  @override
  Widget build(BuildContext context) {
    final body = _TopPostTextBody(item: item);

    if (!reservePreviewSpace) {
      return body;
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final sidePreview = constraints.maxWidth >= 520;
        final previewSize = constraints.maxWidth >= 720 ? 112.0 : 92.0;
        final preview = _TopPostPreviewSlot(
          item: item,
          size: previewSize,
          reservePreviewSpace: reservePreviewSpace,
        );

        if (!sidePreview) {
          if (item.previewMedia == null) {
            return body;
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              body,
              const SizedBox(height: AppSpacing.sm),
              preview,
            ],
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: body),
            const SizedBox(width: AppSpacing.md),
            preview,
          ],
        );
      },
    );
  }
}

class _TopPostTextBody extends StatelessWidget {
  const _TopPostTextBody({required this.item});

  final TopRead item;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final tags = item.matchedRules
        .map(readablePostTag)
        .whereType<String>()
        .take(3)
        .toList(growable: false);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _shortTitle(item.title),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
            height: 1.35,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          readerSummaryDisplayReason(item),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: textTheme.bodySmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            letterSpacing: 0,
            height: 1.4,
          ),
        ),
        if (tags.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs + 2,
            runSpacing: AppSpacing.xs + 2,
            children: [for (final tag in tags) _TopPostTagPill(label: tag)],
          ),
        ],
      ],
    );
  }
}

class _TopPostTagPill extends StatelessWidget {
  const _TopPostTagPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.55),
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm + 2,
          vertical: 3,
        ),
        child: Text(
          label,
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
      ),
    );
  }
}
