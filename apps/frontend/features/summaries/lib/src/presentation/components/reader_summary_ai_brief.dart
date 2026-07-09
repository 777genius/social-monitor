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
    final xRead = _firstReadForProvider(content.topReads, 'x-twitter');
    final redditRead = _firstReadForProvider(content.topReads, 'reddit');
    final sourceNoteSpans = xRead == null
        ? const [
            _BriefText(
              'Keep claims as hypotheses until a second source confirms them.',
            ),
          ]
        : [
            const _BriefText('Source note: '),
            _BriefText.link(_shortTitle(xRead.title), xRead.canonicalUrl),
            const _BriefText(
              ' has enough engagement for discovery, but keep the claim unconfirmed until GitHub, HN, RSS, or Reddit confirms it.',
            ),
            if (redditRead != null) ...[
              const _BriefText(' Reddit adds practical context through '),
              _BriefText.link(
                _shortTitle(redditRead.title),
                redditRead.canonicalUrl,
              ),
              const _BriefText('.'),
            ],
          ];
    final sourceNoteCitationIds = _uniqueCitationIds([
      ...?xRead?.citationIds,
      ...?redditRead?.citationIds,
    ]);

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
        const SizedBox(height: AppSpacing.sm),
        _CitedBriefText(
          keyBase: 'reader-summary-source-note',
          spans: sourceNoteSpans,
          citationIds: sourceNoteCitationIds,
          citationsById: citationsById,
          citationSourceById: citationSourceById,
          onOpenUrl: onOpenUrl,
          muted: true,
        ),
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
    required this.keyBase,
    required this.citationIds,
    required this.citationsById,
    required this.citationSourceById,
    required this.onOpenUrl,
  });

  final String keyBase;
  final List<String> citationIds;
  final Map<String, SummaryCitation> citationsById;
  final Map<String, _CitationSourceContext> citationSourceById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final citations = _citationsForIds(citationIds, citationsById);
    if (citations.isEmpty) {
      return const SizedBox.shrink();
    }

    final primaryCitation = citations.first;
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        _CitationChip(
          key: ValueKey('$keyBase-citation-${primaryCitation.id}'),
          citation: primaryCitation,
          relatedCitations: citations,
          citationSourceById: citationSourceById,
          onOpenUrl: onOpenUrl,
        ),
      ],
    );
  }
}

class _CitedBriefText extends StatefulWidget {
  const _CitedBriefText({
    required this.keyBase,
    required this.spans,
    required this.citationIds,
    required this.citationsById,
    required this.citationSourceById,
    required this.onOpenUrl,
    this.muted = false,
  });

  final String keyBase;
  final List<_BriefText> spans;
  final List<String> citationIds;
  final Map<String, SummaryCitation> citationsById;
  final Map<String, _CitationSourceContext> citationSourceById;
  final ValueChanged<String> onOpenUrl;
  final bool muted;

  @override
  State<_CitedBriefText> createState() => _CitedBriefTextState();
}

class _CitedBriefTextState extends State<_CitedBriefText> {
  late List<TapGestureRecognizer?> _recognizers;

  @override
  void initState() {
    super.initState();
    _recognizers = _buildRecognizers();
  }

  @override
  void didUpdateWidget(covariant _CitedBriefText oldWidget) {
    super.didUpdateWidget(oldWidget);
    _disposeRecognizers();
    _recognizers = _buildRecognizers();
  }

  @override
  void dispose() {
    _disposeRecognizers();
    super.dispose();
  }

  List<TapGestureRecognizer?> _buildRecognizers() {
    return widget.spans
        .map((span) {
          final url = span.url;
          if (url == null || url.trim().isEmpty) {
            return null;
          }
          return TapGestureRecognizer()..onTap = () => widget.onOpenUrl(url);
        })
        .toList(growable: false);
  }

