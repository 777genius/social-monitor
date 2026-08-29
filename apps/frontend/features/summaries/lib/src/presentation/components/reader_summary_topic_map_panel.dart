part of 'reader_summary_brief_surface.dart';

enum ReaderSummaryTopicMapRenderer { graphView, flutterGraphView }

class ReaderSummaryDeferredTopicMapPanel extends StatefulWidget {
  const ReaderSummaryDeferredTopicMapPanel({super.key, required this.topicMap});

  final ReaderSummaryTopicMap topicMap;

  @override
  State<ReaderSummaryDeferredTopicMapPanel> createState() =>
      _ReaderSummaryDeferredTopicMapPanelState();
}

class _ReaderSummaryDeferredTopicMapPanelState
    extends State<ReaderSummaryDeferredTopicMapPanel> {
  bool _isReady = false;
  Timer? _deferredRender;

  @override
  void initState() {
    super.initState();
    _showAfterFirstFrame();
  }

  @override
  void didUpdateWidget(covariant ReaderSummaryDeferredTopicMapPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.topicMap != widget.topicMap) {
      _isReady = false;
      _showAfterFirstFrame();
    }
  }

  void _showAfterFirstFrame() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _deferredRender?.cancel();
      _deferredRender = Timer(const Duration(milliseconds: 16), () {
        if (mounted && !_isReady) {
          setState(() => _isReady = true);
        }
      });
    });
  }

  @override
  void dispose() {
    _deferredRender?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isReady) {
      return ReaderSummaryTopicMapPanel(topicMap: widget.topicMap);
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : 640.0;
        return SizedBox(
          key: const ValueKey('deferred-topic-map-placeholder'),
          width: width,
          height: width < 420 ? 360 : 420,
        );
      },
    );
  }
}

class ReaderSummaryTopicMapPanel extends StatelessWidget {
  const ReaderSummaryTopicMapPanel({
    super.key,
    required this.topicMap,
    this.renderer = ReaderSummaryTopicMapRenderer.graphView,
  });

  final ReaderSummaryTopicMap topicMap;
  final ReaderSummaryTopicMapRenderer renderer;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final muted = Theme.of(context).brightness == Brightness.dark
        ? AppColors.darkTextMuted
        : AppColors.textMuted;
    final borderColor = Theme.of(context).brightness == Brightness.dark
        ? AppColors.darkBorder
        : AppColors.border;

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : 640.0;
        final height = width < 420 ? 320.0 : 380.0;
        final graphSize = Size(width, height);
        final selection = _TopicMapVisibleSelection.fromTopicMap(
          topicMap: topicMap,
          graphSize: graphSize,
        );

        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              label: _topicMapSemanticLabel(selection.nodes),
              child: ExcludeFocusTraversal(
                child: SizedBox(
                  width: width,
                  height: height,
                  child: switch (renderer) {
                    ReaderSummaryTopicMapRenderer.graphView =>
                      _TopicMapForceGraph(
                        topicMap: topicMap,
                        selection: selection,
                        graphSize: graphSize,
                        textColor: colorScheme.onSurface,
                        mutedColor: muted,
                        borderColor: borderColor,
                      ),
                    ReaderSummaryTopicMapRenderer.flutterGraphView =>
                      _TopicMapFlutterGraphView(
                        topicMap: topicMap,
                        selection: selection,
                        graphSize: graphSize,
                        textColor: colorScheme.onSurface,
                        mutedColor: muted,
                        borderColor: borderColor,
                      ),
                  },
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.xs,
              children: [
                for (final group in selection.groups.take(6))
                  _TopicGroupLegendChip(
                    group: group,
                    label: _topicMapLegendLabel(topicMap, group),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _TopicGroupLegendChip extends StatelessWidget {
  const _TopicGroupLegendChip({required this.group, required this.label});

  final ReaderSummaryTopicMapGroup group;
  final String label;

  @override
  Widget build(BuildContext context) {
    final color = _topicColor(group.colorKey);
    final textTheme = Theme.of(context).textTheme;

    return DecoratedBox(
      key: ValueKey('topic-map-legend-${group.id}'),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        border: Border.all(color: color.withValues(alpha: 0.32)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              child: const SizedBox(width: 8, height: 8),
            ),
            const SizedBox(width: AppSpacing.xs),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
