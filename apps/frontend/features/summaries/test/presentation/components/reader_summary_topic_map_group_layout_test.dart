import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_map.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

void main() {
  testWidgets('keeps nodes from the same semantic group spatially close', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SizedBox(
            width: 480,
            child: ReaderSummaryTopicMapPanel(
              topicMap: _denseGroupedTopicMap(),
              renderer: ReaderSummaryTopicMapRenderer.graphView,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final primary = find.byKey(const ValueKey('topic-map-bubble-topic:claude'));
    final related = find.byKey(
      const ValueKey('topic-map-bubble-topic:claude-code'),
    );
    final centerDistance =
        (tester.getCenter(primary) - tester.getCenter(related)).distance;
    final touchingDistance =
        tester.getSize(primary).width / 2 + tester.getSize(related).width / 2;

    final surfaceGap = centerDistance - touchingDistance;

    expect(surfaceGap, inInclusiveRange(4.5, 24));
  });

  testWidgets('keeps compact legend aligned with rendered graph groups', (
    tester,
  ) async {
    await _pumpTopicMap(tester, _compactSelectionTopicMap(), width: 360);

    expect(
      find.byKey(const ValueKey('topic-map-bubble-topic:codex')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('topic-map-legend-group:codex')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('topic-map-bubble-topic:ai-agent')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('topic-map-legend-group:ai-agent')),
      findsNothing,
    );
  });

  testWidgets('assigns distinct colors to distinct visible groups', (
    tester,
  ) async {
    await _pumpTopicMap(tester, _compactSelectionTopicMap(), width: 360);

    final openAiColor = _legendColor(tester, 'group:openai');
    final anthropicColor = _legendColor(tester, 'group:anthropic');

    expect(openAiColor, isNot(anthropicColor));
  });

  testWidgets('canonicalizes labels without breaking words', (tester) async {
    await _pumpTopicMap(tester, _labelQualityTopicMap(), width: 360);

    expect(find.text('ChatGPT Work'), findsWidgets);
    expect(find.text('MCP'), findsWidgets);
    expect(find.text('GPT-5.4'), findsWidgets);
    expect(find.text('Chatgpt Work'), findsNothing);
    expect(find.text('Gpt 5 4'), findsNothing);
    expect(find.text('Codex CLI'), findsWidgets);
    expect(find.text('Grok'), findsWidgets);
    expect(
      _bubbleLabelForNode(tester, 'topic:openai-chatgpt'),
      'OpenAI ChatGPT',
    );
    expect(find.text('Codex CLI Say'), findsNothing);
    expect(find.text('Grok Grok Created'), findsNothing);
    expect(
      _bubbleLabelForNode(tester, 'topic:gpt-sol-masterclass'),
      'GPT-5.6 Sol Masterclass',
    );

    final anthropicText = find.byKey(
      const ValueKey('topic-map-bubble-label-topic:anthropic'),
    );

    expect(anthropicText, findsOneWidget);
    final textWidget = tester.widget<Text>(anthropicText);
    expect(textWidget.data, 'Anthropic');
    expect(
      tester.getSize(anthropicText).height,
      lessThanOrEqualTo((textWidget.style?.fontSize ?? 0) * 1.5),
    );
  });

  testWidgets('deduplicates exact normalized labels and keeps the next topic', (
    tester,
  ) async {
    await _pumpTopicMap(tester, _duplicateLabelTopicMap(), width: 480);

    expect(
      find.byKey(const ValueKey('topic-map-bubble-topic:claude-primary')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('topic-map-bubble-topic:claude-duplicate')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('topic-map-bubble-topic:codex')),
      findsOneWidget,
    );
    expect(_bubbleLabelForNode(tester, 'topic:claude-primary'), 'Claude Code');
  });

  testWidgets('uses reader-facing labels and metrics in tooltips', (
    tester,
  ) async {
    final topicMap = _denseGroupedTopicMap();
    await _pumpTopicMap(tester, topicMap, width: 480);

    final tooltip = tester.widget<Tooltip>(
      find.byKey(const ValueKey('topic-map-bubble-topic:claude-code')),
    );
    final message = tooltip.message ?? '';

    expect(message, contains('Claude Code'));
    expect(message, contains('Popularity:'));
    expect(message, contains('Group: Claude Ecosystem'));
    expect(message, isNot(contains('Weight:')));
  });
}

Future<void> _pumpTopicMap(
  WidgetTester tester,
  ReaderSummaryTopicMap topicMap, {
  required double width,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: SizedBox(
          width: width,
          child: ReaderSummaryTopicMapPanel(
            topicMap: topicMap,
            renderer: ReaderSummaryTopicMapRenderer.graphView,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

Color? _legendColor(WidgetTester tester, String groupId) {
  final box = tester.widget<DecoratedBox>(
    find.byKey(ValueKey('topic-map-legend-$groupId')),
  );

  return (box.decoration as BoxDecoration).color;
}

String? _bubbleLabelForNode(WidgetTester tester, String nodeId) => tester
    .widget<Text>(find.byKey(ValueKey('topic-map-bubble-label-$nodeId')))
    .data
    ?.replaceAll('\n', ' ');

ReaderSummaryTopicMap _denseGroupedTopicMap() {
  const confidence = ReaderSummaryTopicMapConfidence(
    level: 'high',
    score: 0.9,
    rationale: 'Synthetic real-day-shaped topic map.',
  );
  final groupedNodes = [
    _node('claude', 'Claude ecosystem', 'claude', 100, 8),
    _node('claude-code', 'Claude Code', 'claude', 76, 5),
  ];
  final singletonGroups = ['openai', 'anthropic', 'chatgpt', 'ai-agent'];
  final singletonNodes = [
    for (var index = 0; index < singletonGroups.length; index++)
      _node(
        singletonGroups[index],
        'Singleton ${index + 1}',
        singletonGroups[index],
        68 - index * 6,
        2,
      ),
  ];
  final neutralNodes = [
    for (var index = 0; index < 22; index++)
      _node('neutral-$index', 'Neutral $index', 'neutral-$index', 48, 1),
  ];

  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: confidence,
    nodes: [...groupedNodes, ...singletonNodes, ...neutralNodes],
    groups: [
      const ReaderSummaryTopicMapGroup(
        id: 'group:claude',
        label: 'Claude ecosystem',
        colorKey: 'blue',
        nodeIds: ['topic:claude', 'topic:claude-code'],
        confidence: confidence,
      ),
      for (var index = 0; index < singletonGroups.length; index++)
        ReaderSummaryTopicMapGroup(
          id: 'group:${singletonGroups[index]}',
          label: singletonGroups[index],
          colorKey: 'green',
          nodeIds: ['topic:${singletonGroups[index]}'],
          confidence: confidence,
        ),
      for (var index = 0; index < neutralNodes.length; index++)
        ReaderSummaryTopicMapGroup(
          id: 'group:neutral-$index',
          label: 'neutral-$index',
          colorKey: 'slate',
          nodeIds: ['topic:neutral-$index'],
          confidence: confidence,
        ),
    ],
    edges: const [
      ReaderSummaryTopicMapEdge(
        sourceNodeId: 'topic:claude',
        targetNodeId: 'topic:claude-code',
        weight: 0.9,
        reason: 'Same semantic topic group.',
      ),
    ],
    warnings: const [],
  );
}

ReaderSummaryTopicMap _compactSelectionTopicMap() {
  const confidence = ReaderSummaryTopicMapConfidence(
    level: 'high',
    score: 0.9,
    rationale: 'Compact selection fixture.',
  );
  final leadingNodes = [
    _node('claude', 'Claude ecosystem', 'claude', 100, 12),
    _node('openai', 'OpenAI ecosystem', 'openai', 80, 8),
    _node('claude-code', 'Claude Code', 'claude', 70, 6),
    _node('anthropic', 'Anthropic', 'anthropic', 60, 5),
    _node('chatgpt-work', 'Chatgpt Work', 'chatgpt-work', 55, 4),
    _node('codex', 'Codex', 'codex', 50, 3),
  ];
  final tailNodes = [
    for (var index = 0; index < 29; index++)
      _node('tail-$index', 'Tail $index', 'tail-$index', 20, 1),
  ];
  final aiAgent = _node('ai-agent', 'Ai Agent', 'ai-agent', 50, 3);
  final nodes = [...leadingNodes, ...tailNodes, aiAgent];
  final colors = {
    'claude': 'blue',
    'openai': 'green',
    'anthropic': 'green',
    'chatgpt-work': 'amber',
    'codex': 'violet',
    'ai-agent': 'amber',
  };

  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: confidence,
    nodes: nodes,
    groups: [
      for (final node in nodes)
        if (node.id != 'topic:claude-code')
          ReaderSummaryTopicMapGroup(
            id: node.groupId,
            label: node.label,
            colorKey:
                colors[node.groupId.substring('group:'.length)] ?? 'slate',
            nodeIds: node.groupId == 'group:claude'
                ? const ['topic:claude', 'topic:claude-code']
                : [node.id],
            confidence: confidence,
          ),
    ],
    edges: const [],
    warnings: const [],
  );
}

ReaderSummaryTopicMap _labelQualityTopicMap() {
  const confidence = ReaderSummaryTopicMapConfidence(
    level: 'high',
    score: 0.9,
    rationale: 'Label quality fixture.',
  );
  final nodes = [
    _node('chatgpt-work', 'Chatgpt Work', 'chatgpt-work', 100, 6),
    _node('mcp', 'Mcp', 'mcp', 80, 4),
    _node('gpt', 'Gpt 5 4', 'gpt', 70, 3),
    _node('anthropic', 'Anthropic', 'anthropic', 60, 2),
    _node('codex-cli', 'Codex CLI Say', 'codex-cli', 55, 2),
    _node('grok', 'Grok Grok Created', 'grok', 50, 2),
    _node('openai-chatgpt', 'OpenAI Brings ChatGPT', 'openai-chatgpt', 45, 2),
    _node(
      'gpt-sol-masterclass',
      'GPT-5.6 Sol Masterclass',
      'gpt-sol-masterclass',
      45,
      1,
    ),
  ];

  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: confidence,
    nodes: nodes,
    groups: [
      for (var index = 0; index < nodes.length; index++)
        ReaderSummaryTopicMapGroup(
          id: nodes[index].groupId,
          label: nodes[index].label,
          colorKey: [
            'amber',
            'violet',
            'green',
            'pink',
            'blue',
            'orange',
            'teal',
            'blue',
          ][index],
          nodeIds: [nodes[index].id],
          confidence: confidence,
        ),
    ],
    edges: const [],
    warnings: const [],
  );
}

ReaderSummaryTopicMap _duplicateLabelTopicMap() {
  const confidence = ReaderSummaryTopicMapConfidence(
    level: 'high',
    score: 0.9,
    rationale: 'Exact normalized-label dedupe fixture.',
  );
  final nodes = [
    _node('claude-primary', 'ClaudeCode', 'claude', 100, 8),
    _node('claude-duplicate', 'Claude Code', 'duplicate', 90, 7),
    _node('codex', 'Codex', 'codex', 80, 6),
  ];

  return ReaderSummaryTopicMap(
    generatedBy: 'agent-runtime',
    confidence: confidence,
    nodes: nodes,
    groups: [
      for (final node in nodes)
        ReaderSummaryTopicMapGroup(
          id: node.groupId,
          label: node.label,
          colorKey: 'blue',
          nodeIds: [node.id],
          confidence: confidence,
        ),
    ],
    edges: const [],
    warnings: const [],
  );
}

ReaderSummaryTopicMapNode _node(
  String id,
  String label,
  String group,
  double popularity,
  int evidenceCount,
) => ReaderSummaryTopicMapNode(
  id: 'topic:$id',
  label: label,
  groupId: 'group:$group',
  storyClusterIds: ['story:$id'],
  popularityScore: popularity,
  sizeWeight: math.max(0.2, popularity / 100),
  evidenceCount: evidenceCount,
  providerKeys: const ['rss'],
  interestIds: const ['ai'],
  citationIds: ['citation:$id'],
  keywords: [label],
  rationale: 'Layout fixture.',
);
