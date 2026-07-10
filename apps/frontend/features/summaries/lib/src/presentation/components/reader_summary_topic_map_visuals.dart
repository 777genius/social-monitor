part of 'reader_summary_brief_surface.dart';

const _topicGeneratedColorPrefix = 'auto:';
const _topicMapNeutralGroupId = 'topic-map:neutral';
const _topicMapNeutralColorKey = 'neutral';
const _weakTopicLabelTokens = {
  'a',
  'about',
  'after',
  'all',
  'an',
  'and',
  'are',
  'as',
  'ask',
  'at',
  'be',
  'been',
  'being',
  'before',
  'bringing',
  'brings',
  'built',
  'but',
  'by',
  'can',
  'caught',
  'could',
  'created',
  'consuming',
  'day',
  'days',
  'did',
  'didn',
  'ditching',
  'do',
  'does',
  'dropped',
  'entire',
  'every',
  'expect',
  'gave',
  'for',
  'from',
  'global',
  'go',
  'goto',
  'has',
  'have',
  'having',
  'happens',
  'hiring',
  'hn',
  'how',
  'if',
  'in',
  'into',
  'introducing',
  'is',
  'it',
  'its',
  'just',
  'let',
  'many',
  'made',
  'me',
  'minute',
  'minutes',
  'more',
  'my',
  'new',
  'not',
  'of',
  'on',
  'or',
  'over',
  'post',
  'posts',
  'presents',
  'price',
  'prompt',
  'prompts',
  'professionals',
  'pros',
  'race',
  'racing',
  're',
  'rolling',
  'rely',
  'relying',
  'replacing',
  'should',
  'say',
  'said',
  'says',
  'ship',
  'shipping',
  'show',
  'showed',
  'showing',
  'shown',
  'shows',
  'smartest',
  'source',
  'story',
  'that',
  'the',
  'these',
  'this',
  'those',
  'thread',
  'to',
  'top',
  'user',
  'users',
  'we',
  'was',
  'were',
  'what',
  'when',
  'where',
  'who',
  'why',
  'with',
  'without',
  'workshop',
  'would',
  'you',
  'your',
};

const _topicMapDisplayTokenLabels = {
  'ai': 'AI',
  'api': 'API',
  'chatgpt': 'ChatGPT',
  'claude': 'Claude',
  'cli': 'CLI',
  'codex': 'Codex',
  'github': 'GitHub',
  'llm': 'LLM',
  'mcp': 'MCP',
  'openai': 'OpenAI',
  'rss': 'RSS',
};

Color _topicColor(String colorKey) {
  if (colorKey.startsWith(_topicGeneratedColorPrefix)) {
    return _generatedTopicColor(colorKey);
  }

  return switch (colorKey) {
    _topicMapNeutralColorKey => AppColors.textMuted,
    'green' => AppColors.success,
    'pink' => AppColors.chartMagenta,
    'amber' => AppColors.amber,
    'violet' => AppColors.chartViolet,
    'teal' => AppColors.chartTeal,
    'orange' => AppColors.chartOrange,
    'slate' => AppColors.chartInk,
    _ => AppColors.chartBlue,
  };
}

Color _generatedTopicColor(String colorKey) {
  final index = _generatedTopicColorIndex(colorKey);
  final hash = colorKey.codeUnits.fold<int>(
    17,
    (value, codeUnit) => (value * 31 + codeUnit) & 0x7fffffff,
  );
  final seed = index ?? hash;
  final hue = ((seed * 137.508) + 12) % 360;
  final saturation = (0.64 + (seed % 3) * 0.05).clamp(0.0, 1.0);
  final lightness = (0.45 + (seed % 4) * 0.035).clamp(0.0, 1.0);

  return HSLColor.fromAHSL(1, hue, saturation, lightness).toColor();
}

int? _generatedTopicColorIndex(String colorKey) {
  final value = colorKey.substring(_topicGeneratedColorPrefix.length);
  final separatorIndex = value.indexOf(':');
  final indexValue = separatorIndex < 0
      ? value
      : value.substring(0, separatorIndex);

  return int.tryParse(indexValue);
}

Color _labelColor(Color color) =>
    ThemeData.estimateBrightnessForColor(color) == Brightness.dark
    ? Colors.white
    : AppColors.ink;

String _topicMapDisplayLabel(ReaderSummaryTopicMapNode node) {
  final label = _compactTopicMapDisplayLabel(node.label);
  final displayLabel = _visibleTopicMapDisplayLabel(label);
  if (displayLabel != null) {
    return displayLabel;
  }

  final keywords = node.keywords
      .map((value) => value.replaceAll(RegExp(r'[-_]+'), ' ').trim())
      .where((value) => value.isNotEmpty)
      .where((value) => !_isWeakTopicMapLabel(value));
  final keyword = keywords.isEmpty ? null : keywords.first;

  return keyword == null ? '' : _topicMapDisplayTitle(keyword);
}

String _compactTopicMapDisplayLabel(String value) => value
    .replaceFirst(RegExp(r'^(?:\[\d+\]\s*)+'), '')
    .replaceFirst(RegExp(r'^(?:ask|show)\s+hn:\s*', caseSensitive: false), '')
    .replaceFirst(
      RegExp(
        r'^(?:why|how|what|when|where|who|should|could|would)\s+',
        caseSensitive: false,
      ),
      '',
    )
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

