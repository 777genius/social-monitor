part of 'reader_summary_brief_surface.dart';

class _TopicMapForceGraph extends StatelessWidget {
  const _TopicMapForceGraph({
    required this.topicMap,
    required this.graphSize,
    required this.textColor,
    required this.mutedColor,
    required this.borderColor,
  });

  final ReaderSummaryTopicMap topicMap;
  final Size graphSize;
  final Color textColor;
  final Color mutedColor;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    final model = _TopicGraphModel.fromTopicMap(
      topicMap: topicMap,
      graphSize: graphSize,
    );

    if (model.bubblesById.isEmpty) {
      return Center(
        child: Text(
          'No topic map data',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: mutedColor, letterSpacing: 0),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerLowest,
          border: Border.all(color: borderColor.withValues(alpha: 0.52)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Positioned.fill(
              child: CustomPaint(
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
                  textColor: textColor,
                  borderColor: borderColor,
                ),
              ),
          ],
        ),
      ),
    );
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
      );
      final alpha = _topicEdgeAlpha(edge, source, target);

      canvas
        ..drawPath(
          path,
          Paint()
            ..color = edge.color.withValues(alpha: alpha * 0.42)
            ..strokeWidth = edge.strokeWidth + 1.4
            ..style = PaintingStyle.stroke
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round,
        )
        ..drawPath(
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
}) {
  final delta = targetCenter - sourceCenter;
  final distance = math.max(1.0, delta.distance);
  final midpoint = Offset(
    (sourceCenter.dx + targetCenter.dx) / 2,
    (sourceCenter.dy + targetCenter.dy) / 2,
  );
  final normal = Offset(-delta.dy / distance, delta.dx / distance);
  final bend =
      math.min(76.0, math.max(18.0, distance * 0.22)) * _edgeCurveSign(edge);
  final control = midpoint + normal * bend;

  return Path()
    ..moveTo(sourceCenter.dx, sourceCenter.dy)
    ..quadraticBezierTo(
      control.dx,
      control.dy,
      targetCenter.dx,
      targetCenter.dy,
    );
}

double _edgeCurveSign(_TopicGraphEdge edge) {
  final seed = '${edge.sourceNodeId}|${edge.targetNodeId}'.codeUnits.fold<int>(
    0,
    (sum, value) => sum + value,
  );

  return seed.isEven ? 1 : -1;
}

double _topicEdgeAlpha(
  _TopicGraphEdge edge,
  _TopicGraphBubble source,
  _TopicGraphBubble target,
) {
  final sameGroup = source.group.id == target.group.id;
  final base = sameGroup ? 0.24 : 0.18;

  return math.min(0.34, base + edge.strokeWidth * 0.035);
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
                  : Text(
                      label.text,
                      maxLines: maxLines,
                      overflow: TextOverflow.clip,
                      textAlign: TextAlign.center,
                      style: label.style,
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
  for (final candidate in candidates) {
    final style = TextStyle(
      color: labelColor,
      fontSize: _topicMapLabelPolicy.fontSize(candidate, radius),
      fontWeight: FontWeight.w800,
      height: 1.04,
      letterSpacing: 0,
      shadows: [
        Shadow(color: textColor.withValues(alpha: 0.22), blurRadius: 2),
      ],
    );
    final fits = _topicMapLabelPolicy.fits(
      label: candidate,
      style: style,
      radius: radius,
      padding: padding,
      maxLines: maxLines,
    );
    if (fits) {
      return _VisibleTopicMapLabel(text: candidate, style: style);
    }
  }

  if (candidates.isEmpty) {
    return null;
  }
  final fallback = candidates.last;

  return _VisibleTopicMapLabel(
    text: fallback,
    style: TextStyle(
      color: labelColor,
      fontSize: math
          .max(6.0, _topicMapLabelPolicy.fontSize(fallback, radius) * 0.86)
          .toDouble(),
      fontWeight: FontWeight.w800,
      height: 1.04,
      letterSpacing: 0,
      shadows: [
        Shadow(color: textColor.withValues(alpha: 0.22), blurRadius: 2),
      ],
    ),
  );
}

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
    bubble.node.label,
    'Score: ${bubble.node.popularityScore.toStringAsFixed(1)}',
    'Weight: ${bubble.node.sizeWeight.toStringAsFixed(2)}',
    'Posts: ${bubble.node.evidenceCount}',
    'Providers: $providers',
    'Group: ${bubble.group.label}',
  ].join('\n');
}
