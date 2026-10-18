import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Anonymous Telegram channel bindings (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('creates distinct public channels under one topic and reuses username aliases without credentials', async () => {
    const headers = { 'x-tenant-id': deterministicTestUuid('tenant-telegram-bindings'),
      'x-workspace-id': deterministicTestUuid('workspace-telegram-bindings'), 'x-workspace-role': 'admin' };
    const topic = await request(app.getHttpServer()).post('/interests').set(headers)
      .set('idempotency-key', 'telegram-binding-topic').send({ name: 'Public channels', query: 'engineering releases' }).expect(201);
    const bind = (key: string, channel: string) => request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`).set(headers)
      .set('idempotency-key', key).send({ providerKey: 'telegram', config: { mode: 'account_feed', channel } }).expect(201);
    const first = await bind('telegram-binding-first', '@Example_Channel');
    const second = await bind('telegram-binding-second', 'https://t.me/another_channel');
    const repeated = await bind('telegram-binding-alias', 'https://t.me/s/example_channel');
    expect(first.body.created).toBe(true);
    expect(second.body.created).toBe(true);
    expect(second.body.sourceBindingId).not.toBe(first.body.sourceBindingId);
    expect(repeated.body).toEqual({ sourceBindingId: first.body.sourceBindingId, created: false });
    const bindings = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings`).set(headers).expect(200);
    expect(bindings.body.sourceBindings).toHaveLength(2);
    expect(bindings.body.sourceBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.body.sourceBindingId, configPreview: expect.objectContaining({ channel: 'example_channel' }) }),
      expect.objectContaining({ id: second.body.sourceBindingId, configPreview: expect.objectContaining({ channel: 'another_channel' }) }),
    ]));
  });
});
