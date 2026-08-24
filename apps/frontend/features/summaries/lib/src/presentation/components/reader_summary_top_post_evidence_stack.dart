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
  final allItems = <_TopPostEvidenceItem>[];
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
    final normalizedProviderKey = readerSummaryIndependentProviderFamily(
      providerKey,
    );
    if (normalizedProviderKey.isEmpty) {
      continue;
    }

    providerKeys.add(normalizedProviderKey);
    allItems.add((
      citationId: id,
      providerKey: providerKey,
      providerLabel: readerSummaryProviderLabel(providerKey),
      title: _topPostEvidenceTitle(citation),
      snippet: _topPostEvidenceSnippet(citation),
      canonicalUrl: _nullableTrim(citation.canonicalUrl),
    ));
  }

  final primaryCitationId = _topPostPrimaryCitationId(item, citationsById);
  final supportItems = allItems
      .where((evidence) => evidence.citationId != primaryCitationId)
      .toList(growable: false);
  final confirmedProviders = _topPostConfirmedProviderCount(item);
  final providerCount = math.max(
    confirmedProviders,
    providerKeys.isEmpty ? 1 : providerKeys.length,
  );

  if (providerCount > 1) {
    return (
      kind: _TopPostSupportKind.crossSource,
      evidenceItems: supportItems,
      providerCount: providerCount,
      itemCount: math.max(allItems.length, providerCount),
    );
  }

  if (allItems.length <= 1) {
    return (
      kind: _TopPostSupportKind.singleSource,
      evidenceItems: const [],
      providerCount: 1,
      itemCount: allItems.length,
    );
  }

  return (
    kind: _TopPostSupportKind.sameSource,
    evidenceItems: supportItems,
    providerCount: 1,
    itemCount: allItems.length,
  );
}

String? _topPostPrimaryCitationId(
  TopRead item,
  Map<String, SummaryCitation> citationsById,
) {
  final itemProviderKey = readerSummaryIndependentProviderFamily(
    item.providerKey,
  );
  final itemCanonicalUrl = _nullableTrim(item.canonicalUrl)?.toLowerCase();
  String? firstResolvedCitationId;
  String? firstProviderMatchCitationId;

  for (final rawCitationId in item.citationIds) {
    final citationId = rawCitationId.trim();
    if (citationId.isEmpty) {
      continue;
    }
    final citation = citationsById[citationId];
    if (citation == null) {
      continue;
    }

    firstResolvedCitationId ??= citationId;
    final citationProviderKey = readerSummaryIndependentProviderFamily(
      _topPostEvidenceProviderKey(
        citation,
        item,
      ),
    );
    if (citationProviderKey != itemProviderKey) {
      continue;
    }

    firstProviderMatchCitationId ??= citationId;
    final citationCanonicalUrl = _nullableTrim(
      citation.canonicalUrl,
    )?.toLowerCase();
    if (itemCanonicalUrl == null || citationCanonicalUrl == itemCanonicalUrl) {
      return citationId;
    }
  }

  return firstProviderMatchCitationId ?? firstResolvedCitationId;
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
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final style = _topPostSupportStyle(context, supportSignal);
    final count = supportSignal.kind == _TopPostSupportKind.crossSource
        ? supportSignal.providerCount
        : supportSignal.itemCount;
    final countLabel = supportSignal.kind == _TopPostSupportKind.crossSource
        ? count == 1
              ? 'source'
              : 'sources'
        : count == 1
        ? 'post'
        : 'posts';
    final actionLabel = expanded ? 'Hide evidence' : 'Show evidence';
    final hasEvidenceRows = items.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Tooltip(
          message: style.tooltip,
          child: hasEvidenceRows
              ? Material(
                  color: Colors.transparent,
                  child: InkWell(
                    key: const ValueKey(
                      'reader-summary-top-post-evidence-toggle',
                    ),
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
                )
              : Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xs,
                    vertical: AppSpacing.xs,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(style.icon, size: 16, color: style.foreground),
                      const SizedBox(width: AppSpacing.xs),
                      Flexible(
                        child: Text(
                          '${style.label} · $count $countLabel',
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
        if (expanded && hasEvidenceRows) ...[
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
}
