part of 'reader_summary_brief_surface.dart';

final class _TopicMapVisibleSelection {
  const _TopicMapVisibleSelection({required this.nodes, required this.groups});

  final List<ReaderSummaryTopicMapNode> nodes;
  final List<ReaderSummaryTopicMapGroup> groups;

  factory _TopicMapVisibleSelection.fromTopicMap({
    required ReaderSummaryTopicMap topicMap,
    required Size graphSize,
  }) {
    final nodes = topicMap.nodes
        .take(_topicMapVisibleNodeLimit(graphSize))
        .toList(growable: false);

    return _TopicMapVisibleSelection(
      nodes: nodes,
      groups: _visibleGroups(topicMap, nodes),
    );
  }

  String get signature {
    final nodePart = nodes
        .map(
          (node) => [
            node.id,
            node.groupId,
            node.label,
            node.popularityScore,
            node.sizeWeight,
            node.evidenceCount,
            node.providerKeys.join(','),
            node.keywords.join(','),
          ].join(':'),
        )
        .join('|');
    final groupPart = groups
        .map(
          (group) => [
            group.id,
            group.label,
            group.colorKey,
            group.nodeIds.join(','),
          ].join(':'),
        )
        .join('|');

    return '$nodePart//$groupPart';
  }
}

int _topicMapVisibleNodeLimit(Size graphSize) =>
    graphSize.width < _topicMapCompactWidthBreakpoint
    ? _topicMapCompactNodeLimit
    : _topicMapDesktopNodeLimit;
