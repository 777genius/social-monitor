part of 'reader_summary_brief_surface.dart';

const _topicMapDesktopNodeLimit = 44;
const _topicMapCompactNodeLimit = 30;
const _topicMapMaxEdges = 96;

final class _TopicGraphModel {
  const _TopicGraphModel({
    required this.bubbles,
    required this.bubblesById,
    required this.edges,
    required this.signature,
  });

  final List<_TopicGraphBubble> bubbles;
  final Map<String, _TopicGraphBubble> bubblesById;
  final List<_TopicGraphEdge> edges;
  final String signature;

  static _TopicGraphModel fromTopicMap({
    required ReaderSummaryTopicMap topicMap,
    required _TopicMapVisibleSelection selection,
    required Size graphSize,
  }) {
    final visibleNodes = selection.nodes.toList();
    final graph = graphview.Graph();
    final graphNodesById = <String, graphview.Node>{};
    final groups = selection.groups;
    final groupsById = {for (final group in groups) group.id: group};
    final bubblesById = <String, _TopicGraphBubble>{};
    final nodesByGroupId = _nodesByGroup(visibleNodes, groups);
    final groupIdByNodeId = {
      for (final entry in nodesByGroupId.entries)
        for (final node in entry.value) node.id: entry.key,
    };
    final radiiByNodeId = _topicMapSizingPolicy.radiiByNodeId(
      nodes: visibleNodes,
      graphSize: graphSize,
    );
    final groupCenters = _groupSeedCenters(nodesByGroupId.length, graphSize);
    final groupCentersById = <String, Offset>{};

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
      groupCentersById[entry.key] = groupCenter;

      for (var index = 0; index < nodes.length; index++) {
        final node = nodes[index];
        final radius = radiiByNodeId[node.id] ?? 10.0;
        final graphNode = graphview.Node.Id(node.id)
          ..size = Size(radius * 2, radius * 2)
          ..position = groupIndex == 0 && index == 0
              ? Offset.zero
              : _seedTopLeft(
                  center:
                      groupCenter + _groupNodeSeedOffset(index, nodes.length),
                  radius: radius,
                  graphSize: graphSize,
                );
        graph.addNode(graphNode);
        graphNodesById[node.id] = graphNode;
        bubblesById[node.id] = _TopicGraphBubble(
          node: node,
          group: group,
          groupDisplayLabel: _topicMapLegendLabel(topicMap, group),
          radius: radius,
          center: groupCenter + _groupNodeSeedOffset(index, nodes.length),
          isPrimary: radius >= (graphSize.width < 420 ? 24 : 30),
        );
      }
    }

    final edgePairs = <String>{};
    final graphEdges = <_TopicGraphEdge>[];
    for (final edge in topicMap.edges.take(_topicMapMaxEdges)) {
      final source = graphNodesById[edge.sourceNodeId];
      final target = graphNodesById[edge.targetNodeId];
      if (source == null || target == null) {
        continue;
      }
      final sourceGroupId = groupIdByNodeId[edge.sourceNodeId];
      final targetGroupId = groupIdByNodeId[edge.targetNodeId];
      if (sourceGroupId == null ||
          targetGroupId == null ||
          sourceGroupId != targetGroupId ||
          sourceGroupId == _topicMapNeutralGroupId) {
        continue;
      }
      final pairKey = _edgePairKey(edge.sourceNodeId, edge.targetNodeId);
      if (!edgePairs.add(pairKey)) {
        continue;
      }
      final groupColor = _topicColor(
        groupsById[sourceGroupId]?.colorKey ?? 'blue',
      );
      final edgeAlpha = 0.12 + edge.weight * 0.20;
      graphEdges.add(
        _TopicGraphEdge(
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          color: groupColor,
          strokeWidth: 0.8 + edge.weight * 2.1,
        ),
      );
      graph.addEdge(
        source,
        target,
        paint: Paint()
          ..color = groupColor.withValues(alpha: edgeAlpha)
          ..strokeWidth = 0.8 + edge.weight * 2.1
          ..style = PaintingStyle.stroke,
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
      final anchor = graphNodesById[groupNodes.first.id];
      if (anchor == null) {
        continue;
      }
      for (final node in groupNodes.skip(1)) {
        final target = graphNodesById[node.id];
        if (target == null) {
          continue;
        }
        final pairKey = _edgePairKey(groupNodes.first.id, node.id);
        if (!edgePairs.add(pairKey)) {
          continue;
        }
        graph.addEdge(
          anchor,
          target,
          paint: Paint()
            ..color = Colors.transparent
            ..strokeWidth = 0
            ..style = PaintingStyle.stroke,
        );
      }
    }

    final configuration = graphview.FruchtermanReingoldConfiguration(
      iterations: visibleNodes.length > 34 ? 950 : 720,
      repulsionRate: 0.31,
      attractionRate: 0.14,
      repulsionPercentage: 0.72,
      attractionPercentage: 0.24,
      clusterPadding: 8,
      shuffleNodes: false,
    );
    final algorithm = graphview.FruchtermanReingoldAlgorithm(
      configuration,
      renderer: graphview.ArrowEdgeRenderer(noArrow: true),
    );
    if (graph.nodes.length > 1) {
      algorithm.run(graph, 0, 0);
    }
    final positionedBubbles = _positionedBubbles(
      bubblesById: bubblesById,
      graphNodesById: graphNodesById,
      groupCentersById: groupCentersById,
      graphSize: graphSize,
    );
    final positionedById = {
      for (final bubble in positionedBubbles) bubble.node.id: bubble,
    };

    return _TopicGraphModel(
      bubbles: positionedBubbles,
      bubblesById: positionedById,
      edges: graphEdges,
      signature:
          '${selection.signature}//${_topicMapEdgeSignature(topicMap.edges)}',
    );
  }
}

final class _TopicGraphBubble {
  const _TopicGraphBubble({
    required this.node,
    required this.group,
    required this.groupDisplayLabel,
    required this.radius,
    required this.center,
    required this.isPrimary,
  });

  final ReaderSummaryTopicMapNode node;
  final ReaderSummaryTopicMapGroup group;
  final String groupDisplayLabel;
  final double radius;
  final Offset center;
  final bool isPrimary;

  _TopicGraphBubble copyWithCenter(Offset value) => _TopicGraphBubble(
    node: node,
    group: group,
    groupDisplayLabel: groupDisplayLabel,
    radius: radius,
    center: value,
    isPrimary: isPrimary,
  );
}

final class _TopicGraphEdge {
  const _TopicGraphEdge({
    required this.sourceNodeId,
    required this.targetNodeId,
    required this.color,
    required this.strokeWidth,
  });

  final String sourceNodeId;
  final String targetNodeId;
  final Color color;
  final double strokeWidth;
}
