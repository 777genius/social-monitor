import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryDigestScheduleRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-digest-schedule.repository';
import { PrismaDigestScheduleRepository } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-digest-schedule.repository';
import { DigestSchedule } from '@social-monitor/delivery/domain';
import type { DigestScheduleRepositoryPort } from '@social-monitor/delivery/ports';

import { FakePrismaDeliveryClient } from '../scripts/lib/fake-prisma-delivery-client';

const dueAt = new Date('2026-11-27T01:00:00.000Z');
const scope = { tenantId: tenantId('tenant-one'), workspaceId: workspaceId('workspace-one') };
const schedule = (id: string, nextRunAt = dueAt) => DigestSchedule.create({
  ...scope,
  id,
  recipientKey: 'recipient-' + id,
  channel: 'in_app',
  interestIds: ['interest'],
  intervalSeconds: 3_600,
  includeNoSignal: false,
  nextRunAt,
  createdAt: new Date('2026-11-27T00:00:00.000Z'),
});

describe.each([
  ['memory', () => new InMemoryDigestScheduleRepository()],
  ['prisma adapter', () => new PrismaDigestScheduleRepository(new FakePrismaDeliveryClient())],
] as const)('due digest keyset: %s', (_name, create) => {
  it('uses due time and ID ties while retaining scope and status predicates', async () => {
    const repository: DigestScheduleRepositoryPort = create();
    for (const id of ['a', 'b']) await repository.save(schedule(id));
    const later = new Date('2026-11-27T01:30:00.000Z');
    await repository.save(schedule('c', later));
    await repository.save(schedule('future', new Date('2026-11-27T03:00:00.000Z')));
    await repository.save(DigestSchedule.create({ ...schedule('disabled').toSnapshot(), status: 'disabled' }));
    await repository.save(DigestSchedule.create({
      ...schedule('foreign').toSnapshot(), tenantId: tenantId('other-tenant'),
    }));

    const first = await repository.findDue({ ...scope, now: later, limit: 1 });
    expect(first.map((item) => item.toSnapshot().id)).toEqual(['a']);
    const second = await repository.findDue({
      ...scope, now: later, limit: 2, cursor: { id: 'a', nextRunAt: dueAt },
    });
    expect(second.map((item) => item.toSnapshot().id)).toEqual(['b', 'c']);
    // Moving a visited row behind the cursor does not change the next page.
    await repository.save(schedule('a', new Date('2026-11-27T00:30:00.000Z')));
    const next = await repository.findDue({
      ...scope, now: later, limit: 1, cursor: { id: 'b', nextRunAt: dueAt },
    });
    expect(next.map((item) => item.toSnapshot().id)).toEqual(['c']);
  });
});

it('passes the due-time keyset to Prisma alongside tenant and workspace predicates', async () => {
  const prisma = new FakePrismaDeliveryClient();
  const findMany = jest.spyOn(prisma.digestSchedule, 'findMany');
  await new PrismaDigestScheduleRepository(prisma).findDue({
    ...scope, now: dueAt, limit: 1, cursor: { nextRunAt: dueAt, id: 'schedule-a' },
  });
  expect(findMany).toHaveBeenCalledWith({
    where: {
      ...scope,
      status: 'ENABLED',
      nextRunAt: { lte: dueAt },
      OR: [
        { nextRunAt: { gt: dueAt } },
        { nextRunAt: dueAt, id: { gt: 'schedule-a' } },
      ],
    },
    orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
    take: 1,
  });
});
