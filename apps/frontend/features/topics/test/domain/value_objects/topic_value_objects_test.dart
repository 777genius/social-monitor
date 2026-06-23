import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_name.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_rules.dart';

void main() {
  test('topic name validates normalized user input', () {
    expect(const TopicName('  A  ').isValid, isFalse);
    expect(const TopicName('  AI  ').isValid, isTrue);
    expect(const TopicName('  Market risk  ').normalized, 'Market risk');
  });

  test('topic rules normalize keywords and reject empty rules', () {
    const emptyRules = TopicRules(keywords: [' ', '']);
    const rules = TopicRules(keywords: [' risk ', 'pricing', 'risk']);

    expect(emptyRules.isValid, isFalse);
    expect(rules.isValid, isTrue);
    expect(rules.normalizedKeywords, ['risk', 'pricing']);
  });
}
