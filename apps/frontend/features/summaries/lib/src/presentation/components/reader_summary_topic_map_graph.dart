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
      mutedColor: mutedColor,
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
      final sourceColor = _topicColor(source.group.colorKey);
      final targetColor = _topicColor(target.group.colorKey);
      final alpha = _topicEdgeAlpha(edge, source, target);
      final bounds = path.getBounds().inflate(2);

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
            ..color = sourceColor.withValues(alpha: alpha)
            ..shader = source.group.id == target.group.id
                ? null
                : LinearGradient(
                    colors: [
                      sourceColor.withValues(alpha: alpha),
                      targetColor.withValues(alpha: alpha),
                    ],
                  ).createShader(bounds)
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
    final label = _compactTopicLabel(bubble.node.label);
    final fontSize = _topicBubbleFontSize(label, bubble.radius);

    return Tooltip(
      message:
          '$label · ${bubble.node.popularityScore.round()} score · ${bubble.node.evidenceCount} posts',
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
              padding: EdgeInsets.all(math.max(2.0, bubble.radius * 0.13)),
              child: bubble.showLabel
                  ? Text(
                      label,
                      maxLines: bubble.radius >= 20 ? 2 : 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: labelColor,
                        fontSize: fontSize,
                        fontWeight: FontWeight.w800,
                        height: 1.04,
                        letterSpacing: 0,
                        shadows: [
                          Shadow(
                            color: textColor.withValues(alpha: 0.22),
                            blurRadius: 2,
                          ),
                        ],
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
          ),
        ),
      ),
    );
  }
}

double _topicBubbleFontSize(String label, double radius) {
  final lengthFactor = switch (label.length) {
    > 22 => 0.76,
    > 16 => 0.86,
    _ => 1.0,
  };
  final radiusFactor = switch (radius) {
    < 12 => 0.46,
    < 17 => 0.40,
    < 23 => 0.34,
    _ => 1 / 3.75,
  };

  return (radius * radiusFactor * lengthFactor).clamp(4.6, 12.5).toDouble();
}
