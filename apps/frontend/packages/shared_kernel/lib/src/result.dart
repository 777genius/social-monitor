import 'app_failure.dart';

sealed class Result<T extends Object> {
  const Result();

  const factory Result.success(T value) = ResultSuccess<T>;

  const factory Result.failure(AppFailure failure) = ResultFailure<T>;

  R fold<R>({
    required R Function(T value) onSuccess,
    required R Function(AppFailure failure) onFailure,
  }) {
    return switch (this) {
      ResultSuccess(:final value) => onSuccess(value),
      ResultFailure(:final failure) => onFailure(failure),
    };
  }
}

final class ResultSuccess<T extends Object> extends Result<T> {
  const ResultSuccess(this.value);

  final T value;
}

final class ResultFailure<T extends Object> extends Result<T> {
  const ResultFailure(this.failure);

  final AppFailure failure;
}

final class Unit {
  const Unit._();

  static const value = Unit._();
}
