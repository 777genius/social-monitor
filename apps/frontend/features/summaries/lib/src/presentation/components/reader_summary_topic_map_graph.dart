part of 'reader_summary_brief_surface.dart';

class _TopicMapForceGraph extends StatefulWidget {
  const _TopicMapForceGraph({
    required this.topicMap,
    required this.selection,
    required this.graphSize,
    required this.textColor,
    required this.mutedColor,
    required this.borderColor,
  });

  final ReaderSummaryTopicMap topicMap;
  final _TopicMapVisibleSelection selection;
  final Size graphSize;
  final Color textColor;
  final Color mutedColor;
  final Color borderColor;

  @override
  State<_TopicMapForceGraph> createState() => _TopicMapForceGraphState();
}

class _TopicMapForceGraphState extends State<_TopicMapForceGraph> {
  _TopicGraphModel? _model;
  String? _modelCacheKey;

  @override
  Widget build(BuildContext context) {
    final model = _modelForCurrentInput();

    if (model.bubblesById.isEmpty) {
      return Center(
        child: Text(
          'No topic map data',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: widget.mutedColor,
            letterSpacing: 0,
          ),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerLowest,
          border: Border.all(color: widget.borderColor.withValues(alpha: 0.52)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Positioned.fill(
              child: CustomPaint(
                key: const ValueKey('topic-map-edges'),
                painter: _TopicMapEdgesPainter(
                  edges: model.edges,
                  bubblesById: model.bubblesById,
                ),
              ),
            ),
            for (final bubble in model.bubbles)
              Positioned(
                left: bubble.center.dx - bubble.radius,
                top: bubble.center.dy - bubble.radius,
                width: bubble.radius * 2,
                height: bubble.radius * 2,
                child: _TopicMapBubbleNode(
                  bubble: bubble,
                  textColor: widget.textColor,
                  borderColor: widget.borderColor,
                ),
              ),
          ],
        ),
      ),
    );
  }

  _TopicGraphModel _modelForCurrentInput() {
    final cacheKey = [
      widget.selection.signature,
      widget.graphSize.width.toStringAsFixed(2),
      widget.graphSize.height.toStringAsFixed(2),
      _topicMapEdgeSignature(widget.topicMap.edges),
    ].join('//');
    if (_modelCacheKey == cacheKey && _model != null) {
      return _model!;
    }

    _modelCacheKey = cacheKey;
    _model = _TopicGraphModel.fromTopicMap(
      topicMap: widget.topicMap,
      selection: widget.selection,
      graphSize: widget.graphSize,
    );

    return _model!;
  }
}

class _TopicMapEdgesPainter extends CustomPainter {
  const _TopicMapEdgesPainter({required this.edges, required this.bubblesById});

  final List<_TopicGraphEdge> edges;
  final Map<String, _TopicGraphBubble> bubblesById;

