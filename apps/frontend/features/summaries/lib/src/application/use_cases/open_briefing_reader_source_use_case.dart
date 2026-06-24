import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/briefing_reader_action_target.dart';
import '../commands/open_briefing_reader_source_command.dart';
import '../contracts/briefing_reader_source_launcher.dart';

final class OpenBriefingReaderSourceUseCase {
  const OpenBriefingReaderSourceUseCase(this._launcher);

  final BriefingReaderSourceLauncher _launcher;

  Future<Result<BriefingReaderActionResult>> call(
    OpenBriefingReaderSourceCommand command,
  ) async {
    if (command.briefingId.trim().isEmpty) {
      return const Result.failure(
        ValidationFailure(
          message: 'Briefing id is required',
          code: 'summaries.briefing_id_required',
          field: 'briefingId',
        ),
      );
    }
    if (command.kind != 'read_source') {
      return Result.failure(
        ValidationFailure(
          message: 'Reader action ${command.kind} is not an external source',
          code: 'summaries.reader_action_not_supported',
          field: 'kind',
        ),
      );
    }

    final uri = _safeExternalUri(command.canonicalUrl);
    if (uri == null) {
      return const Result.failure(
        ValidationFailure(
          message: 'Reader action source URL is required',
          code: 'summaries.reader_action_source_url_required',
          field: 'canonicalUrl',
        ),
      );
    }

    final launched = await _launcher.open(uri);
    return launched.fold(
      onSuccess: (_) => Result.success(
        BriefingReaderActionResult(
          actionId: uri.toString(),
          idempotencyKey: command.idempotencyKey,
          kind: command.kind,
          created: true,
          learningDirection: 'external_source_opened',
        ),
      ),
      onFailure: Result<BriefingReaderActionResult>.failure,
    );
  }

  Uri? _safeExternalUri(String? value) {
    final normalized = value?.trim();
    if (normalized == null || normalized.isEmpty) {
      return null;
    }

    final uri = Uri.tryParse(normalized);
    if (uri == null || uri.scheme.isEmpty || uri.host.trim().isEmpty) {
      return null;
    }
    if (uri.scheme != 'https' && uri.scheme != 'http') {
      return null;
    }
    return uri;
  }
}
