part of 'reader_summary_brief_surface.dart';

const _topPostDescriptionMaxLines = 6;
const _topPostInlinePreviewMinWidth = 480.0;

class _TopPostContentColumn extends StatelessWidget {
  const _TopPostContentColumn({
    required this.item,
    required this.reservePreviewSpace,
  });

  final TopRead item;
  final bool reservePreviewSpace;

  @override
  Widget build(BuildContext context) {
    final media = item.previewMedia;
    final hasPreview = reservePreviewSpace && media != null;
    if (!hasPreview) {
      return _TopPostTextBody(item: item);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final previewSize = constraints.maxWidth >= 720 ? 112.0 : 92.0;
        final preview = _TopPostPreviewSlot(
          item: item,
          size: previewSize,
          reservePreviewSpace: false,
        );
        final textBody = _TopPostTextBody(item: item);

        if (constraints.maxWidth < _topPostInlinePreviewMinWidth) {
          return Column(
            key: const ValueKey('reader-summary-top-post-preview-stacked'),
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              textBody,
              const SizedBox(height: AppSpacing.sm),
              preview,
            ],
          );
        }

        return Row(
          key: const ValueKey('reader-summary-top-post-preview-inline'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            preview,
            const SizedBox(width: AppSpacing.md),
            Expanded(child: textBody),
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
            fontWeight: isGitHubTrendingBreakout(item)
                ? FontWeight.w900
                : FontWeight.w700,
            letterSpacing: 0,
            height: 1.35,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        _TopPostReasonText(item: item),
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

class _TopPostReasonText extends StatelessWidget {
  const _TopPostReasonText({required this.item});

  final TopRead item;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final style = Theme.of(context).textTheme.bodySmall?.copyWith(
      color: colorScheme.onSurfaceVariant,
      letterSpacing: 0,
      height: 1.4,
    );
    final text = readerSummaryDisplayReason(item);
    return Text(
      text,
      maxLines: _topPostDescriptionMaxLines,
      overflow: TextOverflow.ellipsis,
      style: style,
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
