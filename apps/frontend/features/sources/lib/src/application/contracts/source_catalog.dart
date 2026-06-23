import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_health_snapshot.dart';
import '../../domain/entities/source_summary.dart';
import '../commands/connect_source_command.dart';
import '../commands/pause_source_command.dart';
import '../commands/reconnect_source_command.dart';
import '../commands/resume_source_command.dart';
import '../queries/list_sources_query.dart';
import '../queries/load_source_health_query.dart';

abstract interface class SourceCatalog {
  Future<Result<PageResult<SourceSummary>>> listSources(ListSourcesQuery query);

  Future<Result<SourceSummary>> connectSource(ConnectSourceCommand command);

  Future<Result<SourceSummary>> reconnectSource(ReconnectSourceCommand command);

  Future<Result<SourceSummary>> pauseSource(PauseSourceCommand command);

  Future<Result<SourceSummary>> resumeSource(ResumeSourceCommand command);

  Future<Result<SourceHealthSnapshot>> loadSourceHealth(
    LoadSourceHealthQuery query,
  );
}
