import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/post_rating.dart';

final class LoadPostRatingsQuery {
  const LoadPostRatingsQuery({
    required this.scope,
    required this.userId,
    required this.targets,
  });

  final WorkspaceScope scope;
  final String userId;
  final List<PostRatingLookupTarget> targets;
}
