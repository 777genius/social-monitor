import 'dart:async';

import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/reader_source_launcher.dart';

final class CallbackReaderSourceLauncher implements ReaderSourceLauncher {
  const CallbackReaderSourceLauncher(this._open);

  final FutureOr<void> Function(Uri uri) _open;

  @override
  Future<Result<Unit>> open(Uri uri) async {
    await _open(uri);
    return const Result.success(Unit.value);
  }
}
