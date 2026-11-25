import { requiredTelegramCollectionTestDatabaseUrl } from './check-telegram-channel-collection-postgres';

describe('Telegram PostgreSQL sandbox admission', () => {
  it.each([
    'postgresql://sandbox@127.0.0.1:55432/telegram_collection_test_live',
    'postgres://sandbox@[::1]:55432/telegram_collection_test_live',
  ])('accepts only an explicit literal-loopback test database: %s', (url) => {
    expect(requiredTelegramCollectionTestDatabaseUrl({ TELEGRAM_COLLECTION_TEST_DATABASE_URL: url })).toBe(url);
  });

  it.each([
    undefined, '', 'not-a-url',
    'postgresql://sandbox@production.example/telegram_collection_test_live',
    'postgresql://sandbox@localhost/telegram_collection_test_live',
    'postgresql://sandbox@127.0.0.1/social_monitor',
    'postgresql://sandbox@127.0.0.1/telegram_collection_test_',
    'postgresql://sandbox@127.0.0.1/telegram_collection_test_live?host=production.example',
    'postgresql://sandbox@127.0.0.1/telegram_collection_test_live?options=-csearch_path%3Dpublic',
    'postgresql://sandbox@127.0.0.1/telegram_collection_test_live#fragment',
    'postgresql://sandbox@127.0.0.1/telegram_collection_test_live%2fother',
    'https://127.0.0.1/telegram_collection_test_live',
  ])('rejects unsafe/ambiguous database targets before connecting: %s', (url) => {
    expect(() => requiredTelegramCollectionTestDatabaseUrl({ TELEGRAM_COLLECTION_TEST_DATABASE_URL: url,
      DATABASE_URL: 'postgresql://production.example/social_monitor' })).toThrow();
  });
});
