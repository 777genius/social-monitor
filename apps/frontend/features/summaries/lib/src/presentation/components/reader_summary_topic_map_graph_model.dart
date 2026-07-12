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

    final graphEdges = <_TopicGraphEdge>[];
    final visualLinks = _topicMapVisualLinkPolicy.build(
      topicMap: topicMap,
      nodesByGroupId: nodesByGroupId,
    );
    for (final link in visualLinks) {
      final source = graphNodesById[link.sourceNodeId];
      final target = graphNodesById[link.targetNodeId];
      if (source == null || target == null) {
        continue;
      }
      final groupColor = _topicColor(
        groupsById[link.groupId]?.colorKey ?? 'blue',
      );
      final semantic =
          link.kind == ReaderSummaryTopicMapVisualLinkKind.semantic;
      final strokeWidth = semantic ? 0.8 + link.weight * 2.1 : 0.9;
      final edgeAlpha = semantic ? 0.18 + link.weight * 0.22 : 0.12;
      graphEdges.add(
        _TopicGraphEdge(
          sourceNodeId: link.sourceNodeId,
          targetNodeId: link.targetNodeId,
          color: groupColor,
          strokeWidth: strokeWidth,
          kind: link.kind,
        ),
      );
      graph.addEdge(
        source,
        target,
        paint: Paint()
          ..color = groupColor.withValues(alpha: edgeAlpha)
          ..strokeWidth = strokeWidth
          ..style = PaintingStyle.stroke,
      );
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
    required this.kind,
  });

  final String sourceNodeId;
  final String targetNodeId;
  final Color color;
  final double strokeWidth;
  final ReaderSummaryTopicMapVisualLinkKind kind;
}
