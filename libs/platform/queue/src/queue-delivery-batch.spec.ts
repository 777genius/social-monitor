import { QueueDeliveryBatch } from './queue-delivery-batch';

const delivery = () => ({
  diagnostics: { redelivered: false, deadLetterCount: 0 },
  ack: jest.fn(async (): Promise<void> => undefined),
  nack: jest.fn(async (_params: { readonly requeue: boolean }) => { void _params; }),
});

describe('queue batch settlement ownership', () => {
  it('waits for in-flight settlement and never releases a successfully acknowledged delivery', async () => {
    const acquired = delivery();
    let finish!: () => void;
    acquired.ack.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const batch = new QueueDeliveryBatch([acquired]);
    const acknowledgement = batch.ack(acquired);
    await expect(batch.nack(acquired, { requeue: true })).rejects.toThrow('not pending');
    const cleanup = batch.releaseUnsettled();
    finish();
    await acknowledgement;
    expect(await cleanup).toEqual([]);
    expect(acquired.nack).not.toHaveBeenCalled();
  });

  it('keeps a failed release owned for a later cleanup attempt and still releases siblings', async () => {
    const first = delivery();
    const second = delivery();
    first.nack.mockRejectedValueOnce(new Error('synthetic release failure'));
    const batch = new QueueDeliveryBatch([first, second]);
    expect(await batch.releaseUnsettled()).toEqual([expect.objectContaining({ message: 'synthetic release failure' })]);
    expect(second.nack).toHaveBeenCalledTimes(1);
    expect(await batch.releaseUnsettled()).toEqual([]);
    expect(first.nack).toHaveBeenCalledTimes(2);
    expect(second.nack).toHaveBeenCalledTimes(1);
  });
});
