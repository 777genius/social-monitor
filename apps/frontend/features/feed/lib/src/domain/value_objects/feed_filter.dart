import 'mention_triage_state.dart';

final class FeedFilter {
  const FeedFilter({this.search = '', this.triageState});

  final String search;
  final MentionTriageState? triageState;

  FeedFilter normalized() {
    return FeedFilter(search: search.trim(), triageState: triageState);
  }

  String get stableKey {
    final normalizedSearch = search.trim().toLowerCase();
    final triage = triageState?.name ?? 'any';
    return '$normalizedSearch:$triage';
  }
}
