import { readerSummaryReadyFixture } from '../../test-support/reader-summary-ready.fixture';
import { parseReaderSummaryReadyEvent } from './reader-summary-ready-event.parser';

function transport(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(readerSummaryReadyFixture())) as Record<string, unknown>;
}

describe('reader_summary.ready v1 parser', () => {
  it('consumes the publication domain event and discards private publication evidence', () => {
    const event = transport();
    const payload = event.payload as Record<string, unknown>;
    Object.assign(payload, { publicationProof: { fixture: true }, reportSha256: 'a'.repeat(64),
      proofSha256: 'b'.repeat(64), userId: 'fixture-user', subscriptionId: 'fixture-subscription' });
    expect(parseReaderSummaryReadyEvent(event).payload).toEqual(readerSummaryReadyFixture().payload);
  });

  it.each([
    ['schemaVersion', 2], ['eventType', 'summary.ready'], ['payload', []],
    ['occurredAt', 'September 4 2026'], ['occurredAt', '2026-02-30T00:00:00.000Z'], ['eventId', ''],
    ['workspaceId', 'mismatch'], ['tenantId', 'mismatch'],
  ])('rejects invalid envelope %s', (field, value) => {
    expect(() => parseReaderSummaryReadyEvent({ ...transport(), [field]: value })).toThrow();
  });

  it.each([
    ['scope', { type: 'user', userId: 'fixture' }], ['scope', { type: 'interest' }],
    ['scope', { type: 'workspace', interestId: 'ambiguous' }], ['scope', []],
    ['status', 'FAILED'], ['status', 'running'], ['readerSummaryJobId', ''], ['readerSummaryId', ' '],
    ['period', { cadence: 'daily' }],
  ])('rejects invalid payload %s', (field, value) => {
    const event = transport();
    expect(() => parseReaderSummaryReadyEvent({ ...event, payload: { ...event.payload as object, [field]: value } })).toThrow();
  });

  it.each([
    ['cadence', 'forever'], ['timezone', 'Invalid/Timezone'], ['periodKey', 'unbound'],
    ['startedAt', '2026-09-05T00:00:00.000Z'], ['endedAt', '2026-12-01T00:00:00.000Z'],
  ])('rejects an invalid period %s', (field, value) => {
    const event = transport();
    const payload = event.payload as Record<string, unknown>;
    expect(() => parseReaderSummaryReadyEvent({ ...event, payload: { ...payload,
      period: { ...payload.period as object, [field]: value } } })).toThrow();
  });
});
