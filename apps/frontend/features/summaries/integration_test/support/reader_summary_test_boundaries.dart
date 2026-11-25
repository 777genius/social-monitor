import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';

final class RecordingReaderSourceLauncher implements ReaderSourceLauncher {
  final List<Uri> openedUris = [];

  @override
  Future<Result<Unit>> open(Uri uri) async {
    openedUris.add(uri);
    return const Result.success(Unit.value);
  }
}
