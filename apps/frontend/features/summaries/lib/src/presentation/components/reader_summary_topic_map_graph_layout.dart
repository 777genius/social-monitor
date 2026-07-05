part of 'reader_summary_brief_surface.dart';

const _topicMapNamedColorLimit = 8;

List<ReaderSummaryTopicMapGroup> _visibleGroups(
  ReaderSummaryTopicMap topicMap,
  List<ReaderSummaryTopicMapNode> visibleNodes,
) {
  if (topicMap.groups.isNotEmpty) {
    return _groupsWithVisibleColorKeys(topicMap.groups);
  }

  return _groupsWithVisibleColorKeys([
    ReaderSummaryTopicMapGroup(
      id: 'all',
      label: 'Topics',
      colorKey: 'blue',
      nodeIds: visibleNodes.map((node) => node.id).toList(),
      confidence: topicMap.confidence,
    ),
  ]);
}

List<ReaderSummaryTopicMapGroup> _topicMapLegendGroups(
  ReaderSummaryTopicMap topicMap,
) => _visibleGroups(topicMap, topicMap.nodes);

List<ReaderSummaryTopicMapGroup> _groupsWithVisibleColorKeys(
  List<ReaderSummaryTopicMapGroup> groups,
) {
  if (groups.length <= _topicMapNamedColorLimit) {
    return groups;
  }

  return [
    for (var index = 0; index < groups.length; index++)
      _topicGroupWithColorKey(
        groups[index],
        '$_topicGeneratedColorPrefix$index:${groups[index].id}',
      ),
  ];
}

ReaderSummaryTopicMapGroup _topicGroupWithColorKey(
  ReaderSummaryTopicMapGroup group,
  String colorKey,
) {
  return ReaderSummaryTopicMapGroup(
    id: group.id,
    label: group.label,
    colorKey: colorKey,
    nodeIds: group.nodeIds,
    confidence: group.confidence,
  );
}

Map<String, List<ReaderSummaryTopicMapNode>> _nodesByGroup(
  List<ReaderSummaryTopicMapNode> nodes,
  List<ReaderSummaryTopicMapGroup> groups,
) {
  final groupIds = groups.map((group) => group.id).toSet();
  final fallbackGroupId = groups.first.id;
  final byGroup = <String, List<ReaderSummaryTopicMapNode>>{};

  for (final node in nodes) {
    final groupId = groupIds.contains(node.groupId)
        ? node.groupId
        : fallbackGroupId;
    byGroup.putIfAbsent(groupId, () => []).add(node);
  }

  return byGroup;
}

List<Offset> _groupSeedCenters(int count, Size graphSize) {
  if (count <= 1) {
    return [Offset(graphSize.width * 0.5, graphSize.height * 0.52)];
  }
  if (count == 2) {
    return [
      Offset(graphSize.width * 0.34, graphSize.height * 0.52),
      Offset(graphSize.width * 0.66, graphSize.height * 0.52),
    ];
  }

  final center = Offset(graphSize.width * 0.5, graphSize.height * 0.53);
  final xRadius = graphSize.width * 0.40;
  final yRadius = graphSize.height * 0.35;

  return List.generate(count, (index) {
    final angle = -math.pi / 2 + (math.pi * 2 * index / count);

    return Offset(
      center.dx + math.cos(angle) * xRadius,
      center.dy + math.sin(angle) * yRadius,
    );
  });
}

Offset _groupNodeSeedOffset(int index, int count) {
  if (index == 0) {
    return Offset.zero;
  }

  final ring = 1 + ((index - 1) ~/ 7);
  final ringIndex = (index - 1) % 7;
  final angle = -math.pi / 2 + (math.pi * 2 * ringIndex / math.min(7, count));
  final distance = 48.0 + ring * 24.0 + (index.isEven ? 8 : 0);

  return Offset(math.cos(angle) * distance, math.sin(angle) * distance);
}

Offset _seedTopLeft({
  required Offset center,
  required double radius,
  required Size graphSize,
}) {
  final clamped = Offset(
    center.dx.clamp(radius + 8, graphSize.width - radius - 8).toDouble(),
    center.dy.clamp(radius + 8, graphSize.height - radius - 8).toDouble(),
  );

  return clamped - Offset(radius, radius);
}

