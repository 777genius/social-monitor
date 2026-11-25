import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

abstract interface class ReaderSourceLauncher {
  Future<Result<Unit>> open(Uri uri);
}
