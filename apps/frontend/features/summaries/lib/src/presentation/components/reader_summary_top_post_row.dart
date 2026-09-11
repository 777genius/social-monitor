part of 'reader_summary_brief_surface.dart';

class _TopPostRow extends StatefulWidget {
  const _TopPostRow({
    super.key,
    required this.index,
    required this.item,
    required this.dateLabel,
    required this.citationsById,
    required this.rating,
    required this.onRated,
    required this.onOpenUrl,
    this.dense = false,
    this.reservePreviewSpace = false,
    this.showSignal = true,
  });

  final int index;
  final TopRead item;
  final String dateLabel;
  final Map<String, SummaryCitation> citationsById;
  final int? rating;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )?
  onRated;
  final ValueChanged<String> onOpenUrl;
  final bool dense;
  final bool reservePreviewSpace;
  final bool showSignal;

  @override
  State<_TopPostRow> createState() => _TopPostRowState();
}

class _TopPostRowState extends State<_TopPostRow> {
  final FocusNode _focusNode = FocusNode(
    debugLabel: 'Reader summary top post row',
  );

  bool _hovered = false;
  bool _focused = false;
  bool _ratingInFlight = false;
  bool _ratedInSession = false;
  bool _evidenceExpanded = false;
  bool _showOriginal = false;
  bool _originalExpanded = false;

  bool get _showRating =>
      widget.onRated != null &&
      (_hovered ||
          _focused ||
          _ratingInFlight ||
          _ratedInSession ||
          widget.rating != null);

