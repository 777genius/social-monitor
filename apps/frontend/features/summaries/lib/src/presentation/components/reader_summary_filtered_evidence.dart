part of 'reader_summary_brief_surface.dart';

class _SourceFilterChips extends StatelessWidget {
  const _SourceFilterChips({
    required this.entries,
    required this.coverage,
    required this.selectedProviderKey,
    required this.topReadCount,
    required this.onSelected,
  });

  final List<SourceMixEntry> entries;
  final ReaderSummaryCoverage? coverage;
  final String? selectedProviderKey;
  final int topReadCount;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final chips = Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        FilterChip(
          key: const ValueKey('reader-summary-source-filter-all'),
          label: Text('$topReadCount top reads'),
          selected: selectedProviderKey == null,
          onSelected: (_) => onSelected(null),
        ),
        for (final entry in entries)
          FilterChip(
            key: ValueKey('reader-summary-source-filter-${entry.providerKey}'),
            label: Tooltip(
              message: readerSummaryProviderLabel(entry.providerKey),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ReaderSummaryProviderLogo(providerKey: entry.providerKey),
                  const SizedBox(width: AppSpacing.xs),
                  Text('${entry.itemCount}'),
                ],
              ),
            ),
            selected: selectedProviderKey == entry.providerKey,
            onSelected: (_) => onSelected(entry.providerKey),
          ),
      ],
    );
    final stats = _SourceFilterStats(
      collectedCount: coverage?.collectedFeedItemCount,
      selectedCount: _selectedPostCount(
        entries,
        coverage: coverage,
        fallback: topReadCount,
      ),
      topReadCount: coverage?.topReadCount ?? topReadCount,
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 760) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              chips,
              const SizedBox(height: AppSpacing.xs),
              stats,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(child: chips),
            const SizedBox(width: AppSpacing.sm),
            stats,
          ],
        );
      },
    );
  }
}

class _SourceFilterStats extends StatelessWidget {
  const _SourceFilterStats({
    required this.collectedCount,
    required this.selectedCount,
    required this.topReadCount,
  });

  final int? collectedCount;
  final int selectedCount;
  final int topReadCount;

  @override
  Widget build(BuildContext context) {
    if ((collectedCount ?? 0) <= 0 && selectedCount <= 0 && topReadCount <= 0) {
      return const SizedBox.shrink();
    }
    final colorScheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: collectedCount == null
          ? 'Selected evidence and read-first posts used by this summary'
          : 'Posts collected and selected for this summary',
      child: Text(
        _summaryStatsLabel(
          collectedCount: collectedCount,
          selectedCount: selectedCount,
          topReadCount: topReadCount,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          color: colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w800,
          letterSpacing: 0,
        ),
      ),
    );
  }
}

int _selectedPostCount(
  List<SourceMixEntry> entries, {
  required ReaderSummaryCoverage? coverage,
  required int fallback,
}) {
  final coverageCount = coverage?.selectedFeedItemCount;
  if (coverageCount != null && coverageCount > 0) {
    return coverageCount;
  }
  final count = entries.fold<int>(0, (sum, entry) => sum + entry.itemCount);
  return count > 0 ? count : fallback;
}

String _summaryStatsLabel({
  required int? collectedCount,
  required int selectedCount,
  required int topReadCount,
}) {
  final parts = <String>[];
  if (collectedCount != null && collectedCount > 0) {
    parts.add('${_formatCount(collectedCount)} collected');
  }
  if (selectedCount > 0) {
    parts.add('${_formatCount(selectedCount)} selected for summary');
  }
  if (topReadCount > 0) {
    parts.add('${_formatCount(topReadCount)} top reads');
  }
  return parts.join(' · ');
}

String _formatCount(int value) {
  final text = value.toString();
  final buffer = StringBuffer();
  for (var index = 0; index < text.length; index += 1) {
    final remaining = text.length - index;
    if (index > 0 && remaining % 3 == 0) {
      buffer.write(',');
    }
    buffer.write(text[index]);
  }
  return buffer.toString();
}

