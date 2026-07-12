import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_map.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

void main() {
  testWidgets('keeps bubble sizes equal when backend topic weights are tied', (
    tester,
  ) async {
    final topicMap = _tiedTopicMap();

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SizedBox(
            width: 540,
            child: ReaderSummaryTopicMapPanel(
              topicMap: topicMap,
              renderer: ReaderSummaryTopicMapRenderer.graphView,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final firstDiameter = _bubbleDiameterForId(tester, 'topic:0');
    final lastDiameter = _bubbleDiameterForId(tester, 'topic:7');

    expect(firstDiameter, closeTo(lastDiameter, 0.01));
  });

  testWidgets('keeps flutter graph view renderer available as opt-in', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SizedBox(
            width: 540,
            child: ReaderSummaryTopicMapPanel(
              topicMap: _tiedTopicMap(),
              renderer: ReaderSummaryTopicMapRenderer.flutterGraphView,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(
      find.byKey(const ValueKey('topic-map-flutter-graph-view')),
      findsOne,
    );
  });

  testWidgets(
    'keeps strong singleton groups colored and neutralizes the tail',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SizedBox(
              width: 540,
              child: ReaderSummaryTopicMapPanel(
                topicMap: _mixedGroupedTopicMap(),
                renderer: ReaderSummaryTopicMapRenderer.graphView,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('clustered'), findsNothing);
      expect(find.text('Cluster A'), findsWidgets);
      expect(find.text('Loose 1'), findsWidgets);
      expect(find.text('Loose 2'), findsWidgets);
      expect(find.text('ungrouped'), findsOneWidget);
      expect(find.text('solo-g'), findsNothing);
    },
  );

  testWidgets('uses a strong keyword when a stored topic label is generic', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SizedBox(
            width: 540,
            child: ReaderSummaryTopicMapPanel(
              topicMap: _weakLabelTopicMap(),
              renderer: ReaderSummaryTopicMapRenderer.graphView,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Why'), findsNothing);
    expect(_bubbleLabelFor(tester, 'topic:why'), 'Claude Code');
    expect(find.text('show'), findsNothing);
    expect(find.text('ungrouped'), findsOneWidget);
  });

  testWidgets('does not surface headline connector words as bubbles', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SizedBox(
            width: 540,
            child: ReaderSummaryTopicMapPanel(
              topicMap: _connectorWordTopicMap(),
              renderer: ReaderSummaryTopicMapRenderer.graphView,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Your'), findsNothing);
    expect(find.text('OpenAI'), findsWidgets);
  });

  testWidgets('compacts headline-like stored topic labels before drawing', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SizedBox(
            width: 540,
            child: ReaderSummaryTopicMapPanel(
              topicMap: _headlineLikeLabelTopicMap(),
              renderer: ReaderSummaryTopicMapRenderer.graphView,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(
      find.text('The productivity stack many professionals rely on every'),
      findsNothing,
    );
    expect(find.text('Productivity Stack'), findsOneWidget);
    expect(_bubbleLabelFor(tester, 'topic:productivity'), 'Productivity Stack');
    expect(find.textContaining('DesktopCommanderMCP'), findsNothing);
    expect(
      _bubbleLabelFor(tester, 'topic:desktop-commander'),
      'Desktop Commander MCP',
    );
    final technicalBubble = tester.widget<Tooltip>(
      find.byKey(const ValueKey('topic-map-bubble-topic:desktop-commander')),
    );
    expect(technicalBubble.message, contains('Desktop Commander MCP Server'));
    final technicalLabel = tester.widget<Text>(
      find.byKey(
        const ValueKey('topic-map-bubble-label-topic:desktop-commander'),
      ),
    );
    expect(technicalLabel.style?.fontSize, greaterThanOrEqualTo(8.2));
    final longIdentifierLabel = _bubbleLabelFor(
      tester,
      'topic:long-identifier',
    );
    expect(longIdentifierLabel, endsWith('…'));
    expect(longIdentifierLabel!.runes.length, lessThanOrEqualTo(16));
  });
}

ReaderSummaryTopicMap _tiedTopicMap() {
  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: const ReaderSummaryTopicMapConfidence(
      level: 'high',
      score: 0.88,
      rationale: 'Synthetic tie-weight topic map.',
    ),
    nodes: [
      for (var index = 0; index < 8; index++)
        ReaderSummaryTopicMapNode(
          id: 'topic:$index',
          label: 'Topic ${index + 1}',
          groupId: 'group:tied',
          storyClusterIds: ['story:$index'],
          popularityScore: 100,
          sizeWeight: 1,
          evidenceCount: 1,
          providerKeys: const ['hacker-news'],
          interestIds: const ['ai'],
          citationIds: const ['bc-1'],
          keywords: ['topic-${index + 1}'],
          rationale: 'Tied backend weight.',
        ),
    ],
    groups: [
      ReaderSummaryTopicMapGroup(
        id: 'group:tied',
        label: 'Tied topics',
        colorKey: 'blue',
        nodeIds: [for (var index = 0; index < 8; index++) 'topic:$index'],
        confidence: const ReaderSummaryTopicMapConfidence(
          level: 'high',
          score: 0.88,
          rationale: 'Synthetic group.',
        ),
      ),
    ],
    edges: const [],
    warnings: const [],
  );
}

double _bubbleDiameterForId(WidgetTester tester, String nodeId) =>
    tester.getSize(find.byKey(ValueKey('topic-map-bubble-$nodeId'))).width;

String? _bubbleLabelFor(WidgetTester tester, String nodeId) => tester
    .widget<Text>(find.byKey(ValueKey('topic-map-bubble-label-$nodeId')))
    .data
    ?.replaceAll('\n', ' ');

ReaderSummaryTopicMap _mixedGroupedTopicMap() {
  const looseGroups = [
    'solo-a',
    'solo-b',
    'solo-c',
    'solo-d',
    'solo-e',
    'solo-f',
    'solo-g',
  ];

  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: const ReaderSummaryTopicMapConfidence(
      level: 'medium',
      score: 0.7,
      rationale: 'Synthetic grouped and singleton topic map.',
    ),
    nodes: [
      const ReaderSummaryTopicMapNode(
        id: 'topic:cluster-a',
        label: 'Cluster A',
        groupId: 'group:clustered',
        storyClusterIds: ['story:cluster-a'],
        popularityScore: 100,
        sizeWeight: 1,
        evidenceCount: 3,
        providerKeys: ['rss'],
        interestIds: ['ai'],
        citationIds: ['citation:cluster-a'],
        keywords: ['cluster'],
        rationale: 'Grouped topic.',
      ),
      const ReaderSummaryTopicMapNode(
        id: 'topic:cluster-b',
        label: 'Cluster B',
        groupId: 'group:clustered',
        storyClusterIds: ['story:cluster-b'],
        popularityScore: 80,
        sizeWeight: 0.8,
        evidenceCount: 2,
        providerKeys: ['rss'],
        interestIds: ['ai'],
        citationIds: ['citation:cluster-b'],
        keywords: ['cluster'],
        rationale: 'Grouped topic.',
      ),
      for (var index = 0; index < looseGroups.length; index++)
        ReaderSummaryTopicMapNode(
          id: 'topic:loose-$index',
          label: 'Loose ${index + 1}',
          groupId: 'group:${looseGroups[index]}',
          storyClusterIds: ['story:loose-$index'],
          popularityScore: 70 - index * 8,
          sizeWeight: 0.7 - index * 0.05,
          evidenceCount: 1,
          providerKeys: const ['hacker-news'],
          interestIds: const ['ai'],
          citationIds: ['citation:loose-$index'],
          keywords: const ['loose'],
          rationale: 'Singleton topic.',
        ),
    ],
    groups: [
      const ReaderSummaryTopicMapGroup(
        id: 'group:clustered',
        label: 'clustered',
        colorKey: 'orange',
        nodeIds: ['topic:cluster-a', 'topic:cluster-b'],
        confidence: ReaderSummaryTopicMapConfidence(
          level: 'high',
          score: 0.9,
          rationale: 'Real group.',
        ),
      ),
      for (var index = 0; index < looseGroups.length; index++)
        ReaderSummaryTopicMapGroup(
          id: 'group:${looseGroups[index]}',
          label: looseGroups[index],
          colorKey: index.isEven ? 'green' : 'pink',
          nodeIds: ['topic:loose-$index'],
          confidence: const ReaderSummaryTopicMapConfidence(
            level: 'low',
            score: 0.4,
            rationale: 'Singleton group.',
          ),
        ),
    ],
    edges: const [
      ReaderSummaryTopicMapEdge(
        sourceNodeId: 'topic:cluster-a',
        targetNodeId: 'topic:cluster-b',
        weight: 0.9,
        reason: 'Same story family.',
      ),
      ReaderSummaryTopicMapEdge(
        sourceNodeId: 'topic:cluster-a',
        targetNodeId: 'topic:loose-a',
        weight: 0.8,
        reason: 'Cross-group edge should not be rendered.',
      ),
    ],
    warnings: const [],
  );
}

ReaderSummaryTopicMap _weakLabelTopicMap() {
  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: const ReaderSummaryTopicMapConfidence(
      level: 'medium',
      score: 0.7,
      rationale: 'Synthetic weak-label topic map.',
    ),
    nodes: const [
      ReaderSummaryTopicMapNode(
        id: 'topic:why',
        label: 'Why',
        groupId: 'group:show',
        storyClusterIds: ['story:claude'],
        popularityScore: 100,
        sizeWeight: 1,
        evidenceCount: 2,
        providerKeys: ['hacker-news'],
        interestIds: ['ai'],
        citationIds: ['citation:claude'],
        keywords: ['claude-code', 'session-cache'],
        rationale: 'Stored weak label from an older artifact.',
      ),
    ],
    groups: const [
      ReaderSummaryTopicMapGroup(
        id: 'group:show',
        label: 'show',
        colorKey: 'green',
        nodeIds: ['topic:why'],
        confidence: ReaderSummaryTopicMapConfidence(
          level: 'medium',
          score: 0.7,
          rationale: 'Synthetic group.',
        ),
      ),
    ],
    edges: const [],
    warnings: const [],
  );
}

ReaderSummaryTopicMap _connectorWordTopicMap() {
  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: const ReaderSummaryTopicMapConfidence(
      level: 'medium',
      score: 0.7,
      rationale: 'Synthetic connector-word topic map.',
    ),
    nodes: const [
      ReaderSummaryTopicMapNode(
        id: 'topic:openai',
        label: 'Your Go To Prompt',
        groupId: 'group:openai',
        storyClusterIds: ['story:openai'],
        popularityScore: 100,
        sizeWeight: 1,
        evidenceCount: 2,
        providerKeys: ['rss'],
        interestIds: ['ai'],
        citationIds: ['citation:openai'],
        keywords: ['openai'],
        rationale: 'Stored headline connector label from an older artifact.',
      ),
    ],
    groups: const [
      ReaderSummaryTopicMapGroup(
        id: 'group:openai',
        label: 'openai',
        colorKey: 'green',
        nodeIds: ['topic:openai'],
        confidence: ReaderSummaryTopicMapConfidence(
          level: 'medium',
          score: 0.7,
          rationale: 'Synthetic group.',
        ),
      ),
    ],
    edges: const [],
    warnings: const [],
  );
}

ReaderSummaryTopicMap _headlineLikeLabelTopicMap() {
  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: const ReaderSummaryTopicMapConfidence(
      level: 'medium',
      score: 0.7,
      rationale: 'Synthetic headline-label topic map.',
    ),
    nodes: const [
      ReaderSummaryTopicMapNode(
        id: 'topic:productivity',
        label: 'The productivity stack many professionals rely on every',
        groupId: 'group:productivity',
        storyClusterIds: ['story:productivity'],
        popularityScore: 100,
        sizeWeight: 1,
        evidenceCount: 4,
        providerKeys: ['rss'],
        interestIds: ['productivity'],
        citationIds: ['citation:productivity'],
        keywords: ['productivity-stack'],
        rationale: 'Stored headline-like label from an older artifact.',
      ),
      ReaderSummaryTopicMapNode(
        id: 'topic:desktop-commander',
        label: 'DesktopCommanderMCP MCP Server',
        groupId: 'group:technical-tools',
        storyClusterIds: ['story:desktop-commander'],
        popularityScore: 30,
        sizeWeight: 0.2,
        evidenceCount: 1,
        providerKeys: ['github'],
        interestIds: ['developer-tools'],
        citationIds: ['citation:desktop-commander'],
        keywords: ['DesktopCommanderMCP'],
        rationale: 'Technical identifier label fixture.',
      ),
      ReaderSummaryTopicMapNode(
        id: 'topic:long-identifier',
        label: 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS',
        groupId: 'group:technical-tools',
        storyClusterIds: ['story:long-identifier'],
        popularityScore: 5,
        sizeWeight: 0.05,
        evidenceCount: 1,
        providerKeys: ['github'],
        interestIds: ['developer-tools'],
        citationIds: ['citation:long-identifier'],
        keywords: ['SUPERCALIFRAGILISTICEXPIALIDOCIOUS'],
        rationale: 'Long single-token label fixture.',
      ),
    ],
    groups: const [
      ReaderSummaryTopicMapGroup(
        id: 'group:productivity',
        label: 'productivity',
        colorKey: 'green',
        nodeIds: ['topic:productivity'],
        confidence: ReaderSummaryTopicMapConfidence(
          level: 'medium',
          score: 0.7,
          rationale: 'Synthetic group.',
        ),
      ),
      ReaderSummaryTopicMapGroup(
        id: 'group:technical-tools',
        label: 'technical tools',
        colorKey: 'violet',
        nodeIds: ['topic:desktop-commander', 'topic:long-identifier'],
        confidence: ReaderSummaryTopicMapConfidence(
          level: 'medium',
          score: 0.7,
          rationale: 'Synthetic group.',
        ),
      ),
    ],
    edges: const [],
    warnings: const [],
  );
}