  @override
  void didUpdateWidget(covariant _TopPostRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.index != oldWidget.index || widget.item != oldWidget.item) {
      _ratingInFlight = false;
      _ratedInSession = widget.rating != null;
      _evidenceExpanded = false;
      _showOriginal = false;
      _originalExpanded = false;
    } else if (widget.rating != null) {
      _ratedInSession = true;
    }
  }

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final metrics = topPostMetricsFor(widget.item);
    final url = widget.item.canonicalUrl;
    final colorScheme = Theme.of(context).colorScheme;
    final stripeColor = colorScheme.surfaceContainerHighest.withValues(
      alpha: widget.dense ? 0.12 : 0.16,
    );
    return MouseRegion(
      onEnter: (_) => _setHovered(true),
      onExit: (_) => _setHovered(false),
      child: Focus(
        focusNode: _focusNode,
        onFocusChange: _setFocused,
        child: Semantics(
          container: true,
          explicitChildNodes: true,
          link: url != null,
          label: url != null
              ? readerSummaryUrlActionSemantics(
                  'post-card',
                  readerSummaryTopPostIdentity(widget.item),
                )
              : widget.item.cardKind == ReaderSummaryCardKind.relatedTopic
              ? 'Related topic: ${widget.item.title}'
              : null,
          child: Material(
            key: ValueKey(
              'reader-summary-top-post-row-'
              '${readerSummaryTopPostIdentity(widget.item)}',
            ),
            color: widget.index.isOdd ? stripeColor : Colors.transparent,
            child: InkWell(
              key: readerSummaryUrlActionKey(
                'post-card',
                readerSummaryTopPostIdentity(widget.item),
              ),
              onTap: url == null ? null : () => widget.onOpenUrl(url),
              hoverColor: colorScheme.primary.withValues(alpha: 0.03),
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: widget.dense ? AppSpacing.sm + 2 : AppSpacing.md,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [_buildRow(context, metrics)],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRow(BuildContext context, List<TopPostMetric> metrics) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 980;
        final rating = widget.onRated == null
            ? const SizedBox.shrink()
            : _TopPostRatingSlot(
                visible: _showRating,
                child: _TopPostRatingControl(
                  dense: widget.dense,
                  rating: widget.rating,
                  onRated: _submitRating,
                ),
              );

        if (widget.dense) {
          final supportSignal = _topPostSupportSignal(
            item: widget.item,
            citationsById: widget.citationsById,
          );
          return _denseTopPostRow(
            context,
            widget.item,
            metrics,
            constraints.maxWidth,
            rating,
            _TopPostMenu(item: widget.item, onOpenUrl: widget.onOpenUrl),
            supportSignal,
            showOriginal: _showOriginal,
            showOriginalControl: true,
            originalExpanded: _originalExpanded,
            onOriginalChanged: _setShowOriginal,
            onOriginalExpandedChanged: _setOriginalExpanded,
          );
        }

        final source = _TopPostSourceColumn(
          item: widget.item,
          dateLabel: widget.dateLabel,
          rating: rating,
        );
        final content = _TopPostContentColumn(
          item: widget.item,
          reservePreviewSpace: widget.reservePreviewSpace,
          showOriginal: _showOriginal,
          showOriginalControl: _hovered || _focused || _showOriginal || !wide,
          originalExpanded: _originalExpanded,
          onOriginalChanged: _setShowOriginal,
          onOriginalExpandedChanged: _setOriginalExpanded,
        );
        final metricsRow = _TopPostMetricsRow(metrics: metrics);
        final supportSignal = _topPostSupportSignal(
          item: widget.item,
          citationsById: widget.citationsById,
        );
        final relevance = _TopPostRelevanceColumn(
          item: widget.item,
          supportSignal: supportSignal,
          showSignal: widget.showSignal,
        );
        final menu = _TopPostMenu(
          item: widget.item,
          onOpenUrl: widget.onOpenUrl,
        );

        if (wide) {
          return _withEvidenceStack(
            wide: true,
            supportSignal: supportSignal,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 190, child: source),
                const SizedBox(width: AppSpacing.md),
                Expanded(child: content),
                const SizedBox(width: AppSpacing.md),
                metricsRow,
                const SizedBox(width: AppSpacing.md),
                SizedBox(width: 156, child: relevance),
                const SizedBox(width: AppSpacing.sm),
                menu,
              ],
            ),
          );
        }

        return _withEvidenceStack(
          wide: false,
          supportSignal: supportSignal,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: source),
                  Flexible(child: relevance),
                  menu,
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              content,
              const SizedBox(height: AppSpacing.sm),
              metricsRow,
            ],
          ),
        );
      },
    );
  }

  void _setShowOriginal(bool value) {
    setState(() {
      _showOriginal = value;
      if (!value) _originalExpanded = false;
    });
  }

  void _setOriginalExpanded(bool value) {
    setState(() => _originalExpanded = value);
  }

  Widget _withEvidenceStack({
    required bool wide,
    required _TopPostSupportSignal supportSignal,
    required Widget child,
  }) {
    if (supportSignal.kind == _TopPostSupportKind.singleSource &&
        supportSignal.evidenceItems.isEmpty) {
      return child;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        child,
        Padding(
          padding: EdgeInsets.only(
            left: wide ? AppSpacing.xl : AppSpacing.md,
            right: wide ? AppSpacing.md : 0,
            top: AppSpacing.sm,
          ),
          child: _TopPostEvidenceStack(
            supportSignal: supportSignal,
            expanded: _evidenceExpanded,
            onToggle: _toggleEvidenceExpanded,
            onOpenUrl: widget.onOpenUrl,
          ),
        ),
      ],
    );
  }

  void _setHovered(bool value) {
    if (_hovered == value) {
      return;
    }
    setState(() => _hovered = value);
  }

  void _setFocused(bool value) {
    if (_focused == value) {
      return;
    }
    setState(() => _focused = value);
  }

  void _toggleEvidenceExpanded() {
    setState(() => _evidenceExpanded = !_evidenceExpanded);
  }

  Future<bool> _submitRating(int rating, PostRatingReason? reason) async {
    final onRated = widget.onRated;
    if (onRated == null) {
      return false;
    }
    setState(() => _ratingInFlight = true);
    try {
      final submitted = await onRated(widget.item, rating, reason);
      if (!mounted) {
        return submitted;
      }
      setState(() {
        _ratingInFlight = false;
        _ratedInSession = submitted || _ratedInSession;
      });
      return submitted;
    } catch (_) {
      if (!mounted) {
        return false;
      }
      setState(() => _ratingInFlight = false);
      return false;
    }
  }
}
