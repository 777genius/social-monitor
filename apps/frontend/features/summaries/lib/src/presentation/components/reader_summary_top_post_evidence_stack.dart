part of 'reader_summary_brief_surface.dart';

typedef _TopPostEvidenceItem = ({
  String citationId,
  String providerKey,
  String providerLabel,
  String title,
  String snippet,
  String? canonicalUrl,
});

enum _TopPostSupportKind { crossSource, sameSource, singleSource }

typedef _TopPostSupportSignal = ({
  _TopPostSupportKind kind,
  List<_TopPostEvidenceItem> evidenceItems,
  int providerCount,
  int itemCount,
});

_TopPostSupportSignal _topPostSupportSignal({
  required TopRead item,
  required Map<String, SummaryCitation> citationsById,
}) {
  final items = <_TopPostEvidenceItem>[];
  final providerKeys = <String>{};
  final seenCitationIds = <String>{};

  for (final citationId in item.citationIds) {
    final id = citationId.trim();
    if (id.isEmpty || !seenCitationIds.add(id)) {
      continue;
    }

    final citation = citationsById[id];
    if (citation == null) {
      continue;
    }

    final providerKey = _topPostEvidenceProviderKey(citation, item);
    final normalizedProviderKey = providerKey.trim().toLowerCase();
    if (normalizedProviderKey.isEmpty) {
      continue;
    }

    providerKeys.add(normalizedProviderKey);
    items.add((
      citationId: id,
      providerKey: providerKey,
      providerLabel: readerSummaryProviderLabel(providerKey),
      title: _topPostEvidenceTitle(citation),
      snippet: _topPostEvidenceSnippet(citation),
      canonicalUrl: _nullableTrim(citation.canonicalUrl),
    ));
  }

  if (items.length >= 2) {
    return (
      kind: providerKeys.length > 1
          ? _TopPostSupportKind.crossSource
          : _TopPostSupportKind.sameSource,
      evidenceItems: items,
      providerCount: providerKeys.isEmpty ? 1 : providerKeys.length,
      itemCount: items.length,
    );
  }

  final confirmedProviders = _topPostConfirmedProviderCount(item);
  if (confirmedProviders > 1) {
    return (
      kind: _TopPostSupportKind.crossSource,
      evidenceItems: const [],
      providerCount: confirmedProviders,
      itemCount: 0,
    );
  }

  final confidenceLevel = item.confidence.level.trim().toLowerCase();
  final supported = confidenceLevel == 'high' || confidenceLevel == 'medium';
  return (
    kind: supported
        ? _TopPostSupportKind.sameSource
        : _TopPostSupportKind.singleSource,
    evidenceItems: const [],
    providerCount: 1,
    itemCount: 0,
  );
}

String _topPostEvidenceProviderKey(SummaryCitation citation, TopRead item) {
  final citationProvider = citation.providerKey?.trim();
  if (citationProvider != null && citationProvider.isNotEmpty) {
    return citationProvider;
  }
  return item.providerKey.trim();
}

String _topPostEvidenceTitle(SummaryCitation citation) {
  final sourceLabel = citation.sourceLabel.trim();
  final snippet = citation.safeSnippet.trim();
  if (sourceLabel.isNotEmpty && !_isGenericCitationLabel(sourceLabel)) {
    return sourceLabel;
  }
  if (snippet.isNotEmpty) {
    return snippet;
  }
  if (sourceLabel.isNotEmpty) {
    return sourceLabel;
  }
  return _nullableTrim(citation.canonicalUrl) ?? 'Source';
}

String _topPostEvidenceSnippet(SummaryCitation citation) {
  final snippet = citation.safeSnippet.trim();
  final title = _topPostEvidenceTitle(citation);
  if (snippet.isEmpty || snippet == title) {
    return '';
  }
  return snippet;
}

bool _isGenericCitationLabel(String value) {
  final normalized = value.trim().toLowerCase();
  return normalized == 'reddit thread' ||
      normalized == 'x post' ||
      normalized == 'twitter post' ||
      normalized == 'hacker news' ||
      normalized == 'rss item' ||
      normalized == 'source';
}

String? _nullableTrim(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }
  return trimmed;
}

class _TopPostEvidenceStack extends StatelessWidget {
  const _TopPostEvidenceStack({
    required this.supportSignal,
    required this.expanded,
    required this.onToggle,
    required this.onOpenUrl,
  });

  final _TopPostSupportSignal supportSignal;
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final items = supportSignal.evidenceItems;
    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    final providerLabels = _providerLabels(items);
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final style = _topPostSupportStyle(context, supportSignal);
    final count = supportSignal.kind == _TopPostSupportKind.crossSource
        ? providerLabels.length
        : items.length;
    final countLabel = supportSignal.kind == _TopPostSupportKind.crossSource
        ? count == 1
              ? 'source'
              : 'sources'
        : count == 1
        ? 'post'
        : 'posts';
    final actionLabel = expanded ? 'Hide evidence' : 'Show evidence';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Tooltip(
          message: style.tooltip,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              key: const ValueKey('reader-summary-top-post-evidence-toggle'),
              onTap: onToggle,
              borderRadius: BorderRadius.circular(999),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.xs,
                  vertical: AppSpacing.xs,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      expanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 16,
                      color: style.foreground,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Flexible(
                      child: Text(
                        '${style.label} · $count $countLabel · '
                        '$actionLabel',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.labelSmall?.copyWith(
                          color: style.foreground,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (expanded) ...[
          const SizedBox(height: AppSpacing.xs),
          DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                left: BorderSide(
                  color: style.foreground.withValues(alpha: 0.35),
                  width: 2,
                ),
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.only(left: AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var index = 0; index < items.length; index++) ...[
                    if (index > 0) const SizedBox(height: AppSpacing.xs),
                    _TopPostEvidenceSourceRow(
                      item: items[index],
                      colorScheme: colorScheme,
                      onOpenUrl: onOpenUrl,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  List<String> _providerLabels(List<_TopPostEvidenceItem> items) {
    final labels = <String>[];
    final seen = <String>{};
    for (final item in items) {
      final key = item.providerKey.trim().toLowerCase();
      if (key.isEmpty || !seen.add(key)) {
        continue;
      }
      labels.add(item.providerLabel);
    }
    return labels;
  }
}

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
                  Text(
                    item.title,
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
                    Text(
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

    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: ValueKey(
          'reader-summary-top-post-evidence-source-${item.citationId}',
        ),
        onTap: () => onOpenUrl(url),
        borderRadius: BorderRadius.circular(8),
        child: row,
      ),
    );
  }
}