String? _visibleTopicMapDisplayLabel(String value) {
  final tokens = _meaningfulTopicMapLabelTokens(
    value,
  ).toSet().toList(growable: false);
  if (tokens.isEmpty) {
    return null;
  }
  final rawTokenCount = value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9+#.]+'), ' ')
      .trim()
      .split(RegExp(r'\s+'))
      .where((token) => token.isNotEmpty)
      .where((token) => token.length > 1)
      .where((token) => int.tryParse(token) == null)
      .length;
  if (tokens.length < rawTokenCount) {
    return _topicMapDisplayTitle(tokens.take(4).join(' '));
  }
  if (_isTitleLikeTopicMapLabel(value)) {
    return _topicMapDisplayTitle(tokens.take(4).join(' '));
  }

  return _topicMapDisplayTitle(value);
}

bool _isWeakTopicMapLabel(String value) =>
    _meaningfulTopicMapLabelTokens(value).isEmpty;

bool _isWeakTopicMapGroup(ReaderSummaryTopicMapGroup group) =>
    _isWeakTopicMapId(group.id) || _isWeakTopicMapLabel(group.label);

bool _isWeakTopicMapId(String value) {
  final rawValue = value.split(':').last.replaceAll(RegExp(r'[-_]+'), ' ');

  return _isWeakTopicMapLabel(rawValue);
}

bool _isTitleLikeTopicMapLabel(String value) {
  final wordCount = value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
      .trim()
      .split(RegExp(r'\s+'))
      .where((token) => token.isNotEmpty)
      .length;

  return wordCount >= 6 || value.length >= 48;
}

Iterable<String> _meaningfulTopicMapLabelTokens(String value) => value
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9+#.]+'), ' ')
    .trim()
    .split(RegExp(r'\s+'))
    .where((token) => token.length > 1)
    .where((token) => int.tryParse(token) == null)
    .where((token) => !_weakTopicLabelTokens.contains(token));

String _topicMapDisplayTitle(String value) {
  final normalized = value
      .replaceAllMapped(
        RegExp(r'\bgpt[\s_-]*(\d+)[\s._-]+(\d+)\b', caseSensitive: false),
        (match) => 'GPT-${match.group(1)}.${match.group(2)}',
      )
      .replaceAllMapped(
        RegExp(r'\bgpt[\s_-]*(\d+)\b', caseSensitive: false),
        (match) => 'GPT-${match.group(1)}',
      );

  return normalized
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .map(_topicMapDisplayToken)
      .join(' ');
}

String _topicMapDisplayToken(String value) {
  final normalized = value.toLowerCase();

  return _topicMapDisplayTokenLabels[normalized] ??
      '${value.substring(0, 1).toUpperCase()}${value.substring(1)}';
}

String _topicMapLegendLabel(
  ReaderSummaryTopicMap topicMap,
  ReaderSummaryTopicMapGroup group,
) {
  if (group.id == _topicMapNeutralGroupId) {
    return group.label;
  }
  final rawGroupId = group.id.split(':').last.replaceAll(RegExp(r'[-_]+'), ' ');
  final useSemanticLabel =
      topicMap.generatedBy == 'deterministic' ||
      group.nodeIds.length >= 3 ||
      (group.id.startsWith('group:') &&
          _meaningfulTopicMapLabelTokens(rawGroupId).length >= 2);
  final semanticLabel = useSemanticLabel
      ? _topicMapGroupIdDisplayLabel(group.id)
      : null;
  if (semanticLabel != null) {
    return semanticLabel;
  }
  final groupNodeIds = group.nodeIds.toSet();
  final nodes =
      topicMap.nodes
          .where(
            (node) =>
                node.groupId == group.id || groupNodeIds.contains(node.id),
          )
          .toList()
        ..sort((left, right) {
          final byPopularity = right.popularityScore.compareTo(
            left.popularityScore,
          );
          if (byPopularity != 0) {
            return byPopularity;
          }

          return right.evidenceCount.compareTo(left.evidenceCount);
        });

  for (final node in nodes) {
    final label = _topicMapDisplayLabel(node);
    if (label.isNotEmpty) {
      return label;
    }
  }

  return _visibleTopicMapDisplayLabel(
        _compactTopicMapDisplayLabel(group.label),
      ) ??
      group.label;
}

String? _topicMapGroupIdDisplayLabel(String groupId) {
  final raw = groupId.split(':').last.replaceAll(RegExp(r'[-_]+'), ' ').trim();
  if (raw.isEmpty ||
      RegExp(
        r'^[0-9a-f]{8}(?:\s+[0-9a-f]{4}){3}',
        caseSensitive: false,
      ).hasMatch(raw)) {
    return null;
  }

  return _visibleTopicMapDisplayLabel(raw);
}

String _topicMapSemanticLabel(List<ReaderSummaryTopicMapNode> visibleNodes) {
  final labels = visibleNodes
      .take(5)
      .map(
        (node) =>
            '${_topicMapDisplayLabel(node)}, ${node.popularityScore.round()}',
      )
      .join('; ');

  return 'Topic map: $labels';
}
