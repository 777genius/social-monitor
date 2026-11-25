import { boundedPipelineTransport } from './reader-value-provider-pipeline-fixture';

describe('live reader-value pipeline transport ceiling', () => {
  it('reserves the shared four-call budget before concurrent transport attempts', async () => {
    const transport = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async () => new Response('{}'));
    const bounded = boundedPipelineTransport(transport, 4);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () =>
      bounded.transport('https://api.openai.com/v1/decisions')));
    expect(transport).toHaveBeenCalledTimes(4);
    expect(bounded.calls()).toBe(4);
    expect(bounded.blockedCalls()).toBe(2);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(4);
    await expect(bounded.transport('https://api.openai.com/v1/decisions')).rejects.toThrow('budget exhausted');
    expect(transport).toHaveBeenCalledTimes(4);
  });
});
