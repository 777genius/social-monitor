import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/archive_topic_command.dart';
import '../../application/commands/create_topic_command.dart';
import '../../application/commands/update_topic_command.dart';
import '../../application/use_cases/archive_topic_use_case.dart';
import '../../application/use_cases/create_topic_use_case.dart';
import '../../application/use_cases/update_topic_use_case.dart';
import '../../domain/entities/topic_summary.dart';
import '../../domain/value_objects/topic_id.dart';
import '../../domain/value_objects/topic_name.dart';
import '../../domain/value_objects/topic_rules.dart';

enum TopicEditorMode { closed, create, edit }

final class TopicsFormStore extends ChangeNotifier {
  TopicsFormStore({
    required CreateTopicUseCase createTopic,
    required UpdateTopicUseCase updateTopic,
    required ArchiveTopicUseCase archiveTopic,
    required WorkspaceScope scope,
    OperationGenerationGuard? generationGuard,
  }) : _createTopic = createTopic,
       _updateTopic = updateTopic,
       _archiveTopic = archiveTopic,
       _scope = scope,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final CreateTopicUseCase _createTopic;
  final UpdateTopicUseCase _updateTopic;
  final ArchiveTopicUseCase _archiveTopic;
  final OperationGenerationGuard _generationGuard;

  WorkspaceScope _scope;
  TopicEditorMode mode = TopicEditorMode.closed;
  AsyncViewState<TopicSummary> state = const InitialViewState<TopicSummary>();
  TopicId? editingTopicId;
  String name = '';
  String keywordsText = '';

  WorkspaceScope get scope => _scope;

  bool get isOpen => mode != TopicEditorMode.closed;

  UserActionIntent get saveIntent {
    return UserActionIntent(
      id: switch (mode) {
        TopicEditorMode.create => 'topics.create.save',
        TopicEditorMode.edit => 'topics.update.save',
        TopicEditorMode.closed => 'topics.form.closed',
      },
      disabledReasonCode: _validationFailure()?.code,
      idempotencyKey: '${_scope.workspaceId}:$mode:$name',
    );
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _generationGuard.invalidate();
    close();
  }

  void beginCreate() {
    mode = TopicEditorMode.create;
    editingTopicId = null;
    name = '';
    keywordsText = '';
    state = const InitialViewState<TopicSummary>();
    notifyListeners();
  }

  void beginEdit(TopicSummary topic) {
    mode = TopicEditorMode.edit;
    editingTopicId = topic.id;
    name = topic.name.value;
    keywordsText = topic.name.value;
    state = const InitialViewState<TopicSummary>();
    notifyListeners();
  }

  void close() {
    mode = TopicEditorMode.closed;
    editingTopicId = null;
    name = '';
    keywordsText = '';
    state = const InitialViewState<TopicSummary>();
    notifyListeners();
  }

  void updateName(String value) {
    name = value;
    notifyListeners();
  }

  void updateKeywordsText(String value) {
    keywordsText = value;
    notifyListeners();
  }

  Future<Result<TopicSummary>> save() async {
    final validationFailure = _validationFailure();
    if (validationFailure != null) {
      final result = Result<TopicSummary>.failure(validationFailure);
      state = FailureViewState<TopicSummary>(
        failure: validationFailure,
        canRetry: false,
      );
      notifyListeners();
      return result;
    }

    final generation = _generationGuard.markOperationStarted();
    state = const LoadingViewState<TopicSummary>();
    notifyListeners();

    final result = switch (mode) {
      TopicEditorMode.create => await _createTopic(
        CreateTopicCommand(scope: _scope, name: _topicName(), rules: _rules()),
      ),
      TopicEditorMode.edit => await _updateTopic(
        UpdateTopicCommand(
          scope: _scope,
          topicId: editingTopicId!,
          name: _topicName(),
          rules: _rules(),
        ),
      ),
      TopicEditorMode.closed => const Result<TopicSummary>.failure(
        ValidationFailure(
          message: 'Open a topic form before saving',
          code: 'topics.form_closed',
        ),
      ),
    };

    if (!_generationGuard.isCurrent(generation)) {
      return const Result.failure(
        StaleOperationFailure(
          message: 'Topic form result was replaced by a newer operation',
          code: 'topics.form_stale',
        ),
      );
    }

    state = result.fold(
      onSuccess: (topic) {
        mode = TopicEditorMode.closed;
        return ReadyViewState<TopicSummary>(topic);
      },
      onFailure: (failure) => FailureViewState<TopicSummary>(failure: failure),
    );
    notifyListeners();
    return result;
  }

  Future<Result<TopicSummary>> archive(TopicSummary topic) async {
    final generation = _generationGuard.markOperationStarted();
    state = const LoadingViewState<TopicSummary>();
    notifyListeners();

    final result = await _archiveTopic(
      ArchiveTopicCommand(scope: _scope, topicId: topic.id),
    );

    if (!_generationGuard.isCurrent(generation)) {
      return const Result.failure(
        StaleOperationFailure(
          message: 'Archive result was replaced by a newer operation',
          code: 'topics.archive_stale',
        ),
      );
    }

    state = result.fold(
      onSuccess: ReadyViewState<TopicSummary>.new,
      onFailure: (failure) => FailureViewState<TopicSummary>(failure: failure),
    );
    notifyListeners();
    return result;
  }

  TopicName _topicName() => TopicName(name);

  TopicRules _rules() {
    return TopicRules(keywords: keywordsText.split(','));
  }

  AppFailure? _validationFailure() {
    if (mode == TopicEditorMode.closed) {
      return const ValidationFailure(
        message: 'Open a topic form before saving',
        code: 'topics.form_closed',
      );
    }
    if (!_topicName().isValid) {
      return const ValidationFailure(
        message: 'Topic name must contain at least two characters',
        code: 'topics.name_invalid',
        field: 'name',
      );
    }
    if (!_rules().isValid) {
      return const ValidationFailure(
        message: 'Add at least one keyword before saving the topic',
        code: 'topics.rules_invalid',
        field: 'keywords',
      );
    }
    if (mode == TopicEditorMode.edit && editingTopicId == null) {
      return const ValidationFailure(
        message: 'Select a topic before editing',
        code: 'topics.id_required',
        field: 'topicId',
      );
    }
    return null;
  }
}
