part of 'reader_summary_brief_surface.dart';

class _CitationChip extends StatefulWidget {
  const _CitationChip({
    super.key,
    required this.citation,
    required this.relatedCitations,
    required this.citationSourceById,
    required this.onOpenUrl,
  });

  final SummaryCitation citation;
  final List<SummaryCitation> relatedCitations;
  final Map<String, _CitationSourceContext> citationSourceById;
  final ValueChanged<String> onOpenUrl;

  @override
  State<_CitationChip> createState() => _CitationChipState();
}

class _CitationChipState extends State<_CitationChip> {
  final MenuController _menuController = MenuController();
  Timer? _closeTimer;
  bool _menuOpen = false;

  @override
  void dispose() {
    _closeTimer?.cancel();
    super.dispose();
  }

  void _openMenu() {
    _closeTimer?.cancel();
    if (!_menuOpen) {
      setState(() => _menuOpen = true);
    }
    if (!_menuController.isOpen) {
      _menuController.open();
    }
  }

  void _toggleMenu() {
    _closeTimer?.cancel();
    if (_menuController.isOpen) {
      setState(() => _menuOpen = false);
      _menuController.close();
    } else {
      setState(() => _menuOpen = true);
      _menuController.open();
    }
  }

  void _scheduleClose() {
    _closeTimer?.cancel();
    _closeTimer = Timer(const Duration(milliseconds: 280), () {
      if (mounted) {
        setState(() => _menuOpen = false);
        _menuController.close();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final url = widget.citation.canonicalUrl;
    final canOpen = url != null && url.trim().isNotEmpty;
    final relatedCitations = widget.relatedCitations.isEmpty
        ? [widget.citation]
        : widget.relatedCitations;
    final sourceCount = _citationSourceCount(
      relatedCitations,
      widget.citationSourceById,
    );
    final colorScheme = Theme.of(context).colorScheme;
    return MenuAnchor(
      controller: _menuController,
      alignmentOffset: const Offset(0, 6),
      menuChildren: _menuOpen
          ? [
              for (final citation in relatedCitations)
                MouseRegion(
                  onEnter: (_) => _openMenu(),
                  onExit: (_) => _scheduleClose(),
                  child: MenuItemButton(
                    key: ValueKey(
                      'reader-summary-citation-source-${citation.id}',
                    ),
                    onPressed:
                        citation.canonicalUrl != null &&
                            citation.canonicalUrl!.trim().isNotEmpty
                        ? () => widget.onOpenUrl(citation.canonicalUrl!)
                        : null,
                    child: _CitationSourcePreview(
                      citation: citation,
                      source: widget.citationSourceById[citation.id],
                    ),
                  ),
                ),
            ]
          : const [],
      child: Semantics(
        button: true,
        link: canOpen,
        label: _citationSemanticsLabel(widget.citation, relatedCitations),
        child: MouseRegion(
          onEnter: (_) => _openMenu(),
          onExit: (_) => _scheduleClose(),
          cursor: SystemMouseCursors.click,
          child: InkWell(
            onTap: _toggleMenu,
            borderRadius: BorderRadius.circular(6),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest.withValues(
                  alpha: 0.7,
                ),
                border: Border.all(color: colorScheme.outlineVariant),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.hub_outlined,
                      size: 13,
                      color: canOpen
                          ? colorScheme.primary
                          : colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      '$sourceCount',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: canOpen
                            ? colorScheme.primary
                            : colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                        height: 1.1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

final class _CitationSourceContext {
  const _CitationSourceContext({
    required this.title,
    required this.providerKey,
    required this.read,
    this.canonicalUrl,
  });

  final String title;
  final String providerKey;
  final TopRead read;
  final String? canonicalUrl;
}

class _CitationSourcePreview extends StatelessWidget {
  const _CitationSourcePreview({required this.citation, this.source});

  final SummaryCitation citation;
  final _CitationSourceContext? source;

  @override
  Widget build(BuildContext context) {
    final snippet = _citationSnippet(citation);
    final providerKey = _providerKeyForCitation(citation, source);
    final title = _citationPreviewTitle(citation, source);
    final read = source?.read;
    if (read != null) {
      return _TopPostReferenceCard(
        read: read,
        fallbackSnippet: snippet,
        providerKey: providerKey,
      );
    }
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 260, maxWidth: 360),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: ReaderSummaryProviderLogo(
                providerKey: providerKey,
                size: 18,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0,
                    ),
                  ),
                  if (snippet != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      snippet,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        height: 1.3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _citationPreviewTitle(
  SummaryCitation citation,
  _CitationSourceContext? source,
) {
  final title = _titleForCitation(citation, source);
  final label = _citationNumberLabel(citation.sourceLabel);
  if (label == null) {
    return title;
  }
  return '$label $title';
}

String _titleForCitation(
  SummaryCitation citation,
  _CitationSourceContext? source,
) {
  final title = source?.title.trim();
  if (title != null && title.isNotEmpty) {
    return _withoutCitationNumber(title);
  }
  return _withoutCitationNumber(citation.sourceLabel);
}

String? _citationNumberLabel(String value) {
  return RegExp(r'\[\d+\]').firstMatch(value)?.group(0);
}

String _withoutCitationNumber(String value) {
  return value
      .replaceFirst(RegExp(r'^\s*\[\d+\]\s*'), '')
      .replaceFirst(RegExp(r'\s*\[\d+\]\s*$'), '')
      .trim();
}

String _providerKeyForCitation(
  SummaryCitation citation,
  _CitationSourceContext? source,
) {
  final sourceProvider = source?.providerKey.trim();
  if (sourceProvider != null && sourceProvider.isNotEmpty) {
    return sourceProvider;
  }
  final citationProvider = citation.providerKey?.trim();
  if (citationProvider != null && citationProvider.isNotEmpty) {
    return citationProvider;
  }
  final haystack =
      '${citation.sourceLabel} ${citation.safeSnippet} ${citation.canonicalUrl ?? ''}'
          .toLowerCase();
  if (haystack.contains('reddit')) {
    return 'reddit';
  }
  if (haystack.contains('hacker news') || haystack.contains('ycombinator')) {
    return 'hacker-news';
  }
  if (haystack.contains('x/twitter') || haystack.contains('x.com/')) {
    return 'x-twitter';
  }
  if (haystack.contains('github')) {
    return 'github';
  }
  if (haystack.contains('rss')) {
    return 'rss';
  }
  return 'web';
}

String _citationSemanticsLabel(
  SummaryCitation citation,
  List<SummaryCitation> relatedCitations,
) {
  final count = relatedCitations.length;
  if (count <= 1) {
    return '${citation.sourceLabel} source citation';
  }
  return '${citation.sourceLabel} source citation, $count sources available';
}

int _citationSourceCount(
  List<SummaryCitation> citations,
  Map<String, _CitationSourceContext> citationSourceById,
) {
  final sources = <String>{};
  for (final citation in citations) {
    final source = citationSourceById[citation.id];
    final identity =
        source?.canonicalUrl?.trim() ??
        citation.canonicalUrl?.trim() ??
        citation.id.trim();
    if (identity.isNotEmpty) {
      sources.add(identity.toLowerCase());
    }
  }
  return sources.isEmpty ? citations.length : sources.length;
}

class _TopPostReferenceCard extends StatelessWidget {
  const _TopPostReferenceCard({
    required this.read,
    required this.providerKey,
    this.fallbackSnippet,
  });

  final TopRead read;
  final String providerKey;
  final String? fallbackSnippet;

  @override
  Widget build(BuildContext context) {
    final metrics = topPostMetricsFor(read);
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final snippet = fallbackSnippet;
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 320, maxWidth: 460),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerLowest,
          border: Border.all(color: colorScheme.outlineVariant),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _TopPostProviderTile(providerKey: providerKey),
              const SizedBox(width: AppSpacing.sm + 4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _TopPostTextBody(item: read, floatPreview: false),
                    if (snippet != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        snippet,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.labelSmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                          letterSpacing: 0,
                          height: 1.3,
                        ),
                      ),
                    ],
                    if (metrics.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.sm),
                      _TopPostMetricsRow(metrics: metrics.take(3).toList()),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