  @override
  void paint(Canvas canvas, Size size) {
    for (final edge in edges) {
      final source = bubblesById[edge.sourceNodeId];
      final target = bubblesById[edge.targetNodeId];
      if (source == null || target == null) {
        continue;
      }
      final path = _curvedTopicEdgePath(
        edge: edge,
        sourceCenter: source.center,
        targetCenter: target.center,
        sourceRadius: source.radius,
        targetRadius: target.radius,
      );
      final alpha = _topicEdgeAlpha(edge);

      if (edge.kind == ReaderSummaryTopicMapVisualLinkKind.semantic) {
        canvas.drawPath(
          path,
          Paint()
            ..color = edge.color.withValues(alpha: alpha * 0.42)
            ..strokeWidth = edge.strokeWidth + 1.4
            ..style = PaintingStyle.stroke
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round,
        );
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = edge.color.withValues(alpha: alpha)
          ..strokeWidth = edge.strokeWidth
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _TopicMapEdgesPainter oldDelegate) =>
      oldDelegate.edges != edges || oldDelegate.bubblesById != bubblesById;
}

Path _curvedTopicEdgePath({
  required _TopicGraphEdge edge,
  required Offset sourceCenter,
  required Offset targetCenter,
  required double sourceRadius,
  required double targetRadius,
}) {
  final delta = targetCenter - sourceCenter;
  final distance = math.max(1.0, delta.distance);
  final direction = delta / distance;
  final start = sourceCenter + direction * sourceRadius;
  final end = targetCenter - direction * targetRadius;
  final visibleDelta = end - start;
  final visibleDistance = math.max(1.0, visibleDelta.distance);
  final midpoint = Offset((start.dx + end.dx) / 2, (start.dy + end.dy) / 2);
  final normal = Offset(-direction.dy, direction.dx);
  final minimumBend = edge.kind == ReaderSummaryTopicMapVisualLinkKind.semantic
      ? 14.0
      : 8.0;
  final bend =
      math.min(64.0, math.max(minimumBend, visibleDistance * 0.22)) *
      _edgeCurveSign(edge);
  final control = midpoint + normal * bend;

  return Path()
    ..moveTo(start.dx, start.dy)
    ..quadraticBezierTo(control.dx, control.dy, end.dx, end.dy);
}

double _edgeCurveSign(_TopicGraphEdge edge) {
  final seed = '${edge.sourceNodeId}|${edge.targetNodeId}'.codeUnits.fold<int>(
    0,
    (sum, value) => sum + value,
  );

  return seed.isEven ? 1 : -1;
}

double _topicEdgeAlpha(_TopicGraphEdge edge) {
  if (edge.kind == ReaderSummaryTopicMapVisualLinkKind.groupMembership) {
    return 0.16;
  }

  return math.min(0.42, 0.28 + edge.strokeWidth * 0.04);
}

class _TopicMapBubbleNode extends StatelessWidget {
  const _TopicMapBubbleNode({
    required this.bubble,
    required this.textColor,
    required this.borderColor,
  });

  final _TopicGraphBubble bubble;
  final Color textColor;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    final color = _topicColor(bubble.group.colorKey);
    final labelColor = _labelColor(color);
    final diameter = bubble.radius * 2;
    final padding = _topicMapLabelPolicy.padding(bubble.radius);
    final maxLines = _topicMapLabelPolicy.maxLines(bubble.radius);
    final label = _visibleTopicMapBubbleLabel(
      bubble: bubble,
      labelColor: labelColor,
      textColor: textColor,
      padding: padding,
      maxLines: maxLines,
    );

    return Tooltip(
      key: ValueKey('topic-map-bubble-${bubble.node.id}'),
      message: _topicMapBubbleTooltip(bubble),
      waitDuration: const Duration(milliseconds: 350),
      child: SizedBox.square(
        dimension: diameter,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: color.withValues(alpha: bubble.isPrimary ? 0.92 : 0.84),
            shape: BoxShape.circle,
            border: Border.all(
              color: borderColor.withValues(alpha: 0.34),
              width: bubble.isPrimary ? 1.4 : 1,
            ),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.18),
                blurRadius: bubble.isPrimary ? 12 : 7,
                spreadRadius: bubble.isPrimary ? 1 : 0,
              ),
            ],
          ),
          child: Center(
            child: Padding(
              padding: padding,
              child: label == null
                  ? const SizedBox.shrink()
                  : FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        key: ValueKey(
                          'topic-map-bubble-label-${bubble.node.id}',
                        ),
                        label.text,
                        maxLines: maxLines,
                        softWrap: false,
                        overflow: TextOverflow.visible,
                        textAlign: TextAlign.center,
                        style: label.style,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

_VisibleTopicMapLabel? _visibleTopicMapBubbleLabel({
  required _TopicGraphBubble bubble,
  required Color labelColor,
  required Color textColor,
  required EdgeInsets padding,
  required int maxLines,
}) => _visibleTopicMapLabel(
  label: _topicMapDisplayLabel(bubble.node),
  radius: bubble.radius,
  labelColor: labelColor,
  textColor: textColor,
  padding: padding,
  maxLines: maxLines,
);

_VisibleTopicMapLabel? _visibleTopicMapLabel({
  required String label,
  required double radius,
  required Color labelColor,
  required Color textColor,
  required EdgeInsets padding,
  required int maxLines,
}) {
  final candidates = _topicMapLabelPolicy.candidates(label, radius);
  if (candidates.isEmpty) {
    return null;
  }
  final candidate = _topicMapLabelPolicy.selectCandidate(candidates, radius);
  final displayText = _topicMapLabelPolicy.breakAtWordBoundaries(
    candidate,
    maxLines,
  );

  return _VisibleTopicMapLabel(
    text: displayText,
    style: _topicMapBubbleLabelStyle(
      labelColor: labelColor,
      textColor: textColor,
      fontSize: _topicMapLabelPolicy.fontSize(candidate, radius),
    ),
  );
}

TextStyle _topicMapBubbleLabelStyle({
  required Color labelColor,
  required Color textColor,
  required double fontSize,
}) => TextStyle(
  color: labelColor,
  fontSize: fontSize,
  fontWeight: FontWeight.w800,
  height: 1.04,
  letterSpacing: 0,
  shadows: [Shadow(color: textColor.withValues(alpha: 0.22), blurRadius: 2)],
);

final class _VisibleTopicMapLabel {
  const _VisibleTopicMapLabel({required this.text, required this.style});

  final String text;
  final TextStyle style;
}

String _topicMapBubbleTooltip(_TopicGraphBubble bubble) {
  final providers = bubble.node.providerKeys.isEmpty
      ? 'none'
      : bubble.node.providerKeys.join(', ');

  return [
    _topicMapDisplayLabel(bubble.node),
    'Popularity: ${bubble.node.popularityScore.toStringAsFixed(1)}',
    'Posts: ${bubble.node.evidenceCount}',
    'Sources: $providers',
    'Group: ${bubble.groupDisplayLabel}',
  ].join('\n');
}
