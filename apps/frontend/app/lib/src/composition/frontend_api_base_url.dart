/// Resolve the packaged web client's API against its current browser origin.
/// Native/test runtimes cannot accidentally interpret a relative URL as a host.
String resolveFrontendApiBaseUrl(String configured, {Uri? documentUri}) {
  final value = configured.trim();
  if (!value.startsWith('/')) {
    return value;
  }
  if (value.startsWith('//')) {
    return '';
  }
  final document = documentUri ?? Uri.base;
  if ((document.scheme != 'http' && document.scheme != 'https') ||
      document.host.isEmpty) {
    return '';
  }
  return Uri.parse(document.origin).resolve(value).toString();
}
