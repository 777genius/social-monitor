import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../application/contracts/reader_source_launcher.dart';

final class UrlLauncherReaderSourceLauncher implements ReaderSourceLauncher {
  const UrlLauncherReaderSourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async {
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched) {
      return Result.failure(
        UnexpectedFailure(
          message: 'Could not open ${uri.toString()}',
          code: 'summaries.reader_action_source_launch_failed',
        ),
      );
    }
    return const Result.success(Unit.value);
  }
}
