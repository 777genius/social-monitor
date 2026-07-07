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
  )
  onRated;
  final ValueChanged<String> onOpenUrl;
  final bool dense;
  final bool reservePreviewSpace;

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

  bool get _showRating =>
      _hovered ||
      _focused ||
      _ratingInFlight ||
      _ratedInSession ||
      widget.rating != null;

  @override
  void didUpdateWidget(covariant _TopPostRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.index != oldWidget.index || widget.item != oldWidget.item) {
      _ratingInFlight = false;
      _ratedInSession = widget.rating != null;
      _evidenceExpanded = false;
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
        child: Material(
          key: ValueKey('reader-summary-top-post-${widget.index}'),
          color: widget.index.isOdd ? stripeColor : Colors.transparent,
          child: InkWell(
            onTap: url == null ? null : () => widget.onOpenUrl(url),
            hoverColor: colorScheme.primary.withValues(alpha: 0.03),
            child: Padding(
              padding: EdgeInsets.symmetric(
                vertical: widget.dense ? AppSpacing.sm + 2 : AppSpacing.md,
              ),
              child: _buildRow(context, metrics),
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
        final rating = _TopPostRatingSlot(
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
        );
        final metricsRow = _TopPostMetricsRow(metrics: metrics);
        final supportSignal = _topPostSupportSignal(
          item: widget.item,
          citationsById: widget.citationsById,
        );
        final relevance = _TopPostRelevanceColumn(
          item: widget.item,
          supportSignal: supportSignal,
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

  Widget _withEvidenceStack({
    required bool wide,
    required _TopPostSupportSignal supportSignal,
    required Widget child,
  }) {
    if (supportSignal.evidenceItems.isEmpty) {
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
    setState(() => _ratingInFlight = true);
    try {
      final submitted = await widget.onRated(widget.item, rating, reason);
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

class _TopPostSourceColumn extends StatelessWidget {
  const _TopPostSourceColumn({
    required this.item,
    required this.rating,
    this.dateLabel,
  });

  final TopRead item;
  final Widget rating;
  final String? dateLabel;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final handle = topPostSourceHandle(item);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _TopPostProviderTile(providerKey: item.providerKey),
        const SizedBox(width: AppSpacing.sm + 4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                readerSummaryProviderLabel(item.providerKey),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
              if (handle != null) ...[
                const SizedBox(height: 2),
                Text(
                  handle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelSmall?.copyWith(
                    color: handle.startsWith('@')
                        ? colorScheme.primary
                        : colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0,
                  ),
                ),
              ],
              if (dateLabel != null) ...[
                const SizedBox(height: 2),
                Text(
                  dateLabel!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelSmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xs),
              rating,
            ],
          ),
        ),
      ],
    );
  }
}

class _TopPostProviderTile extends StatelessWidget {
  const _TopPostProviderTile({required this.providerKey});

  final String providerKey;

  @override
  Widget build(BuildContext context) {
    final normalized = providerKey.trim().toLowerCase();
    final isDarkTile =
        normalized == 'x-twitter' ||
        normalized == 'twitter' ||
        normalized.startsWith('github');
    if (!isDarkTile) {
      return SizedBox.square(
        dimension: 34,
        child: Center(
          child: ReaderSummaryProviderLogo(providerKey: providerKey, size: 30),
        ),
      );
    }
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.chartInk,
        borderRadius: BorderRadius.circular(8),
      ),
      child: SizedBox.square(
        dimension: 34,
        child: Center(
          child: Theme(
            data: theme.copyWith(
              colorScheme: theme.colorScheme.copyWith(onSurface: Colors.white),
            ),
            child: ReaderSummaryProviderLogo(providerKey: providerKey),
          ),
        ),
      ),
    );
  }
}
