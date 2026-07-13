part of 'reader_summary_brief_surface.dart';

enum ReaderSummaryTopicMapVisualLinkKind { semantic, groupMembership }

final class ReaderSummaryTopicMapVisualLink {
  const ReaderSummaryTopicMapVisualLink({
    required this.sourceNodeId,
    required this.targetNodeId,
    required this.groupId,
    required this.kind,
    required this.weight,
  });

  final String sourceNodeId;
  final String targetNodeId;
  final String groupId;
  final ReaderSummaryTopicMapVisualLinkKind kind;
  final double weight;
}

final class ReaderSummaryTopicMapEdgeCurvePolicy {
  const ReaderSummaryTopicMapEdgeCurvePolicy();

  double bendFor({
    required ReaderSummaryTopicMapVisualLinkKind kind,
    required double visibleGap,
    required double sourceRadius,
    required double targetRadius,
  }) {
    final gap = math.max(0.0, visibleGap);
    final averageRadius = math.max(
      1.0,
      (sourceRadius.abs() + targetRadius.abs()) / 2,
    );
    final activationDistance = averageRadius * 1.6;
    final normalizedProximity = (gap / activationDistance)
        .clamp(0.0, 1.0)
        .toDouble();
    final smoothProximity =
        normalizedProximity *
        normalizedProximity *
        (3 - 2 * normalizedProximity);
    final bendRatio = switch (kind) {
      ReaderSummaryTopicMapVisualLinkKind.semantic => 0.18,
      ReaderSummaryTopicMapVisualLinkKind.groupMembership => 0.12,
    };
    final maximumBend = switch (kind) {
      ReaderSummaryTopicMapVisualLinkKind.semantic => 52.0,
      ReaderSummaryTopicMapVisualLinkKind.groupMembership => 36.0,
    };

    return math.min(maximumBend, gap * bendRatio * smoothProximity);
  }
}

final class ReaderSummaryTopicMapVisualLinkPolicy {
  const ReaderSummaryTopicMapVisualLinkPolicy();

  List<ReaderSummaryTopicMapVisualLink> build({
    required ReaderSummaryTopicMap topicMap,
    required Map<String, List<ReaderSummaryTopicMapNode>> nodesByGroupId,
  }) {
    final groupIdByNodeId = {
      for (final entry in nodesByGroupId.entries)
        for (final node in entry.value) node.id: entry.key,
    };
    final components = _TopicMapLinkComponents(groupIdByNodeId.keys);
    final pairKeys = <String>{};
    final links = <ReaderSummaryTopicMapVisualLink>[];

    for (final edge in topicMap.edges.take(_topicMapMaxEdges)) {
      final sourceGroupId = groupIdByNodeId[edge.sourceNodeId];
      final targetGroupId = groupIdByNodeId[edge.targetNodeId];
      if (sourceGroupId == null ||
          targetGroupId == null ||
          sourceGroupId != targetGroupId ||
          sourceGroupId == _topicMapNeutralGroupId ||
          edge.sourceNodeId == edge.targetNodeId) {
        continue;
      }
      final pairKey = _edgePairKey(edge.sourceNodeId, edge.targetNodeId);
      if (!pairKeys.add(pairKey)) {
        continue;
      }
      links.add(
        ReaderSummaryTopicMapVisualLink(
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          groupId: sourceGroupId,
          kind: ReaderSummaryTopicMapVisualLinkKind.semantic,
          weight: edge.weight.clamp(0.0, 1.0).toDouble(),
        ),
      );
      components.connect(edge.sourceNodeId, edge.targetNodeId);
    }

    for (final entry in nodesByGroupId.entries) {
      if (entry.key == _topicMapNeutralGroupId || entry.value.length < 2) {
        continue;
      }
      final anchorId = entry.value.first.id;
      for (final node in entry.value.skip(1)) {
        if (components.areConnected(anchorId, node.id)) {
          continue;
        }
        final pairKey = _edgePairKey(anchorId, node.id);
        if (!pairKeys.add(pairKey)) {
          components.connect(anchorId, node.id);
          continue;
        }
        links.add(
          ReaderSummaryTopicMapVisualLink(
            sourceNodeId: anchorId,
            targetNodeId: node.id,
            groupId: entry.key,
            kind: ReaderSummaryTopicMapVisualLinkKind.groupMembership,
            weight: 0,
          ),
        );
        components.connect(anchorId, node.id);
      }
    }

    return links;
  }
}

const _topicMapVisualLinkPolicy = ReaderSummaryTopicMapVisualLinkPolicy();
const _topicMapEdgeCurvePolicy = ReaderSummaryTopicMapEdgeCurvePolicy();

final class _TopicMapLinkComponents {
  _TopicMapLinkComponents(Iterable<String> nodeIds)
    : _parentByNodeId = {for (final nodeId in nodeIds) nodeId: nodeId};

  final Map<String, String> _parentByNodeId;

  bool areConnected(String left, String right) => _root(left) == _root(right);

  void connect(String left, String right) {
    final leftRoot = _root(left);
    final rightRoot = _root(right);
    if (leftRoot != rightRoot) {
      _parentByNodeId[rightRoot] = leftRoot;
    }
  }

  String _root(String nodeId) {
    final parent = _parentByNodeId[nodeId];
    if (parent == null || parent == nodeId) {
      return nodeId;
    }
    final root = _root(parent);
    _parentByNodeId[nodeId] = root;
    return root;
  }
}
