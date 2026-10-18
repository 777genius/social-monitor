import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { PrismaClient } from '../../prisma/generated/client/client';
import { readPublicDefaults } from './local-config';

async function main(): Promise<void> {
  const defaults = await readPublicDefaults();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, min: 0, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: false }) });
  const tenantId = defaults.SOCIAL_MONITOR_TENANT_ID;
  const workspaceId = defaults.SOCIAL_MONITOR_WORKSPACE_ID;
  const userId = defaults.SOCIAL_MONITOR_USER_ID;
  try {
    await withPrismaWriteRetry(() => prisma.$transaction(async (tx) => {
      await tx.tenant.upsert({ where: { id: tenantId }, update: {}, create: {
        id: tenantId, slug: 'personal', name: defaults.SOCIAL_MONITOR_TENANT_NAME,
      } });
      await tx.workspace.upsert({ where: { id: workspaceId }, update: {}, create: {
        id: workspaceId, tenantId, slug: 'my-news', name: defaults.SOCIAL_MONITOR_WORKSPACE_NAME,
      } });
      await tx.user.upsert({ where: { id: userId }, update: {}, create: {
        id: userId, tenantId, email: 'owner@localhost.invalid', displayName: defaults.SOCIAL_MONITOR_USER_LABEL,
      } });
      await tx.membership.upsert({ where: { tenantId_workspaceId_userId: { tenantId, workspaceId, userId } },
        update: {}, create: { id: randomUUID(), tenantId, workspaceId, userId, role: 'OWNER' } });
    }, { isolationLevel: 'Serializable' }));
    console.log('Local owner and workspace ready.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch(() => {
  console.error('Workspace initialization failed. Check database health and migration status.');
  process.exitCode = 1;
});