double _topicBubbleRadius(
  ReaderSummaryTopicMapNode node,
  Size graphSize,
  List<ReaderSummaryTopicMapNode> visibleNodes,
) {
  final visibleNodeCount = visibleNodes.length;
  final areaPerNode =
      (graphSize.width * graphSize.height) / math.max(1, visibleNodeCount);
  final densityRadius = math.sqrt(areaPerNode / math.pi) * 1.22;
  final compact = graphSize.width < 420;
  final maxRadius = densityRadius
      .clamp(compact ? 28.0 : 32.0, compact ? 44.0 : 62.0)
      .toDouble();
  final minRadius = math.max(compact ? 9.0 : 10.5, maxRadius * 0.28);
  final weight = _topicBubbleImportance(node, visibleNodes);

  return minRadius + math.pow(weight, 1.52) * (maxRadius - minRadius);
}

double _topicBubbleImportance(
  ReaderSummaryTopicMapNode node,
  List<ReaderSummaryTopicMapNode> visibleNodes,
) {
  if (visibleNodes.length <= 1) {
    return 1;
  }

  final scores = visibleNodes.map((item) => item.popularityScore).toList();
  final minScore = scores.reduce(math.min);
  final maxScore = scores.reduce(math.max);
  final scoreRange = maxScore - minScore;
  final scoreWeight = scoreRange <= 0.001
      ? node.sizeWeight.clamp(0.0, 1.0).toDouble()
      : ((node.popularityScore - minScore) / scoreRange).clamp(0.0, 1.0);
  final rank = visibleNodes.indexWhere((item) => item.id == node.id);
  final rankWeight = rank < 0
      ? scoreWeight
      : (1 - rank / math.max(1, visibleNodes.length - 1)).clamp(0.0, 1.0);
  final sizeWeight = node.sizeWeight.clamp(0.0, 1.0).toDouble();

  return (scoreWeight * 0.58 + rankWeight * 0.30 + sizeWeight * 0.12)
      .clamp(0.0, 1.0)
      .toDouble();
}

List<_TopicGraphBubble> _positionedBubbles({
  required Map<String, _TopicGraphBubble> bubblesById,
  required Map<String, graphview.Node> graphNodesById,
  required Map<String, Offset> groupCentersById,
  required Size graphSize,
}) {
  final graphBounds = _graphNodeBounds(graphNodesById.values);
  if (graphBounds == null) {
    return bubblesById.values.toList(growable: false);
  }

  final padding = graphSize.width < 420 ? 7.0 : 10.0;
  final availableWidth = math.max(1.0, graphSize.width - padding * 2);
  final availableHeight = math.max(1.0, graphSize.height - padding * 2);
  final scale = math.min(
    availableWidth / math.max(1.0, graphBounds.width),
    availableHeight / math.max(1.0, graphBounds.height),
  );
  final xOffset = padding + (availableWidth - graphBounds.width * scale) / 2;
  final yOffset = padding + (availableHeight - graphBounds.height * scale) / 2;
  final positioned = <_TopicGraphBubble>[];

  for (final entry in bubblesById.entries) {
    final graphNode = graphNodesById[entry.key];
    if (graphNode == null) {
      continue;
    }
    final bubble = entry.value;
    final graphCenter =
        graphNode.position + Offset(graphNode.width / 2, graphNode.height / 2);
    final center = Offset(
      xOffset + (graphCenter.dx - graphBounds.left) * scale,
      yOffset + (graphCenter.dy - graphBounds.top) * scale,
    );
    final groupedCenter = _centerWithGroupGravity(
      center: center,
      groupCenter: groupCentersById[bubble.group.id],
      graphSize: graphSize,
    );
    positioned.add(
      bubble.copyWithCenter(
        _clampBubbleCenter(groupedCenter, bubble.radius, graphSize),
      ),
    );
  }

  final resolved = _resolveBubbleCollisions(positioned, graphSize);

  return _fitBubbleLayout(resolved, graphSize);
}

