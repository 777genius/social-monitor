import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_summary.dart';
import '../commands/archive_interest_command.dart';
import '../commands/create_interest_command.dart';
import '../commands/update_interest_command.dart';
import '../queries/list_interests_query.dart';

abstract interface class InterestCatalog {
  Future<Result<PageResult<InterestSummary>>> listInterests(
    ListInterestsQuery query,
  );

  Future<Result<InterestSummary>> createInterest(CreateInterestCommand command);

  Future<Result<InterestSummary>> updateInterest(UpdateInterestCommand command);

  Future<Result<InterestSummary>> archiveInterest(
    ArchiveInterestCommand command,
  );
}
