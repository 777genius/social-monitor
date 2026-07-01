part of 'reader_summary_brief_surface.dart';

class _AiBriefCopy extends StatelessWidget {
  const _AiBriefCopy({
    required this.content,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final ReaderSummaryContent content;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final primaryTheme = _primaryTheme(content);
    final firstTopicInsight = content.oneLineTakeaway.trim().isNotEmpty
        ? _cleanSentence(content.oneLineTakeaway)
        : content.interestSections.isEmpty
        ? _cleanSentence(content.oneLineTakeaway)
        : _cleanSentence(content.interestSections.first.insight);
    final topLinks = content.topReads.take(3).toList(growable: false);
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
          'AI summary',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: Theme.of(context).colorScheme.primary,
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          _headlineCopy(primaryTheme),
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            height: 1.15,
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        _CitedBriefText(
          keyBase: 'reader-summary-lede',
          spans: [
            const _BriefText('Summary: ', strong: true),
            _BriefText(_ensureSentence(firstTopicInsight)),
          ],
          citationIds: _summaryCitationIds(content),
          citationsById: citationsById,
          onOpenUrl: onOpenUrl,
        ),
        if (topLinks.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Key links',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          for (final entry in topLinks.indexed) ...[
            _CitedBriefText(
              keyBase: 'reader-summary-key-link-${entry.$1}',
              spans: [
                const _BriefText('- '),
                _BriefText.link(
                  _shortTitle(entry.$2.title),
                  entry.$2.canonicalUrl,
                ),
              ],
              citationIds: entry.$2.citationIds,
              citationsById: citationsById,
              onOpenUrl: onOpenUrl,
            ),
            if (entry.$1 != topLinks.length - 1)
              const SizedBox(height: AppSpacing.xs),
          ],
        ],
        const SizedBox(height: AppSpacing.sm),
        _CitedBriefText(
          keyBase: 'reader-summary-source-note',
          spans: sourceNoteSpans,
          citationIds: sourceNoteCitationIds,
          citationsById: citationsById,
          onOpenUrl: onOpenUrl,
          muted: true,
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
    required this.onOpenUrl,
    this.muted = false,
  });

  final String keyBase;
  final List<_BriefText> spans;
  final List<String> citationIds;
  final Map<String, SummaryCitation> citationsById;
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
    final strongStyle = bodyStyle?.copyWith(fontWeight: FontWeight.w900);
    final linkStyle = bodyStyle?.copyWith(
      color: theme.colorScheme.primary,
      decoration: TextDecoration.underline,
      decorationThickness: 1.5,
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
            _textSpanFor(widget.spans[index], index, linkStyle, strongStyle),
          if (citations.isNotEmpty) const TextSpan(text: ' '),
          for (final citation in citations)
            WidgetSpan(
              alignment: PlaceholderAlignment.baseline,
              baseline: TextBaseline.alphabetic,
              child: Padding(
                padding: const EdgeInsets.only(right: AppSpacing.xs),
                child: _CitationChip(
                  key: ValueKey('${widget.keyBase}-citation-${citation.id}'),
                  label: _citationLabel(citation, widget.citationsById),
                  citation: citation,
                  onOpenUrl: widget.onOpenUrl,
                ),
              ),
            ),
        ],
      ),
    );
  }

  TextSpan _textSpanFor(
    _BriefText span,
    int index,
    TextStyle? linkStyle,
    TextStyle? strongStyle,
  ) {
    final url = span.url;
    if (url == null || url.trim().isEmpty) {
      return TextSpan(text: span.text, style: span.strong ? strongStyle : null);
    }
    return TextSpan(
      text: span.text,
      style: linkStyle,
      recognizer: _recognizers[index],
    );
  }
}

class _CitationChip extends StatelessWidget {
  const _CitationChip({
    super.key,
    required this.label,
    required this.citation,
    required this.onOpenUrl,
  });

  final String label;
  final SummaryCitation citation;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final url = citation.canonicalUrl;
    final canOpen = url != null && url.trim().isNotEmpty;
    final colorScheme = Theme.of(context).colorScheme;
    return Semantics(
      link: canOpen,
      label: '${citation.sourceLabel} source citation',
      child: MouseRegion(
        cursor: canOpen ? SystemMouseCursors.click : MouseCursor.defer,
        child: InkWell(
          onTap: canOpen ? () => onOpenUrl(url) : null,
          borderRadius: BorderRadius.circular(6),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.7),
              border: Border.all(color: colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: canOpen
                      ? colorScheme.primary
                      : colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                  height: 1.1,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

final class _BriefText {
  const _BriefText(this.text, {this.strong = false}) : url = null;
  const _BriefText.link(this.text, this.url) : strong = false;

  final String text;
  final String? url;
  final bool strong;
}
