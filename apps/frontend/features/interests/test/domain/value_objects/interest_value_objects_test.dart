import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_name.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_query.dart';

void main() {
  test('interest name validates normalized user input', () {
    expect(const InterestName('  A  ').isValid, isFalse);
    expect(const InterestName('  AI  ').isValid, isTrue);
    expect(const InterestName('  Market risk  ').normalized, 'Market risk');
  });

  test('interest query validates minimum length and normalization', () {
    const query = InterestQuery(' pricing OR launch ');

    expect(query.normalized, 'pricing OR launch');
    expect(query.isValid, isTrue);
    expect(const InterestQuery('x').isValid, isFalse);
  });
}
