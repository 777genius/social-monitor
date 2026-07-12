part of 'reader_summary_brief_surface.dart';

class _AiBriefCopy extends StatelessWidget {
  const _AiBriefCopy({
    required this.summary,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final content = summary.content;
    final primaryTheme = _primaryTheme(content);
    final citationSourceById = _citationSourceById(content.topReads);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _headlineCopy(primaryTheme),
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            height: 1.15,
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        if (content.narrativeSections.isNotEmpty)
          _ReaderSummaryNarrative(
            sections: content.narrativeSections,
            claims: content.claimBoard,
            citationsById: citationsById,
            citationSourceById: citationSourceById,
            onOpenUrl: onOpenUrl,
          )
        else ...[
          _MarkdownBriefText(
            markdown: _summaryMarkdown(summary),
            onOpenUrl: onOpenUrl,
          ),
          const SizedBox(height: AppSpacing.xs),
          _BriefCitationTrail(
            keyBase: 'reader-summary-lede',
            citationIds: _summaryCitationIds(content),
            citationsById: citationsById,
            citationSourceById: citationSourceById,
            onOpenUrl: onOpenUrl,
          ),
        ],
      ],
    );
  }
}

class _MarkdownBriefText extends StatelessWidget {
  const _MarkdownBriefText({required this.markdown, required this.onOpenUrl});

  final String markdown;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bodyStyle = theme.textTheme.bodyLarge?.copyWith(
      height: 1.45,
      letterSpacing: 0,
    );
    final linkStyle = bodyStyle?.copyWith(
      color: theme.colorScheme.primary,
      decoration: TextDecoration.none,
      fontWeight: FontWeight.w800,
    );

    return MarkdownBody(
      data: markdown,
      selectable: false,
      onTapLink: (_, href, _) {
        if (href != null && href.trim().isNotEmpty) {
          onOpenUrl(href);
        }
      },
      styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
        p: bodyStyle,
        pPadding: EdgeInsets.zero,
        strong: bodyStyle?.copyWith(fontWeight: FontWeight.w900),
        a: linkStyle,
        blockSpacing: AppSpacing.xs,
        listIndent: AppSpacing.lg,
        listBullet: bodyStyle,
      ),
    );
  }
}

class _BriefCitationTrail extends StatelessWidget {
  const _BriefCitationTrail({
    super.key,
    required this.keyBase,
    required this.citationIds,
    required this.citationsById,
    required this.citationSourceById,
    required this.onOpenUrl,
    this.claim,
    this.inline = false,
  });

  final String keyBase;
  final List<String> citationIds;
  final Map<String, SummaryCitation> citationsById;
  final Map<String, _CitationSourceContext> citationSourceById;
  final ValueChanged<String> onOpenUrl;
  final SummaryClaim? claim;
  final bool inline;

  @override
  Widget build(BuildContext context) {
    final citations = _citationsForIds(citationIds, citationsById);
    if (citations.isEmpty) {
      return const SizedBox.shrink();
    }

    final primaryCitation = citations.first;
    final children = <Widget>[
      _CitationChip(
        key: ValueKey('$keyBase-citation-${primaryCitation.id}'),
        citation: primaryCitation,
        relatedCitations: citations,
        citationSourceById: citationSourceById,
        onOpenUrl: onOpenUrl,
      ),
      if (claim != null) _ClaimTrustIndicator(claim: claim!),
    ];
    if (inline) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          children.first,
          if (children.length > 1) ...[const SizedBox(width: 3), children.last],
        ],
      );
    }
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: children,
    );
  }
}
