import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_map.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

void main() {
  testWidgets('dense multi-group topic map has no overlapping bubbles', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SizedBox(
            width: 480,
            child: ReaderSummaryTopicMapPanel(
              topicMap: _denseMultiGroupTopicMap(),
              renderer: ReaderSummaryTopicMapRenderer.graphView,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final bubbles = find.byWidgetPredicate(
      (widget) =>
          widget.key is ValueKey<String> &&
          ((widget.key! as ValueKey<String>).value).startsWith(
            'topic-map-bubble-topic:',
          ),
    );
    expect(bubbles, findsNWidgets(30));
    expect(find.text('OpenAI'), findsOneWidget);
    expect(find.text('Skills'), findsOneWidget);

    final elements = bubbles.evaluate().toList(growable: false);
    for (var left = 0; left < elements.length; left++) {
      final leftFinder = find.byElementPredicate(
        (element) => identical(element, elements[left]),
      );
      for (var right = left + 1; right < elements.length; right++) {
        final rightFinder = find.byElementPredicate(
          (element) => identical(element, elements[right]),
        );
        final centerDistance =
            (tester.getCenter(leftFinder) - tester.getCenter(rightFinder))
                .distance;
        final requiredDistance =
            tester.getSize(leftFinder).width / 2 +
            tester.getSize(rightFinder).width / 2;

        expect(
          centerDistance + 0.25,
          greaterThanOrEqualTo(requiredDistance),
          reason: 'bubble pair $left/$right overlaps',
        );
      }
    }

    for (var groupIndex = 0; groupIndex < 5; groupIndex++) {
      _expectSpatiallyConnected(tester, [
        for (var index = groupIndex; index < 30; index += 5)
          'topic:dense-$index',
      ]);
    }
  });
}

void _expectSpatiallyConnected(WidgetTester tester, List<String> nodeIds) {
  const maximumSurfaceGap = 18.0;
  final centers = <String, Offset>{};
  final radii = <String, double>{};
  for (final nodeId in nodeIds) {
    final bubble = find.byKey(ValueKey('topic-map-bubble-$nodeId'));
    centers[nodeId] = tester.getCenter(bubble);
    radii[nodeId] = tester.getSize(bubble).width / 2;
  }

  final connected = <String>{nodeIds.first};
  var changed = true;
  while (changed) {
    changed = false;
    for (final candidate in nodeIds.where((id) => !connected.contains(id))) {
      final touchesCluster = connected.any((member) {
        final centerDistance =
            (centers[candidate]! - centers[member]!).distance;
        final surfaceGap = centerDistance - radii[candidate]! - radii[member]!;

        return surfaceGap <= maximumSurfaceGap;
      });
      if (touchesCluster) {
        connected.add(candidate);
        changed = true;
      }
    }
  }

  expect(
    connected,
    containsAll(nodeIds),
    reason: 'same-color group is split across the graph: $nodeIds',
  );
}

ReaderSummaryTopicMap _denseMultiGroupTopicMap() {
  const confidence = ReaderSummaryTopicMapConfidence(
    level: 'high',
    score: 0.9,
    rationale: 'Dense real-day-shaped collision fixture.',
  );
  const groupNames = ['claude', 'openai', 'skills', 'codex', 'anthropic'];
  final nodes = <ReaderSummaryTopicMapNode>[];
  for (var index = 0; index < 30; index++) {
    final group = groupNames[index % groupNames.length];
    final popularity = math.max(18, 100 - index * 2.8).toDouble();
    nodes.add(
      ReaderSummaryTopicMapNode(
        id: 'topic:dense-$index',
        label: 'Dense Topic $index',
        groupId: 'group:$group',
        storyClusterIds: ['story:dense-$index'],
        popularityScore: popularity,
        sizeWeight: math.max(0.42, popularity / 100),
        evidenceCount: math.max(1, 6 - index ~/ 6),
        providerKeys: const ['rss'],
        interestIds: const ['ai'],
        citationIds: ['citation:dense-$index'],
        keywords: ['Dense Topic $index'],
        rationale: 'Dense collision fixture.',
      ),
    );
  }

  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: confidence,
    nodes: nodes,
    groups: [
      for (var groupIndex = 0; groupIndex < groupNames.length; groupIndex++)
        ReaderSummaryTopicMapGroup(
          id: 'group:${groupNames[groupIndex]}',
          label: groupNames[groupIndex],
          colorKey: ['blue', 'green', 'slate', 'amber', 'pink'][groupIndex],
          nodeIds: [
            for (var index = groupIndex; index < 30; index += groupNames.length)
              'topic:dense-$index',
          ],
          confidence: confidence,
        ),
    ],
    edges: [
      for (var index = groupNames.length; index < 30; index++)
        ReaderSummaryTopicMapEdge(
          sourceNodeId: 'topic:dense-${index % groupNames.length}',
          targetNodeId: 'topic:dense-$index',
          weight: 0.8,
          reason: 'Same semantic topic group.',
        ),
    ],
    warnings: const [],
  );
}
