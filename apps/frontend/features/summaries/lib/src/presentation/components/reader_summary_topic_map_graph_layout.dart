part of 'reader_summary_brief_surface.dart';

const _topicMapNamedColorLimit = 8;
const _topicMapMaxColoredGroups = 5;
const _topicMapGroupedColorKeys = [
  'orange',
  'green',
  'violet',
  'amber',
  'teal',
  'pink',
  'blue',
  'slate',
];

List<ReaderSummaryTopicMapGroup> _visibleGroups(
  ReaderSummaryTopicMap topicMap,
  List<ReaderSummaryTopicMapNode> visibleNodes,
) {
  if (topicMap.groups.isNotEmpty) {
    return _groupsWithVisibleColorKeys(topicMap.groups, visibleNodes);
  }

  return _groupsWithVisibleColorKeys([
    ReaderSummaryTopicMapGroup(
      id: 'all',
      label: 'Topics',
      colorKey: 'blue',
      nodeIds: visibleNodes.map((node) => node.id).toList(),
      confidence: topicMap.confidence,
    ),
  ], visibleNodes);
}

List<ReaderSummaryTopicMapGroup> _topicMapLegendGroups(
  ReaderSummaryTopicMap topicMap,
) => _visibleGroups(
  topicMap,
  topicMap.nodes.take(_topicMapDesktopNodeLimit).toList(growable: false),
);

List<ReaderSummaryTopicMapGroup> _groupsWithVisibleColorKeys(
  List<ReaderSummaryTopicMapGroup> groups,
  List<ReaderSummaryTopicMapNode> visibleNodes,
) {
  final visibleNodeIds = visibleNodes.map((node) => node.id).toSet();
  final visibleCountByGroupId = <String, int>{};
  final visibleNodesByGroupId = <String, List<ReaderSummaryTopicMapNode>>{};
  for (final node in visibleNodes) {
    visibleCountByGroupId.update(
      node.groupId,
      (value) => value + 1,
      ifAbsent: () => 1,
    );
    visibleNodesByGroupId.putIfAbsent(node.groupId, () => []).add(node);
  }

  final rankedGroups = groups
      .where(
        (group) =>
            (visibleCountByGroupId[group.id] ?? 0) > 0 &&
            !_isWeakTopicMapGroup(group),
      )
      .toList(growable: false);
  rankedGroups.sort((left, right) {
    final byCount = (visibleCountByGroupId[right.id] ?? 0).compareTo(
      visibleCountByGroupId[left.id] ?? 0,
    );
    if (byCount != 0) {
      return byCount;
    }

    return _topicGroupVisualScore(
      visibleNodesByGroupId[right.id] ?? const [],
    ).compareTo(
      _topicGroupVisualScore(visibleNodesByGroupId[left.id] ?? const []),
    );
  });

  final grouped = rankedGroups
      .take(_topicMapMaxColoredGroups)
      .toList(growable: false);
  final groupedIds = grouped.map((group) => group.id).toSet();
  final ungroupedNodeIds = [
    for (final node in visibleNodes)
      if (!groupedIds.contains(node.groupId)) node.id,
  ];
  final result = [
    for (var index = 0; index < grouped.length; index++)
      _topicGroupWithColorKey(
        grouped[index],
        grouped.length <= _topicMapNamedColorLimit
            ? grouped[index].colorKey
            : _topicMapGroupedColorKeys[index %
                  _topicMapGroupedColorKeys.length],
      ),
  ];

  if (ungroupedNodeIds.isNotEmpty) {
    result.add(
      ReaderSummaryTopicMapGroup(
        id: _topicMapNeutralGroupId,
        label: 'ungrouped',
        colorKey: _topicMapNeutralColorKey,
        nodeIds: ungroupedNodeIds
            .where(visibleNodeIds.contains)
            .toList(growable: false),
        confidence: const ReaderSummaryTopicMapConfidence(
          level: 'low',
          score: 0,
          rationale: 'Single-node topics are shown as neutral.',
        ),
      ),
    );
  }

  return result.isEmpty ? groups.take(1).toList(growable: false) : result;
}

double _topicGroupVisualScore(List<ReaderSummaryTopicMapNode> nodes) {
  return nodes.fold<double>(
    0,
    (sum, node) => sum + node.popularityScore + node.evidenceCount * 4,
  );
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
  final fallbackGroupId = groupIds.contains(_topicMapNeutralGroupId)
      ? _topicMapNeutralGroupId
      : groups.first.id;
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
  final xRadius = graphSize.width * 0.34;
  final yRadius = graphSize.height * 0.30;

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
  final distance = 38.0 + ring * 18.0 + (index.isEven ? 5 : 0);

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
    final groupedCenter = _topicMapGroupGravityPolicy.apply(
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
      .clamp(1.0, 1.30)
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
  for (var pass = 0; pass < 24; pass++) {
    for (var left = 0; left < bubbles.length; left++) {
      for (var right = left + 1; right < bubbles.length; right++) {
        final delta = centers[right] - centers[left];
        final distance = math.max(1.0, delta.distance);
        final overlap =
            bubbles[left].radius + bubbles[right].radius + 0.8 - distance;
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
