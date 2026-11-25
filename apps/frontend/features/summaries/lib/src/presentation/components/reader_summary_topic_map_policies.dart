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
    final scale = _areaScale(radii.values, graphSize, nodes.length);
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
    final densityRadius = math.sqrt(areaPerNode / math.pi) * 1.36;
    final compact = graphSize.width < _topicMapCompactWidthBreakpoint;
    final maxRadius = densityRadius
        .clamp(compact ? 30.0 : 35.0, compact ? 48.0 : 70.0)
        .toDouble();
    final minRadius = math.max(compact ? 10.5 : 12.0, maxRadius * 0.32);
    final normalizedArea = _backendPopularityArea(node);
    final radiusSquared =
        minRadius * minRadius +
        normalizedArea * (maxRadius * maxRadius - minRadius * minRadius);

    return math.sqrt(radiusSquared);
  }

  double _areaScale(
    Iterable<double> radii,
    Size graphSize,
    int visibleNodeCount,
  ) {
    final totalBubbleArea = radii.fold<double>(
      0,
      (sum, radius) => sum + math.pi * radius * radius,
    );
    final graphArea = graphSize.width * graphSize.height;
    final compact = graphSize.width < _topicMapCompactWidthBreakpoint;
    final dense = visibleNodeCount >= 24;
    final targetCoverage = dense ? (compact ? 0.58 : 0.62) : 0.68;
    final maxBubbleArea = graphArea * targetCoverage;
    if (totalBubbleArea <= maxBubbleArea || totalBubbleArea <= 0) {
      return 1;
    }

    return math.sqrt(maxBubbleArea / totalBubbleArea);
  }

  double _backendPopularityArea(ReaderSummaryTopicMapNode node) {
    final sizeWeight = node.sizeWeight.clamp(0.0, 1.0).toDouble();
    if (sizeWeight > 0) {
      return math.pow(sizeWeight, 2).clamp(0.0, 1.0).toDouble();
    }

    return (node.popularityScore / 100).clamp(0.0, 1.0).toDouble();
  }
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

    final words = normalized
        .split(' ')
        .where((word) => word.trim().isNotEmpty)
        .toList(growable: false);
    final candidates = <String>[normalized];
    for (final wordCount in [4, 3, 2, 1]) {
      if (words.length < wordCount) {
        continue;
      }
      final phrase = words.take(wordCount).join(' ');
      if (phrase.length < normalized.length) {
        candidates.add(phrase);
      }
    }

    return candidates.toSet().toList(growable: false);
  }

  String selectCandidate(List<String> candidates, double radius) {
    final maxCharacters = switch (radius) {
      < 14 => 8,
      < 18 => 12,
      < 24 => 16,
      < 34 => 26,
      _ => 32,
    };

    final selected = candidates.firstWhere(
      (candidate) => candidate.runes.length <= maxCharacters,
      orElse: () => candidates.last,
    );

    return _ellipsize(selected, maxCharacters);
  }

  String breakAtWordBoundaries(String label, int maxLines) {
    final words = label.split(RegExp(r'\s+')).where((word) => word.isNotEmpty);
    final values = words.toList(growable: false);
    if (maxLines < 2 || values.length < 2) {
      return label;
    }

    var bestSplit = 1;
    var bestDifference = 1 << 30;
    for (var split = 1; split < values.length; split++) {
      final firstLength = values.take(split).join(' ').length;
      final secondLength = values.skip(split).join(' ').length;
      final difference = (firstLength - secondLength).abs();
      if (difference < bestDifference) {
        bestDifference = difference;
        bestSplit = split;
      }
    }

    return '${values.take(bestSplit).join(' ')}\n'
        '${values.skip(bestSplit).join(' ')}';
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

    return (radius * radiusFactor * lengthFactor).clamp(8.2, 15.8).toDouble();
  }

  String _ellipsize(String value, int maxCharacters) {
    final codePoints = value.runes.toList(growable: false);
    if (codePoints.length <= maxCharacters) {
      return value;
    }

    return '${String.fromCharCodes(codePoints.take(maxCharacters - 1))}…';
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
