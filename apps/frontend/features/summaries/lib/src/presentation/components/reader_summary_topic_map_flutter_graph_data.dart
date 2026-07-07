part of 'reader_summary_brief_surface.dart';

final class _TopicMapFlutterGraphData {
  const _TopicMapFlutterGraphData({
    required this.vertices,
    required this.edges,
    required this.signature,
  });

  final List<_TopicMapFlutterGraphVertex> vertices;
  final List<_TopicMapFlutterGraphEdge> edges;
  final String signature;

  static _TopicMapFlutterGraphData fromTopicMap({
    required ReaderSummaryTopicMap topicMap,
    required Size graphSize,
  }) {
    final nodeLimit = graphSize.width < _topicMapCompactWidthBreakpoint
        ? _topicMapCompactNodeLimit
        : _topicMapDesktopNodeLimit;
    final visibleNodes = topicMap.nodes.take(nodeLimit).toList();
    final groups = _visibleGroups(topicMap, visibleNodes);
    final groupsById = {for (final group in groups) group.id: group};
    final nodesByGroupId = _nodesByGroup(visibleNodes, groups);
    final radiiByNodeId = _topicMapSizingPolicy.radiiByNodeId(
      nodes: visibleNodes,
      graphSize: graphSize,
    );
    final groupCenters = _groupSeedCenters(nodesByGroupId.length, graphSize);
    final vertices = <_TopicMapFlutterGraphVertex>[];

    for (var groupIndex = 0; groupIndex < nodesByGroupId.length; groupIndex++) {
      final entry = nodesByGroupId.entries.elementAt(groupIndex);
      final group = groupsById[entry.key] ?? groups.first;
      final nodes = entry.value
        ..sort(
          (left, right) => (radiiByNodeId[right.id] ?? 0).compareTo(
            radiiByNodeId[left.id] ?? 0,
          ),
        );
      final groupCenter = groupCenters[groupIndex % groupCenters.length];
      final color = _topicColor(group.colorKey);

      for (var index = 0; index < nodes.length; index++) {
        final node = nodes[index];
        final radius = radiiByNodeId[node.id] ?? 10.0;
        final center = _clampBubbleCenter(
          groupCenter + _groupNodeSeedOffset(index, nodes.length),
          radius,
          graphSize,
        );
        vertices.add(
          _TopicMapFlutterGraphVertex(
            node: node,
            group: group,
            color: color,
            radius: radius,
            center: center,
            isPrimary: radius >= (graphSize.width < 420 ? 24 : 30),
          ),
        );
      }
    }

    final visibleNodeIds = vertices.map((vertex) => vertex.node.id).toSet();
    final edges = _flutterGraphEdges(
      topicMap: topicMap,
      nodesByGroupId: nodesByGroupId,
      groupsById: groupsById,
      visibleNodeIds: visibleNodeIds,
    );

    return _TopicMapFlutterGraphData(
      vertices: vertices,
      edges: edges,
      signature: _topicMapGraphSignature(visibleNodes, topicMap.edges),
    );
  }
}

