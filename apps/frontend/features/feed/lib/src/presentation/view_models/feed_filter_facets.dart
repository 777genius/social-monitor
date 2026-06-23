import '../../domain/entities/feed_item.dart';
import '../../domain/value_objects/feed_item_filter.dart';
import '../../domain/value_objects/feed_provider_metadata.dart';
import 'feed_provider_visuals.dart';

final class FeedFilterFacets {
  const FeedFilterFacets({
    required this.providerOptions,
    required this.trendWindowOptions,
    required this.languageOptions,
    required this.repositoryTopicOptions,
  });

  final List<FeedFilterOption> providerOptions;
  final List<FeedFilterOption> trendWindowOptions;
  final List<FeedFilterOption> languageOptions;
  final List<FeedFilterOption> repositoryTopicOptions;
}

final class FeedFilterOption {
  const FeedFilterOption({
    required this.label,
    required this.value,
    required this.selected,
  });

  final String label;
  final String value;
  final bool selected;
}

FeedFilterFacets buildFeedFilterFacets({
  required List<FeedItem> items,
  required FeedItemFilter filter,
}) {
  final normalizedFilter = filter.normalized();
  final providerKeys = _orderedUnique(
    items.map((item) => item.providerKey.toLowerCase()),
  );
  final trends = items
      .map((item) => item.providerMetadata)
      .whereType<GitHubRepositoryTrendMetadata>()
      .toList(growable: false);
  final trendWindows = _orderedTrendWindows(
    trends.map((trend) => trend.primaryWindow),
  );
  final languages = _orderedUnique(
    trends.map((trend) => trend.language).whereType<String>(),
  );
  final repositoryTopics = _orderedUnique(
    trends.expand((trend) => trend.topics),
  );

  return FeedFilterFacets(
    providerOptions: _options(
      values: providerKeys,
      selectedValue: normalizedFilter.providerKey,
      labelFor: (value) => 'Provider: ${feedProviderVisuals(value).label}',
    ),
    trendWindowOptions: _options(
      values: trendWindows,
      selectedValue: normalizedFilter.repositoryTrendWindow,
      labelFor: (value) => 'Window: $value',
    ),
    languageOptions: _options(
      values: languages,
      selectedValue: normalizedFilter.repositoryLanguage,
      labelFor: (value) => 'Language: $value',
    ),
    repositoryTopicOptions: _options(
      values: repositoryTopics.take(6),
      selectedValue: normalizedFilter.repositoryTopic,
      labelFor: (value) => 'Topic: $value',
    ),
  );
}

List<FeedFilterOption> _options({
  required Iterable<String> values,
  required String? selectedValue,
  required String Function(String value) labelFor,
}) {
  return values
      .map((value) {
        final selected =
            selectedValue != null &&
            value.toLowerCase() == selectedValue.toLowerCase();
        return FeedFilterOption(
          label: labelFor(value),
          value: value,
          selected: selected,
        );
      })
      .where((option) => option.selected || selectedValue == null)
      .toList(growable: false);
}

List<String> _orderedUnique(Iterable<String> values) {
  final seen = <String>{};
  final result = <String>[];
  for (final value in values) {
    final trimmed = value.trim();
    final key = trimmed.toLowerCase();
    if (trimmed.isEmpty || seen.contains(key)) {
      continue;
    }
    seen.add(key);
    result.add(trimmed);
  }
  result.sort(
    (left, right) => left.toLowerCase().compareTo(right.toLowerCase()),
  );
  return result;
}

List<String> _orderedTrendWindows(Iterable<String> values) {
  const order = ['24h', '7d', '30d', '90d'];
  final present = values.map((value) => value.toLowerCase()).toSet();
  return order.where(present.contains).toList(growable: false);
}
