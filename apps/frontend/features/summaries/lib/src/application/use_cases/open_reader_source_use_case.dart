import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/reader_action_target.dart';
import '../commands/open_reader_source_command.dart';
import '../contracts/reader_source_launcher.dart';

final class OpenReaderSourceUseCase {
  const OpenReaderSourceUseCase(this._launcher);

  final ReaderSourceLauncher _launcher;

  Future<Result<ReaderActionResult>> call(
    OpenReaderSourceCommand command,
  ) async {
    if (command.summaryId.trim().isEmpty) {
      return const Result.failure(
        ValidationFailure(
          message: 'Summary id is required',
          code: 'summaries.summary_id_required',
          field: 'summaryId',
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
        ReaderActionResult(
          actionId: uri.toString(),
          idempotencyKey: command.idempotencyKey,
          kind: command.kind,
          created: true,
          learningDirection: 'external_source_opened',
        ),
      ),
      onFailure: Result<ReaderActionResult>.failure,
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
