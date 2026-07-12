import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_map.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

void main() {
  const policy = ReaderSummaryTopicMapVisualLinkPolicy();

  test('creates a sparse visible tree when a semantic group has no edges', () {
    final fixture = _fixture(groupedNodeCount: 4);

    final links = policy.build(
      topicMap: fixture.topicMap,
      nodesByGroupId: fixture.nodesByGroupId,
    );

    expect(links, hasLength(3));
    expect(
      links.map((link) => link.kind),
      everyElement(ReaderSummaryTopicMapVisualLinkKind.groupMembership),
    );
    expect(links.map((link) => link.sourceNodeId).toSet(), {'topic:group-0'});
  });

  test('keeps semantic links and only bridges disconnected components', () {
    final fixture = _fixture(
      groupedNodeCount: 4,
      semanticPairs: const [(0, 1), (2, 3)],
    );

    final links = policy.build(
      topicMap: fixture.topicMap,
      nodesByGroupId: fixture.nodesByGroupId,
    );

    expect(links, hasLength(3));
    expect(
      links.where(
        (link) => link.kind == ReaderSummaryTopicMapVisualLinkKind.semantic,
      ),
      hasLength(2),
    );
    expect(
      links.where(
        (link) =>
            link.kind == ReaderSummaryTopicMapVisualLinkKind.groupMembership,
      ),
      hasLength(1),
    );
  });

  test('does not add fallback links to a semantically connected group', () {
    final fixture = _fixture(
      groupedNodeCount: 3,
      semanticPairs: const [(0, 1), (1, 2)],
    );

    final links = policy.build(
      topicMap: fixture.topicMap,
      nodesByGroupId: fixture.nodesByGroupId,
    );

    expect(links, hasLength(2));
    expect(
      links.map((link) => link.kind),
      everyElement(ReaderSummaryTopicMapVisualLinkKind.semantic),
    );
  });

  test('never connects neutral nodes or preserves cross-group edges', () {
    final fixture = _fixture(
      groupedNodeCount: 2,
      neutralNodeCount: 2,
      semanticPairs: const [(0, 2)],
    );

    final links = policy.build(
      topicMap: fixture.topicMap,
      nodesByGroupId: fixture.nodesByGroupId,
    );

    expect(links, hasLength(1));
    expect(
      links.single.kind,
      ReaderSummaryTopicMapVisualLinkKind.groupMembership,
    );
    expect(links.single.sourceNodeId, 'topic:group-0');
    expect(links.single.targetNodeId, 'topic:group-1');
  });
}

_TopicMapEdgeFixture _fixture({
  required int groupedNodeCount,
  int neutralNodeCount = 0,
  List<(int, int)> semanticPairs = const [],
}) {
  final groupedNodes = [
    for (var index = 0; index < groupedNodeCount; index++)
      _node('group-$index', 'group:semantic'),
  ];
  final neutralNodes = [
    for (var index = 0; index < neutralNodeCount; index++)
      _node('neutral-$index', 'topic-map:neutral'),
  ];
  final nodes = [...groupedNodes, ...neutralNodes];
  final edges = [
    for (final (source, target) in semanticPairs)
      ReaderSummaryTopicMapEdge(
        sourceNodeId: nodes[source].id,
        targetNodeId: nodes[target].id,
        weight: 0.8,
        reason: 'Synthetic semantic relation.',
      ),
  ];

  return _TopicMapEdgeFixture(
    topicMap: ReaderSummaryTopicMap(
      generatedBy: 'agent-runtime',
      confidence: _confidence,
      nodes: nodes,
      groups: [
        ReaderSummaryTopicMapGroup(
          id: 'group:semantic',
          label: 'Semantic group',
          colorKey: 'blue',
          nodeIds: groupedNodes.map((node) => node.id).toList(),
          confidence: _confidence,
        ),
        if (neutralNodes.isNotEmpty)
          ReaderSummaryTopicMapGroup(
            id: 'topic-map:neutral',
            label: 'ungrouped',
            colorKey: 'neutral',
            nodeIds: neutralNodes.map((node) => node.id).toList(),
            confidence: _confidence,
          ),
      ],
      edges: edges,
      warnings: const [],
    ),
    nodesByGroupId: {
      'group:semantic': groupedNodes,
      if (neutralNodes.isNotEmpty) 'topic-map:neutral': neutralNodes,
    },
  );
}

ReaderSummaryTopicMapNode _node(String id, String groupId) =>
    ReaderSummaryTopicMapNode(
      id: 'topic:$id',
      label: id,
      groupId: groupId,
      storyClusterIds: ['story:$id'],
      popularityScore: 50,
      sizeWeight: 0.5,
      evidenceCount: 1,
      providerKeys: const ['rss'],
      interestIds: const ['ai'],
      citationIds: ['citation:$id'],
      keywords: [id],
      rationale: 'Synthetic visual link fixture.',
    );

const _confidence = ReaderSummaryTopicMapConfidence(
  level: 'high',
  score: 0.9,
  rationale: 'Synthetic edge policy confidence.',
);

final class _TopicMapEdgeFixture {
  const _TopicMapEdgeFixture({
    required this.topicMap,
    required this.nodesByGroupId,
  });

  final ReaderSummaryTopicMap topicMap;
  final Map<String, List<ReaderSummaryTopicMapNode>> nodesByGroupId;
}
