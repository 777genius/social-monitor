part of 'reader_summary_brief_surface.dart';

const _topicGeneratedColorPrefix = 'auto:';

Color _topicColor(String colorKey) {
  if (colorKey.startsWith(_topicGeneratedColorPrefix)) {
    return _generatedTopicColor(colorKey);
  }

  return switch (colorKey) {
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

String _topicMapBubbleLabel(String value) =>
    value.replaceAll(RegExp(r'\s+'), ' ').trim();

String _topicMapSemanticLabel(ReaderSummaryTopicMap topicMap) {
  final labels = topicMap.nodes
      .take(5)
      .map((node) => '${node.label}, ${node.popularityScore.round()}')
      .join('; ');

  return 'Topic map: $labels';
}