List<_TopicMapFlutterGraphEdge> _flutterGraphEdges({
  required ReaderSummaryTopicMap topicMap,
  required Map<String, List<ReaderSummaryTopicMapNode>> nodesByGroupId,
  required Map<String, ReaderSummaryTopicMapGroup> groupsById,
  required Set<String> visibleNodeIds,
}) {
  final edgePairs = <String>{};
  final result = <_TopicMapFlutterGraphEdge>[];
  var ranking = 0;
  final groupIdByNodeId = {
    for (final entry in nodesByGroupId.entries)
      for (final node in entry.value) node.id: entry.key,
  };

  void addEdge({
    required String sourceNodeId,
    required String targetNodeId,
    required Color color,
    required double strokeWidth,
  }) {
    if (!visibleNodeIds.contains(sourceNodeId) ||
        !visibleNodeIds.contains(targetNodeId)) {
      return;
    }
    final pairKey = _edgePairKey(sourceNodeId, targetNodeId);
    if (!edgePairs.add(pairKey)) {
      return;
    }
    result.add(
      _TopicMapFlutterGraphEdge(
        sourceNodeId: sourceNodeId,
        targetNodeId: targetNodeId,
        color: color,
        strokeWidth: strokeWidth,
        ranking: ranking++,
      ),
    );
  }

  for (final edge in topicMap.edges.take(_topicMapMaxEdges)) {
    final sourceGroupId = groupIdByNodeId[edge.sourceNodeId];
    final targetGroupId = groupIdByNodeId[edge.targetNodeId];
    if (sourceGroupId == null ||
        targetGroupId == null ||
        sourceGroupId != targetGroupId ||
        sourceGroupId == _topicMapNeutralGroupId) {
      continue;
    }
    final groupColor = _topicColor(
      groupsById[sourceGroupId]?.colorKey ?? 'blue',
    );
    addEdge(
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      color: groupColor.withValues(alpha: 0.12 + edge.weight * 0.20),
      strokeWidth: 0.8 + edge.weight * 2.1,
    );
  }

  for (final entry in nodesByGroupId.entries) {
    if (entry.key == _topicMapNeutralGroupId) {
      continue;
    }
    final groupNodes = entry.value;
    if (groupNodes.length < 2) {
      continue;
    }
    final groupColor = _topicColor(groupsById[entry.key]?.colorKey ?? 'blue');
    for (final node in groupNodes.skip(1)) {
      addEdge(
        sourceNodeId: groupNodes.first.id,
        targetNodeId: node.id,
        color: groupColor.withValues(alpha: 0.16),
        strokeWidth: 1.05,
      );
    }
  }

  return result;
}

final class _TopicMapFlutterGraphVertex {
  const _TopicMapFlutterGraphVertex({
    required this.node,
    required this.group,
    required this.color,
    required this.radius,
    required this.center,
    required this.isPrimary,
  });

  final ReaderSummaryTopicMapNode node;
  final ReaderSummaryTopicMapGroup group;
  final Color color;
  final double radius;
  final Offset center;
  final bool isPrimary;
}

final class _TopicMapFlutterGraphEdge {
  const _TopicMapFlutterGraphEdge({
    required this.sourceNodeId,
    required this.targetNodeId,
    required this.color,
    required this.strokeWidth,
    required this.ranking,
  });

  final String sourceNodeId;
  final String targetNodeId;
  final Color color;
  final double strokeWidth;
  final int ranking;
}

final class _TopicMapFlutterGraphConvertor
    extends
        flutter_graph_view.DataConvertor<
          _TopicMapFlutterGraphVertex,
          _TopicMapFlutterGraphEdge
        > {
  @override
  flutter_graph_view.Vertex<String> convertVertex(
    _TopicMapFlutterGraphVertex value,
    flutter_graph_view.Graph<dynamic> graph,
  ) {
    return flutter_graph_view.Vertex<String>()
      ..id = value.node.id
      ..tag = value.group.id
      ..tags = [value.group.id]
      ..data = value
      ..solid = true
      ..radius = value.radius
      ..radiusScale = 1
      ..position = flutter_graph_view.Vector2(value.center.dx, value.center.dy);
  }

  @override
  flutter_graph_view.Edge convertEdge(
    _TopicMapFlutterGraphEdge value,
    flutter_graph_view.Graph<dynamic> graph,
  ) {
    return flutter_graph_view.Edge()
      ..ranking = value.ranking
      ..edgeName = 'topic'
      ..solid = true
      ..data = value
      ..start = graph.keyCache[value.sourceNodeId]!
      ..end = graph.keyCache[value.targetNodeId];
  }

  @override
  flutter_graph_view.Graph<dynamic> convertGraph(
    dynamic data, {
    flutter_graph_view.Graph<dynamic>? graph,
  }) {
    final result = graph ?? flutter_graph_view.Graph<String>();
    if (data is! _TopicMapFlutterGraphData) {
      return result;
    }

    result.data = data;
    for (final vertex in data.vertices) {
      addVertex(vertex, result);
    }
    for (final edge in data.edges) {
      addEdge(edge, result);
    }

    return result;
  }
}
