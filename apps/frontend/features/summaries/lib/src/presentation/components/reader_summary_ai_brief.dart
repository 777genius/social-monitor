part of 'reader_summary_brief_surface.dart';

class _AiBriefCopy extends StatelessWidget {
  const _AiBriefCopy({required this.content, required this.onOpenUrl});

  final ReaderSummaryContent content;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final primaryTheme = _primaryTheme(content);
    final firstTopicInsight = content.oneLineTakeaway.trim().isNotEmpty
        ? _cleanSentence(content.oneLineTakeaway)
        : content.topicSections.isEmpty
        ? _cleanSentence(content.oneLineTakeaway)
        : _cleanSentence(content.topicSections.first.insight);
    final topLinks = content.topReads.take(3).toList(growable: false);
    final xRead = _firstReadForProvider(content.topReads, 'x-twitter');
    final redditRead = _firstReadForProvider(content.topReads, 'reddit');

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
        _LinkedBriefText(
          spans: [
            const _BriefText('Brief: '),
            _BriefText('$firstTopicInsight.'),
            if (topLinks.isNotEmpty) const _BriefText(' Key links: '),
            ..._joinedReadLinks(topLinks),
            if (topLinks.isNotEmpty)
              const _BriefText(' - these are the most useful first reads.'),
          ],
          onOpenUrl: onOpenUrl,
        ),
        const SizedBox(height: AppSpacing.sm),
        _LinkedBriefText(
          spans: [
            if (xRead != null) ...[
              const _BriefText('Check the X/Twitter signal '),
              _BriefText.link(_shortTitle(xRead.title), xRead.canonicalUrl),
              const _BriefText(
                ': engagement helps discovery, but treat the claim as unconfirmed until GitHub, HN, RSS, or Reddit confirms it.',
              ),
            ] else ...[
              const _BriefText(
                'Keep claims as hypotheses until a second source confirms them.',
              ),
            ],
            if (redditRead != null) ...[
              const _BriefText(' Reddit adds practical context: '),
              _BriefText.link(
                _shortTitle(redditRead.title),
                redditRead.canonicalUrl,
              ),
              const _BriefText('.'),
            ],
          ],
          onOpenUrl: onOpenUrl,
        ),
      ],
    );
  }
}

class _LinkedBriefText extends StatefulWidget {
  const _LinkedBriefText({required this.spans, required this.onOpenUrl});

  final List<_BriefText> spans;
  final ValueChanged<String> onOpenUrl;

  @override
  State<_LinkedBriefText> createState() => _LinkedBriefTextState();
}

class _LinkedBriefTextState extends State<_LinkedBriefText> {
  late List<TapGestureRecognizer?> _recognizers;

  @override
  void initState() {
    super.initState();
    _recognizers = _buildRecognizers();
  }

  @override
  void didUpdateWidget(covariant _LinkedBriefText oldWidget) {
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
    final bodyStyle = Theme.of(
      context,
    ).textTheme.bodyLarge?.copyWith(height: 1.45, letterSpacing: 0);
    final linkStyle = bodyStyle?.copyWith(
      color: Theme.of(context).colorScheme.primary,
      decoration: TextDecoration.underline,
      decorationThickness: 1.5,
      fontWeight: FontWeight.w800,
    );

    return SelectableText.rich(
      TextSpan(
        style: bodyStyle,
        children: [
          for (var index = 0; index < widget.spans.length; index += 1)
            () {
              final span = widget.spans[index];
              final url = span.url;
              if (url == null || url.trim().isEmpty) {
                return TextSpan(text: span.text);
              }
              return TextSpan(
                text: span.text,
                style: linkStyle,
                recognizer: _recognizers[index],
              );
            }(),
        ],
      ),
      selectionControls: materialTextSelectionControls,
    );
  }
}

class _FirstChecksPanel extends StatelessWidget {
  const _FirstChecksPanel({required this.topReads, required this.onOpenUrl});

  final List<TopRead> topReads;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final reads = topReads.take(3).toList(growable: false);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Read first',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            for (final read in reads) ...[
              _PanelLink(read: read, onOpenUrl: onOpenUrl),
              const SizedBox(height: AppSpacing.xs),
            ],
            const Divider(height: AppSpacing.md),
            _PanelMetric(label: 'Evidence', value: '${topReads.length} reads'),
            const _PanelMetric(label: 'Priority', value: 'Read links first'),
          ],
        ),
      ),
    );
  }
}

class _PanelLink extends StatelessWidget {
  const _PanelLink({required this.read, required this.onOpenUrl});

  final TopRead read;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final url = read.canonicalUrl;
    return InkWell(
      onTap: url == null ? null : () => onOpenUrl(url),
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Text(
          _shortTitle(read.title),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.primary,
            fontWeight: FontWeight.w800,
            decoration: TextDecoration.underline,
            letterSpacing: 0,
          ),
        ),
      ),
    );
  }
}

class _PanelMetric extends StatelessWidget {
  const _PanelMetric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
          ),
        ],
      ),
    );
  }
}
