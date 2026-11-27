import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { PrismaReaderSummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository';
import { ReaderSummaryPolicy } from '@social-monitor/summary/domain';

import { fairnessNow, fairnessPolicy } from './support/periodic-reader-summary-fairness-fixture';
import { FakePrismaSummaryClient } from '../scripts/lib/fake-prisma-summary-client';

describe('Prisma reader summary policy keyset contract', () => {
  it('pages by immutable id and remains stable after a policy timestamp edit', async () => {
    const prisma = new FakePrismaSummaryClient();
    const repository = new PrismaReaderSummaryPolicyRepository(prisma);
    const policies = ['a', 'b', 'c'].map((id) => fairnessPolicy(id));
    for (const policy of policies) await repository.save(policy);
    const first = await repository.listScheduled({ limit: 2 });
    expect(first.map((policy) => policy.toSnapshot().id)).toEqual(['a', 'b']);
    await repository.save(ReaderSummaryPolicy.create({
      ...policies[0]!.toSnapshot(), updatedAt: new Date(fairnessNow.getTime() + 1_000),
    }));
    const query = jest.spyOn(prisma.readerSummaryPolicy, 'findMany');
    const next = await repository.listScheduled({ limit: 2, cursor: { policyId: 'b', inclusive: false } });
    expect(next.map((policy) => policy.toSnapshot().id)).toEqual(['c']);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ scheduleEnabled: true, id: { gt: 'b' } }),
      orderBy: [{ id: 'asc' }], take: 2,
    }));
  });

  it('includes the partial policy on resume and keeps the requested tenant scope', async () => {
    const prisma = new FakePrismaSummaryClient();
    const repository = new PrismaReaderSummaryPolicyRepository(prisma);
    for (const id of ['a', 'b']) await repository.save(fairnessPolicy(id));
    const policies = await repository.listScheduled({
      tenantId: tenantId('tenant-a'), workspaceId: workspaceId('workspace-a'),
      limit: 1, cursor: { policyId: 'a', inclusive: true },
    });
    expect(policies.map((policy) => policy.toSnapshot().id)).toEqual(['a']);
    await expect(repository.listScheduled({ tenantId: tenantId('tenant-a'), limit: 1 }))
      .rejects.toThrow('scope must include tenant and workspace');
  });
});
