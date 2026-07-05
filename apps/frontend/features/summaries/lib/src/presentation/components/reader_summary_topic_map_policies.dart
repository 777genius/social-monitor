part of 'reader_summary_brief_surface.dart';

const _topicMapCompactWidthBreakpoint = 420.0;
const _topicMapSizingPolicy = _TopicMapSizingPolicy();
const _topicMapLabelPolicy = _TopicMapLabelPolicy();
const _topicMapGroupGravityPolicy = _TopicMapGroupGravityPolicy();

final class _TopicMapSizingPolicy {
  const _TopicMapSizingPolicy();

  Map<String, double> radiiByNodeId({
    required List<ReaderSummaryTopicMapNode> nodes,
    required Size graphSize,
  }) {
    final radii = {
      for (final node in nodes)
        node.id: radius(
          node: node,
          graphSize: graphSize,
          visibleNodeCount: nodes.length,
        ),
    };
    final scale = _areaScale(radii.values, graphSize);
    if (scale >= 0.995) {
      return radii;
    }

    return {
      for (final entry in radii.entries)
        entry.key: math.max(8.5, entry.value * scale),
    };
  }

  double radius({
    required ReaderSummaryTopicMapNode node,
    required Size graphSize,
    required int visibleNodeCount,
  }) {
    final areaPerNode =
        (graphSize.width * graphSize.height) / math.max(1, visibleNodeCount);
    final densityRadius = math.sqrt(areaPerNode / math.pi) * 1.22;
    final compact = graphSize.width < _topicMapCompactWidthBreakpoint;
    final maxRadius = densityRadius
        .clamp(compact ? 28.0 : 32.0, compact ? 44.0 : 62.0)
        .toDouble();
    final minRadius = math.max(compact ? 9.0 : 10.5, maxRadius * 0.28);
    final weight = _backendPopularityWeight(node);

    return minRadius + math.pow(weight, 1.52) * (maxRadius - minRadius);
  }

  double _areaScale(Iterable<double> radii, Size graphSize) {
    final totalBubbleArea = radii.fold<double>(
      0,
      (sum, radius) => sum + math.pi * radius * radius,
    );
    final graphArea = graphSize.width * graphSize.height;
    final compact = graphSize.width < _topicMapCompactWidthBreakpoint;
    final targetCoverage = compact ? 0.48 : 0.54;
    final maxBubbleArea = graphArea * targetCoverage;
    if (totalBubbleArea <= maxBubbleArea || totalBubbleArea <= 0) {
      return 1;
    }

    return math.sqrt(maxBubbleArea / totalBubbleArea);
  }

  double _backendPopularityWeight(ReaderSummaryTopicMapNode node) {
    final popularityWeight = (node.popularityScore / 100)
        .clamp(0.0, 1.0)
        .toDouble();
    if (popularityWeight > 0) {
      return popularityWeight;
    }

    final sizeWeight = node.sizeWeight.clamp(0.0, 1.0).toDouble();
    return math.pow(sizeWeight, 2).clamp(0.0, 1.0).toDouble();
  }
}

final class _TopicMapLabelPolicy {
  const _TopicMapLabelPolicy();

  EdgeInsets padding(double radius) =>
      EdgeInsets.all(math.max(2.0, radius * 0.13));

  int maxLines(double radius) => radius >= 20 ? 2 : 1;

  double fontSize(String label, double radius) {
    final lengthFactor = switch (label.length) {
      > 30 => 0.80,
      > 22 => 0.88,
      > 16 => 0.94,
      _ => 1.0,
    };
    final radiusFactor = switch (radius) {
      < 14 => 0.38,
      < 18 => 0.42,
      < 24 => 0.40,
      < 34 => 0.36,
      _ => 0.34,
    };

    return (radius * radiusFactor * lengthFactor).clamp(5.2, 13.8).toDouble();
  }

  bool fits({
    required String label,
    required TextStyle style,
    required double radius,
    required EdgeInsets padding,
    required int maxLines,
  }) {
    final maxWidth = math.max(1.0, radius * 2 - padding.horizontal);
    final maxHeight = math.max(1.0, radius * 2 - padding.vertical);
    final painter = TextPainter(
      text: TextSpan(text: label, style: style),
      maxLines: maxLines,
      textAlign: TextAlign.center,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: maxWidth);

    final result =
        !painter.didExceedMaxLines &&
        painter.width <= maxWidth &&
        painter.height <= maxHeight;
    painter.dispose();

    return result;
  }
}

final class _TopicMapGroupGravityPolicy {
  const _TopicMapGroupGravityPolicy();

  Offset apply({
    required Offset center,
    required Offset? groupCenter,
    required Size graphSize,
  }) {
    if (groupCenter == null) {
      return center;
    }

    final gravity = graphSize.width < _topicMapCompactWidthBreakpoint
        ? 0.56
        : 0.48;

    return Offset.lerp(center, groupCenter, gravity) ?? center;
  }
}