class _FilteredEvidenceList extends StatelessWidget {
  const _FilteredEvidenceList({
    required this.selectedProviderKey,
    required this.topReads,
    required this.fallbackCitations,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final String? selectedProviderKey;
  final List<TopRead> topReads;
  final List<SummaryCitation> fallbackCitations;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    const listKeyPrefix = 'reader-summary-top-read';
    final title = selectedProviderKey == null
        ? 'Top reads'
        : '${readerSummaryProviderLabel(selectedProviderKey!)} posts';
    final visibleReads = topReads.take(10).toList(growable: false);
    final visibleFallback = fallbackCitations.take(5).toList(growable: false);

    final list = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (selectedProviderKey == null)
              const Icon(Icons.open_in_new_outlined, size: 18)
            else
              ReaderSummaryProviderLogo(providerKey: selectedProviderKey!),
            const SizedBox(width: AppSpacing.xs),
            Text(
              title,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          visibleReads.isNotEmpty
              ? _readCountCopy(
                  visibleCount: visibleReads.length,
                  totalCount: topReads.length,
                  providerKey: selectedProviderKey,
                )
              : 'Cited source links for this provider',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        if (visibleReads.isNotEmpty)
          ...List.generate(
            visibleReads.length,
            (index) => _ReadCard(
              key: ValueKey('$listKeyPrefix-$index'),
              readIndex: index,
              keyPrefix: listKeyPrefix,
              read: visibleReads[index],
              showDivider: index < visibleReads.length - 1,
              showReason: true,
              showCitationSnippet: true,
              showLeadingRank: false,
              showInsightLabels: true,
              showSelectionReasons: true,
              compact: false,
              featured: selectedProviderKey == null && index == 0,
              citations: _citationsForRead(visibleReads[index]),
              onOpenUrl: onOpenUrl,
            ),
          )
        else if (visibleFallback.isNotEmpty)
          ...List.generate(
            visibleFallback.length,
            (index) => _CitationCard(
              key: ValueKey('reader-summary-citation-fallback-$index'),
              citation: visibleFallback[index],
              showDivider: index < visibleFallback.length - 1,
              onOpenUrl: onOpenUrl,
            ),
          )
        else
          Text(
            'No highlighted posts for this source in the current summary.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
      ],
    );
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1040),
      child: list,
    );
  }

  List<SummaryCitation> _citationsForRead(TopRead read) {
    return read.citationIds
        .map((id) => citationsById[id])
        .whereType<SummaryCitation>()
        .toList(growable: false);
  }
}

String _readCountCopy({
  required int visibleCount,
  required int totalCount,
  required String? providerKey,
}) {
  if (providerKey != null) {
    final provider = readerSummaryProviderLabel(providerKey);
    final noun = visibleCount == 1 ? 'item' : 'items';
    return '$visibleCount $provider evidence $noun';
  }
  if (visibleCount == totalCount) {
    final noun = visibleCount == 1 ? 'item' : 'items';
    return '$visibleCount read-first $noun from the evidence set';
  }
  return '$visibleCount of $totalCount read-first items from the evidence set';
}

class _CitationCard extends StatelessWidget {
  const _CitationCard({
    super.key,
    required this.citation,
    required this.showDivider,
    required this.onOpenUrl,
  });

  final SummaryCitation citation;
  final bool showDivider;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final url = citation.canonicalUrl;
    final snippet = _citationSnippet(citation);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(citation.sourceLabel, maxLines: 2),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (snippet != null) Text(snippet, maxLines: 2),
                if (url != null && url.trim().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    url,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: Theme.of(context).colorScheme.primary,
                      decoration: TextDecoration.underline,
                      letterSpacing: 0,
                    ),
                  ),
                ],
              ],
            ),
            trailing: url == null
                ? null
                : const Icon(Icons.chevron_right_rounded),
            onTap: url == null ? null : () => onOpenUrl(url),
          ),
          if (showDivider)
            Divider(
              height: 1,
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
        ],
      ),
    );
  }
}
