import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_name.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_query.dart';

void main() {
  test('topic name validates normalized user input', () {
    expect(const TopicName('  A  ').isValid, isFalse);
    expect(const TopicName('  AI  ').isValid, isTrue);
    expect(const TopicName('  Market risk  ').normalized, 'Market risk');
  });

  test('topic query validates minimum length and normalization', () {
    const query = TopicQuery(' pricing OR launch ');

    expect(query.normalized, 'pricing OR launch');
    expect(query.isValid, isTrue);
    expect(const TopicQuery('x').isValid, isFalse);
  });
}
