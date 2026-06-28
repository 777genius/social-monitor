part of 'reader_summary_brief_surface.dart';

class _SourceFilterChips extends StatelessWidget {
  const _SourceFilterChips({
    required this.entries,
    required this.selectedProviderKey,
    required this.topReadCount,
    required this.citationCount,
    required this.onSelected,
  });

  final List<SourceMixEntry> entries;
  final String? selectedProviderKey;
  final int topReadCount;
  final int citationCount;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        FilterChip(
          key: const ValueKey('reader-summary-source-filter-all'),
          label: Text('$topReadCount top reads'),
          selected: selectedProviderKey == null,
          onSelected: (_) => onSelected(null),
        ),
        AppStatusBadge(
          label: '$citationCount citations',
          tone: AppStatusTone.neutral,
        ),
        for (final entry in entries)
          FilterChip(
            key: ValueKey('reader-summary-source-filter-${entry.providerKey}'),
            label: Text(
              '${readerSummaryProviderLabel(entry.providerKey)} ${entry.itemCount}',
            ),
            selected: selectedProviderKey == entry.providerKey,
            onSelected: (_) => onSelected(entry.providerKey),
          ),
      ],
    );
  }
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
    final title = selectedProviderKey == null
        ? 'Top reads'
        : '${readerSummaryProviderLabel(selectedProviderKey!)} posts';
    final visibleReads = topReads.take(10).toList(growable: false);
    final visibleFallback = fallbackCitations.take(5).toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.open_in_new_outlined, size: 18),
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
              ? 'Showing ${visibleReads.length} of ${topReads.length} strongest reads'
              : 'Showing cited source links for this provider',
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
              key: ValueKey('reader-summary-top-read-$index'),
              readIndex: index,
              read: visibleReads[index],
              citations: visibleReads[index].citationIds
                  .map((id) => citationsById[id])
                  .whereType<SummaryCitation>()
                  .toList(growable: false),
              onOpenUrl: onOpenUrl,
            ),
          )
        else if (visibleFallback.isNotEmpty)
          ...List.generate(
            visibleFallback.length,
            (index) => _CitationCard(
              key: ValueKey('reader-summary-citation-fallback-$index'),
              citation: visibleFallback[index],
              onOpenUrl: onOpenUrl,
            ),
          )
        else
          Text(
            'No highlighted posts for this source in the current brief.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
      ],
    );
  }
}

class _ReadCard extends StatelessWidget {
  const _ReadCard({
    super.key,
    required this.readIndex,
    required this.read,
    required this.citations,
    required this.onOpenUrl,
  });

  final int readIndex;
  final TopRead read;
  final List<SummaryCitation> citations;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final url = read.canonicalUrl;
    final metricSummary = _readMetricSummary(read);
    final citationSnippet = citations.isEmpty
        ? null
        : _citationSnippet(citations.first);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: _isGithub(read)
                    ? const GitHubMark(size: 18)
                    : const Icon(Icons.article_outlined, size: 18),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    InkWell(
                      onTap: url == null ? null : () => onOpenUrl(url),
                      child: Text(
                        read.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                          fontWeight: FontWeight.w900,
                          decoration: TextDecoration.underline,
                          letterSpacing: 0,
                        ),
                      ),
                    ),
                    if (url != null && url.trim().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      KeyedSubtree(
                        key: ValueKey(
                          'reader-summary-top-read-$readIndex-url',
                        ),
                        child: ReaderSummaryExternalLink(
                          url: url,
                          onOpenUrl: onOpenUrl,
                          maxLines: 1,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      _bestReason(read),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (metricSummary != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        metricSummary,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0,
                        ),
                      ),
                    ],
                    if (citationSnippet != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        citationSnippet,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              AppStatusBadge(
                label: readerSummaryProviderLabel(read.providerKey),
                tone: AppStatusTone.neutral,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CitationCard extends StatelessWidget {
  const _CitationCard({
    super.key,
    required this.citation,
    required this.onOpenUrl,
  });

  final SummaryCitation citation;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final url = citation.canonicalUrl;
    final snippet = _citationSnippet(citation);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: ListTile(
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
          trailing: url == null ? null : const Icon(Icons.open_in_new_outlined),
          onTap: url == null ? null : () => onOpenUrl(url),
        ),
      ),
    );
  }
}
