import type { Provider } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { InMemoryDeliveryAttemptRepository } from '../../adapters/persistence/in-memory-delivery-attempt.repository';
import type { PrismaDeliveryConnection } from '../../adapters/persistence/prisma/prisma-delivery-connection';
import { PrismaDeliveryWorkflowStore } from '../../adapters/persistence/prisma/prisma-delivery-workflow.store';
import { SendDeliveryAttemptUseCase } from '../../features/send-delivery-attempt/send-delivery-attempt.use-case';
import type { DeliveryProviderPort, NotificationPreferenceReaderPort } from '../../ports';
import { DELIVERY_PROVIDERS } from './delivery-webhook.providers';
import { deliveryWorkflowTiming, type DeliveryAttemptDispatchStore, type DeliveryAttemptExecutionStore } from '../../application/contracts/delivery-attempt-workflow';
import { DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, DELIVERY_NOTIFICATION_PREFERENCE_READER, type DeliveryPersistenceMode } from './delivery-provider-tokens';

export const DELIVERY_ATTEMPT_WORKFLOW = Symbol('DELIVERY_ATTEMPT_WORKFLOW');
export type DeliveryAttemptWorkflow = DeliveryAttemptDispatchStore & DeliveryAttemptExecutionStore;

export const deliveryWorkflowProviders: Provider[] = [{
  provide: DELIVERY_ATTEMPT_WORKFLOW,
  useFactory: (
    mode: DeliveryPersistenceMode,
    prisma: PrismaDeliveryConnection | null,
    memory: InMemoryDeliveryAttemptRepository,
  ): DeliveryAttemptWorkflow => {
    if (mode === 'in-memory') {
      return memory.workflow;
    }
    if (prisma === null) {
      throw new Error('Prisma delivery workflow requires the durable connection');
    }
    return new PrismaDeliveryWorkflowStore(prisma.workflow);
  },
  inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryDeliveryAttemptRepository],
}, {
  provide: SendDeliveryAttemptUseCase,
  useFactory: (
    workflow: DeliveryAttemptWorkflow,
    providers: readonly DeliveryProviderPort[],
    preferences: NotificationPreferenceReaderPort,
  ) => new SendDeliveryAttemptUseCase(workflow, providers, preferences, new SystemClock(), new CryptoIdGenerator(), deliveryWorkflowTiming),
  inject: [DELIVERY_ATTEMPT_WORKFLOW, DELIVERY_PROVIDERS, DELIVERY_NOTIFICATION_PREFERENCE_READER],
}];
