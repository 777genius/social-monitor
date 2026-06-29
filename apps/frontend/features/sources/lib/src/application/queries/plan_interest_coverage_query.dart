import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_interest_id.dart';

final class PlanInterestCoverageQuery {
  const PlanInterestCoverageQuery({
    required this.scope,
    required this.interestId,
    this.description,
    this.keywords = const [],
    this.subreddits = const [],
    this.rssFeedUrls = const [],
    this.includeProviders = const [],
    this.excludeProviders = const [],
  });

  final WorkspaceScope scope;
  final SourceInterestId interestId;
  final String? description;
  final List<String> keywords;
  final List<String> subreddits;
  final List<String> rssFeedUrls;
  final List<String> includeProviders;
  final List<String> excludeProviders;
}
