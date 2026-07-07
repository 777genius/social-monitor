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
    final weights = _visualWeightsByNodeId(nodes);
    final radii = {
      for (final node in nodes)
        node.id: radius(
          node: node,
          graphSize: graphSize,
          visibleNodeCount: nodes.length,
          visualWeight: weights[node.id],
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
    double? visualWeight,
  }) {
    final areaPerNode =
        (graphSize.width * graphSize.height) / math.max(1, visibleNodeCount);
    final densityRadius = math.sqrt(areaPerNode / math.pi) * 1.36;
    final compact = graphSize.width < _topicMapCompactWidthBreakpoint;
    final maxRadius = densityRadius
        .clamp(compact ? 30.0 : 35.0, compact ? 48.0 : 70.0)
        .toDouble();
    final minRadius = math.max(compact ? 10.5 : 12.0, maxRadius * 0.32);
    final weight = visualWeight ?? _backendPopularityWeight(node);

    return minRadius + math.pow(weight, 1.52) * (maxRadius - minRadius);
  }

  double _areaScale(Iterable<double> radii, Size graphSize) {
    final totalBubbleArea = radii.fold<double>(
      0,
      (sum, radius) => sum + math.pi * radius * radius,
    );
    final graphArea = graphSize.width * graphSize.height;
    final compact = graphSize.width < _topicMapCompactWidthBreakpoint;
    final targetCoverage = compact ? 0.62 : 0.68;
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

  Map<String, double> _visualWeightsByNodeId(
    List<ReaderSummaryTopicMapNode> nodes,
  ) {
    if (nodes.isEmpty) {
      return const {};
    }

    final ranked =
        [
          for (var index = 0; index < nodes.length; index++)
            _TopicMapRankedWeight(
              nodeId: nodes[index].id,
              backendWeight: _backendPopularityWeight(nodes[index]),
              index: index,
            ),
        ]..sort((left, right) {
          final byWeight = right.backendWeight.compareTo(left.backendWeight);
          if (byWeight != 0) {
            return byWeight;
          }

          return left.index.compareTo(right.index);
        });

    final backendWeights = ranked.map((item) => item.backendWeight);
    final minWeight = backendWeights.reduce(math.min);
    final maxWeight = backendWeights.reduce(math.max);
    final spread = maxWeight - minWeight;
    final backendShare = switch (spread) {
      >= 0.24 => 0.62,
      >= 0.12 => 0.48,
      >= 0.06 => 0.36,
      _ => 0.26,
    };
    final maxRank = math.max(1, ranked.length - 1);

    return {
      for (var rank = 0; rank < ranked.length; rank++)
        ranked[rank].nodeId: _visualWeight(
          backendWeight: ranked[rank].backendWeight,
          rank: rank,
          maxRank: maxRank,
          backendShare: backendShare,
        ),
    };
  }

  double _visualWeight({
    required double backendWeight,
    required int rank,
    required int maxRank,
    required double backendShare,
  }) {
    final rankRatio = rank / maxRank;
    final rankWeight = (1 - math.pow(rankRatio, 0.72) * 0.82)
        .clamp(0.18, 1.0)
        .toDouble();

    return (backendWeight * backendShare + rankWeight * (1 - backendShare))
        .clamp(0.16, 1.0)
        .toDouble();
  }
}

final class _TopicMapRankedWeight {
  const _TopicMapRankedWeight({
    required this.nodeId,
    required this.backendWeight,
    required this.index,
  });

  final String nodeId;
  final double backendWeight;
  final int index;
}

final class _TopicMapLabelPolicy {
  const _TopicMapLabelPolicy();

  EdgeInsets padding(double radius) =>
      EdgeInsets.all(math.max(2.0, radius * 0.11));

  int maxLines(double radius) => radius >= 18 ? 2 : 1;

  List<String> candidates(String label, double radius) {
    final normalized = label.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (normalized.isEmpty) {
      return const [];
    }
    if (normalized.length <= 22 || radius < 18) {
      return [normalized];
    }

    final words = normalized
        .split(' ')
        .where((word) => word.trim().isNotEmpty)
        .toList(growable: false);
    final candidates = <String>[normalized];
    for (final wordCount in [4, 3, 2]) {
      if (words.length < wordCount) {
        continue;
      }
      final phrase = words.take(wordCount).join(' ');
      if (phrase.length >= 8 && phrase.length < normalized.length) {
        candidates.add(phrase);
      }
    }

    return candidates.toSet().toList(growable: false);
  }

  double fontSize(String label, double radius) {
    final lengthFactor = switch (label.length) {
      > 30 => 0.80,
      > 22 => 0.88,
      > 16 => 0.94,
      _ => 1.0,
    };
    final radiusFactor = switch (radius) {
      < 14 => 0.42,
      < 18 => 0.46,
      < 24 => 0.44,
      < 34 => 0.40,
      _ => 0.37,
    };

    return (radius * radiusFactor * lengthFactor).clamp(6.2, 15.8).toDouble();
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
        ? 0.64
        : 0.58;

    return Offset.lerp(center, groupCenter, gravity) ?? center;
  }
}
