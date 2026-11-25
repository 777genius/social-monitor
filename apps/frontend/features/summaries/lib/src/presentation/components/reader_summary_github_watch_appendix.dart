part of 'reader_summary_brief_surface.dart';

class _ReaderSummaryGitHubWatchAppendix extends StatelessWidget {
  const _ReaderSummaryGitHubWatchAppendix({
    required this.section,
    required this.lines,
    required this.citationsById,
    required this.citationSourceById,
    required this.onOpenUrl,
  });
  final ReaderSummaryNarrativeSection section;
  final List<GitHubTrendingWatchLine> lines;
  final Map<String, SummaryCitation> citationsById;
  final Map<String, _CitationSourceContext> citationSourceById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceContainerLow,
        border: Border.all(color: colors.outlineVariant),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const ReaderSummaryProviderLogo(
                  providerKey: 'github-trending-page',
                  size: 18,
                ),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    'GitHub Trending',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                const AppStatusBadge(
                  label: 'Watch',
                  tone: AppStatusTone.neutral,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            for (final (index, line) in lines.indexed) ...[
              if (index > 0) Divider(color: colors.outlineVariant, height: 1),
              _ReaderSummaryGitHubWatchLine(
                key: ValueKey('reader-summary-github-watch-row-$index'),
                keyBase: 'reader-summary-github-watch-row-$index',
                line: line,
                citationIds: _citationIdsFor(line),
                citationsById: citationsById,
                citationSourceById: citationSourceById,
                onOpenUrl: onOpenUrl,
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<String> _citationIdsFor(GitHubTrendingWatchLine line) {
    final matching = <String>[];
    final visited = <String>{};
    for (final citationId in section.citationIds) {
      if (!visited.add(citationId)) {
        continue;
      }
      final citation = citationsById[citationId];
      if (normalizedGitHubRepositoryUrlIdentity(citation?.canonicalUrl) ==
          line.repositoryIdentity) {
        matching.add(citationId);
      }
    }
    return matching.length == 1 ? matching : const [];
  }
}

class _ReaderSummaryGitHubWatchLine extends StatelessWidget {
  const _ReaderSummaryGitHubWatchLine({
    super.key,
    required this.keyBase,
    required this.line,
    required this.citationIds,
    required this.citationsById,
    required this.citationSourceById,
    required this.onOpenUrl,
  });
  final String keyBase;
  final GitHubTrendingWatchLine line;
  final List<String> citationIds;
  final Map<String, SummaryCitation> citationsById;
  final Map<String, _CitationSourceContext> citationSourceById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) => Semantics(
    label: line.visibleText,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: ExcludeSemantics(
              child: Text.rich(
                key: ValueKey('$keyBase-text'),
                TextSpan(
                  children: [
                    TextSpan(
                      text: line.repository,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                    TextSpan(
                      text: '\n${line.metric}',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        height: 1.35,
                        letterSpacing: 0,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (citationIds.isNotEmpty) ...[
            const SizedBox(width: AppSpacing.xs),
            _BriefCitationTrail(
              key: ValueKey('$keyBase-trail'),
              keyBase: keyBase,
              citationIds: citationIds,
              citationsById: citationsById,
              citationSourceById: citationSourceById,
              onOpenUrl: onOpenUrl,
              inline: true,
            ),
          ],
        ],
      ),
    ),
  );
}
