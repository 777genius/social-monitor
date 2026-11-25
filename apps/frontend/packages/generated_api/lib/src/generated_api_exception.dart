import 'api_problem.dart';

final class GeneratedApiException implements Exception {
  const GeneratedApiException(this.problem);

  final ApiProblem problem;

  @override
  String toString() =>
      'GeneratedApiException(${problem.status}: ${problem.title})';
}