Offset _centerWithGroupGravity({
  required Offset center,
  required Offset? groupCenter,
  required Size graphSize,
}) {
  if (groupCenter == null) {
    return center;
  }

  final gravity = graphSize.width < 420 ? 0.48 : 0.40;

  return Offset.lerp(center, groupCenter, gravity) ?? center;
}

List<_TopicGraphBubble> _fitBubbleLayout(
  List<_TopicGraphBubble> bubbles,
  Size graphSize,
) {
  final bounds = _bubbleBounds(bubbles);
  if (bounds == null) {
    return bubbles;
  }

  final padding = graphSize.width < 420 ? 5.0 : 8.0;
  final targetWidth = math.max(1.0, graphSize.width - padding * 2);
  final targetHeight = math.max(1.0, graphSize.height - padding * 2);
  final scale = math
      .min(
        targetWidth / math.max(1.0, bounds.width),
        targetHeight / math.max(1.0, bounds.height),
      )
      .clamp(1.0, 1.18)
      .toDouble();

  if (scale <= 1.02) {
    return bubbles;
  }

  final graphCenter = Offset(graphSize.width / 2, graphSize.height / 2);
  final expanded = [
    for (final bubble in bubbles)
      bubble.copyWithCenter(
        _clampBubbleCenter(
          graphCenter + (bubble.center - bounds.center) * scale,
          bubble.radius,
          graphSize,
        ),
      ),
  ];

  return _resolveBubbleCollisions(expanded, graphSize);
}

Rect? _bubbleBounds(List<_TopicGraphBubble> bubbles) {
  Rect? result;
  for (final bubble in bubbles) {
    final rect = Rect.fromCircle(center: bubble.center, radius: bubble.radius);
    result = result == null ? rect : result.expandToInclude(rect);
  }

  return result;
}

Rect? _graphNodeBounds(Iterable<graphview.Node> nodes) {
  Rect? result;
  for (final node in nodes) {
    final rect = Rect.fromLTWH(
      node.position.dx,
      node.position.dy,
      node.width,
      node.height,
    );
    result = result == null ? rect : result.expandToInclude(rect);
  }

  return result;
}

List<_TopicGraphBubble> _resolveBubbleCollisions(
  List<_TopicGraphBubble> bubbles,
  Size graphSize,
) {
  final centers = bubbles.map((bubble) => bubble.center).toList();
  for (var pass = 0; pass < 14; pass++) {
    for (var left = 0; left < bubbles.length; left++) {
      for (var right = left + 1; right < bubbles.length; right++) {
        final delta = centers[right] - centers[left];
        final distance = math.max(1.0, delta.distance);
        final overlap =
            bubbles[left].radius + bubbles[right].radius + 3 - distance;
        if (overlap <= 0) {
          continue;
        }
        final shift = delta / distance * (overlap / 2);
        centers[left] = _clampBubbleCenter(
          centers[left] - shift,
          bubbles[left].radius,
          graphSize,
        );
        centers[right] = _clampBubbleCenter(
          centers[right] + shift,
          bubbles[right].radius,
          graphSize,
        );
      }
    }
  }

  return [
    for (var index = 0; index < bubbles.length; index++)
      bubbles[index].copyWithCenter(centers[index]),
  ];
}

Offset _clampBubbleCenter(Offset center, double radius, Size graphSize) {
  return Offset(
    center.dx.clamp(radius + 6, graphSize.width - radius - 6).toDouble(),
    center.dy.clamp(radius + 6, graphSize.height - radius - 6).toDouble(),
  );
}

String _edgePairKey(String sourceNodeId, String targetNodeId) {
  final ordered = [sourceNodeId, targetNodeId]..sort();

  return '${ordered[0]} -> ${ordered[1]}';
}

String _topicMapGraphSignature(
  List<ReaderSummaryTopicMapNode> nodes,
  List<ReaderSummaryTopicMapEdge> edges,
) {
  final nodePart = nodes
      .map((node) => '${node.id}:${node.groupId}:${node.sizeWeight}')
      .join('|');
  final edgePart = edges
      .take(_topicMapMaxEdges)
      .map((edge) => '${edge.sourceNodeId}:${edge.targetNodeId}:${edge.weight}')
      .join('|');

  return '$nodePart//$edgePart';
}
