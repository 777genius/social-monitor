import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_app/src/composition/frontend_api_base_url.dart';

void main() {
  test('one compiled client follows the origin and an alternate published port', () {
    expect(
      resolveFrontendApiBaseUrl(
        '/api',
        documentUri: Uri.parse('http://127.0.0.1:38417/summaries?day=today'),
      ),
      'http://127.0.0.1:38417/api',
    );
    expect(
      resolveFrontendApiBaseUrl(
        '/api',
        documentUri: Uri.parse('https://news.example.test/summaries'),
      ),
      'https://news.example.test/api',
    );
  });

  test('relative configuration fails closed outside a web origin', () {
    expect(
      resolveFrontendApiBaseUrl('/api', documentUri: Uri.file('/workspace/app')),
      '',
    );
    expect(
      resolveFrontendApiBaseUrl(
        '//other.example.test/api',
        documentUri: Uri.parse('https://news.example.test'),
      ),
      '',
    );
  });

  test('existing absolute backend configuration remains usable', () {
    expect(
      resolveFrontendApiBaseUrl(' https://api.example.test '),
      'https://api.example.test',
    );
  });
}
