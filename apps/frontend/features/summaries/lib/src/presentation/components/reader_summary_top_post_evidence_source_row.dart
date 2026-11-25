part of 'reader_summary_brief_surface.dart';

class _TopPostEvidenceSourceRow extends StatelessWidget {
  const _TopPostEvidenceSourceRow({
    required this.item,
    required this.colorScheme,
    required this.onOpenUrl,
  });

  final _TopPostEvidenceItem item;
  final ColorScheme colorScheme;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final url = item.canonicalUrl;
    final row = DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.26),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.7),
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox.square(
              dimension: 34,
              child: Center(
                child: ReaderSummaryProviderLogo(
                  providerKey: item.providerKey,
                  size: 24,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.providerLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.labelSmall?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                  const SizedBox(height: 2),
                  ReaderSummarySourceText(
                    item.title,
                    key: ObjectKey(item),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.bodySmall?.copyWith(
                      color: colorScheme.onSurface,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0,
                      height: 1.25,
                    ),
                  ),
                  if (item.snippet.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    ReaderSummarySourceText(
                      item.snippet,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.labelSmall?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0,
                        height: 1.3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (url != null) ...[
              const SizedBox(width: AppSpacing.sm),
              Icon(
                Icons.open_in_new_rounded,
                size: 15,
                color: colorScheme.onSurfaceVariant,
              ),
            ],
          ],
        ),
      ),
    );

    if (url == null) {
      return row;
    }

    return Semantics(
      link: true,
      label: readerSummaryUrlActionSemantics(
        'evidence-source',
        item.citationId,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: readerSummaryUrlActionKey('evidence-source', item.citationId),
          onTap: () => onOpenUrl(url),
          borderRadius: BorderRadius.circular(8),
          child: row,
        ),
      ),
    );
  }
}
