part of 'reader_summary_brief_surface.dart';

Widget _topicMapFlutterGraphVertexPanel(
  flutter_graph_view.Vertex<dynamic> vertex,
) {
  final data = vertex.data;
  if (data is! _TopicMapFlutterGraphVertex) {
    return const SizedBox.shrink();
  }

  final global = vertex.g?.options?.localToGlobal(vertex.position);
  if (global == null) {
    return const SizedBox.shrink();
  }

  return Positioned(
    left: global.x + data.radius + 6,
    top: math.max(4, global.y - 28),
    child: DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs,
        ),
        child: Text(
          _topicMapFlutterGraphTooltip(data),
          maxLines: 6,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            height: 1.12,
            letterSpacing: 0,
          ),
        ),
      ),
    ),
  );
}

String _topicMapFlutterGraphTooltip(_TopicMapFlutterGraphVertex vertex) {
  final providers = vertex.node.providerKeys.isEmpty
      ? 'none'
      : vertex.node.providerKeys.join(', ');

  return [
    _topicMapDisplayLabel(vertex.node),
    'Popularity: ${vertex.node.popularityScore.toStringAsFixed(1)}',
    'Posts: ${vertex.node.evidenceCount}',
    'Sources: $providers',
    'Group: ${vertex.groupDisplayLabel}',
  ].join('\n');
}

final class _TopicMapFlutterGraphNodeShape
    extends flutter_graph_view.VertexShape {
  _TopicMapFlutterGraphNodeShape({
    required this.textColor,
    required this.borderColor,
  });

  final Color textColor;
  final Color borderColor;

  @override
  void render(
    flutter_graph_view.Vertex<dynamic> vertex,
    Canvas canvas,
    Paint paint,
    List<Paint> paintLayers,
  ) {
    final data = vertex.data;
    if (data is! _TopicMapFlutterGraphVertex) {
      return;
    }

    final radius = _radiusZoom(vertex, data);
    final color = data.color;
    final labelColor = _labelColor(color);

    canvas
      ..drawCircle(
        Offset.zero,
        radius + (data.isPrimary ? 3 : 1.5),
        Paint()
          ..color = color.withValues(alpha: data.isPrimary ? 0.18 : 0.13)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
      )
      ..drawCircle(
        Offset.zero,
        radius,
        Paint()..color = color.withValues(alpha: data.isPrimary ? 0.92 : 0.84),
      )
      ..drawCircle(
        Offset.zero,
        radius,
        Paint()
          ..color = borderColor.withValues(alpha: data.isPrimary ? 0.36 : 0.24)
          ..style = PaintingStyle.stroke
          ..strokeWidth = data.isPrimary ? 1.5 : 1,
      );

    final padding = _topicMapLabelPolicy.padding(radius);
    final maxLines = _topicMapLabelPolicy.maxLines(radius);
    final label = _visibleTopicMapLabel(
      label: _topicMapDisplayLabel(data.node),
      radius: radius,
      labelColor: labelColor,
      textColor: textColor,
      padding: padding,
      maxLines: maxLines,
    );
    if (label == null || vertex.zoom <= 0.24) {
      return;
    }

    final painter = TextPainter(
      text: TextSpan(text: label.text, style: label.style),
      maxLines: maxLines,
      textAlign: TextAlign.center,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: math.max(1, radius * 2 - padding.horizontal));
    painter.paint(canvas, Offset(-painter.width / 2, -painter.height / 2));
    painter.dispose();
  }

  @override
  double width(flutter_graph_view.Vertex<dynamic> vertex) =>
      _radiusZoom(vertex, vertex.data) * 2;

  @override
  double height(flutter_graph_view.Vertex<dynamic> vertex) =>
      _radiusZoom(vertex, vertex.data) * 2;

  @override
  Paint getPaint(flutter_graph_view.Vertex<dynamic> vertex) {
    final data = vertex.data;
    final color = data is _TopicMapFlutterGraphVertex
        ? data.color
        : AppColors.chartBlue;

    return Paint()..color = color;
  }

  @override
  bool hoverTest(flutter_graph_view.Vertex<dynamic> vertex) {
    final graph = vertex.g;
    final data = vertex.data;
    if (graph == null || data is! _TopicMapFlutterGraphVertex) {
      return false;
    }

    final center = graph.options!.localToGlobal(vertex.position);
    final pointer = graph.options!.pointer;

    return (center - pointer).length <= data.radius;
  }

  double _radiusZoom(flutter_graph_view.Vertex<dynamic> vertex, Object? data) {
    final radius = data is _TopicMapFlutterGraphVertex
        ? data.radius
        : vertex.radius;

    return radius / vertex.zoom;
  }
}

final class _TopicMapFlutterGraphEdgeShape
    extends flutter_graph_view.EdgeLineShape {
  @override
  Paint getPaint(flutter_graph_view.Edge edge) {
    final data = edge.data;
    final strokeWidth = data is _TopicMapFlutterGraphEdge
        ? data.strokeWidth
        : 1.0;
    final color = data is _TopicMapFlutterGraphEdge
        ? data.color
        : AppColors.border.withValues(alpha: 0.16);

    return Paint()
      ..color = color.withValues(alpha: isWeaken(edge) ? 0.08 : color.a)
      ..strokeWidth =
          (edge.isHovered ? strokeWidth + 1.1 : strokeWidth) / edge.zoom
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
  }

  @override
  double height(flutter_graph_view.Edge edge) {
    final data = edge.data;
    return data is _TopicMapFlutterGraphEdge ? data.strokeWidth + 1.2 : 3;
  }
}