  void _disposeRecognizers() {
    for (final recognizer in _recognizers.whereType<TapGestureRecognizer>()) {
      recognizer.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bodyStyle = theme.textTheme.bodyLarge?.copyWith(
      height: 1.45,
      letterSpacing: 0,
      color: widget.muted ? theme.colorScheme.onSurfaceVariant : null,
    );
    final linkStyle = bodyStyle?.copyWith(
      color: theme.colorScheme.primary,
      decoration: TextDecoration.none,
      fontWeight: FontWeight.w800,
    );
    final citations = _citationsForIds(
      widget.citationIds,
      widget.citationsById,
    );

    return Text.rich(
      TextSpan(
        style: bodyStyle,
        children: [
          for (var index = 0; index < widget.spans.length; index += 1)
            ..._inlineSpansFor(widget.spans[index], index, linkStyle),
          if (citations.isNotEmpty) const TextSpan(text: ' '),
          if (citations.isNotEmpty)
            WidgetSpan(
              alignment: PlaceholderAlignment.baseline,
              baseline: TextBaseline.alphabetic,
              child: Padding(
                padding: const EdgeInsets.only(right: AppSpacing.xs),
                child: _CitationChip(
                  key: ValueKey(
                    '${widget.keyBase}-citation-${citations.first.id}',
                  ),
                  citation: citations.first,
                  relatedCitations: citations,
                  citationSourceById: widget.citationSourceById,
                  onOpenUrl: widget.onOpenUrl,
                ),
              ),
            ),
        ],
      ),
    );
  }

  List<InlineSpan> _inlineSpansFor(
    _BriefText span,
    int index,
    TextStyle? linkStyle,
  ) {
    final url = span.url;
    if (url == null || url.trim().isEmpty) {
      return [TextSpan(text: span.text)];
    }
    return [
      WidgetSpan(
        alignment: PlaceholderAlignment.middle,
        child: Padding(
          padding: const EdgeInsets.only(right: AppSpacing.xs),
          child: _BriefLinkFavicon(url: url),
        ),
      ),
      TextSpan(
        text: span.text,
        style: linkStyle,
        recognizer: _recognizers[index],
      ),
    ];
  }
}

class _BriefLinkFavicon extends StatelessWidget {
  const _BriefLinkFavicon({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    final faviconUrl = _faviconUrlFor(url);
    final fallbackProviderKey = _providerKeyForUrl(url);
    final fallback = fallbackProviderKey == null
        ? Icon(
            Icons.public_rounded,
            size: 14,
            color: Theme.of(context).colorScheme.primary,
          )
        : ReaderSummaryProviderLogo(providerKey: fallbackProviderKey, size: 14);

    if (faviconUrl == null) {
      return SizedBox.square(dimension: 14, child: Center(child: fallback));
    }

    return SizedBox.square(
      key: ValueKey('reader-summary-brief-link-favicon-$faviconUrl'),
      dimension: 14,
      child: Image.network(
        faviconUrl,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.low,
        errorBuilder: (context, error, stackTrace) => Center(child: fallback),
      ),
    );
  }
}

String? _faviconUrlFor(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null || uri.host.trim().isEmpty) {
    return null;
  }
  final scheme = uri.scheme == 'http' ? 'http' : 'https';
  return '$scheme://${uri.host}/favicon.ico';
}

String? _providerKeyForUrl(String value) {
  final host = Uri.tryParse(value.trim())?.host.toLowerCase() ?? '';
  if (host.contains('reddit.com')) {
    return 'reddit';
  }
  if (host == 'x.com' || host.endsWith('.x.com') || host.contains('twitter.')) {
    return 'x-twitter';
  }
  if (host.contains('github.com')) {
    return 'github';
  }
  if (host.contains('ycombinator.com')) {
    return 'hacker-news';
  }
  return null;
}

final class _BriefText {
  const _BriefText(this.text) : url = null;
  const _BriefText.link(this.text, this.url);

  final String text;
  final String? url;
}
