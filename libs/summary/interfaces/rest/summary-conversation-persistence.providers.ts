import { InMemoryConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/in-memory-conversation-unit.repository";
import { PrismaConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository";
import {
  CONVERSATION_SIGNAL_BASELINE_REPOSITORY,
  CONVERSATION_UNIT_REPOSITORY,
  type ConversationSignalBaselineRepositoryPort,
  type ConversationUnitRepositoryPort,
} from "@social-monitor/conversation/ports";
import { CryptoIdGenerator } from "@social-monitor/shared-kernel";

import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import {
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_PRISMA_CLIENT,
  type SummaryPersistenceMode,
} from "./summary-provider-tokens";

export const summaryConversationPersistenceProviders = [
  InMemoryConversationUnitRepository,
  {
    provide: CONVERSATION_UNIT_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryConversationUnits: InMemoryConversationUnitRepository,
    ): ConversationUnitRepositoryPort =>
      mode === "prisma"
        ? new PrismaConversationUnitRepository(
            requirePrismaSummaryClient(prisma),
            new CryptoIdGenerator(),
          )
        : inMemoryConversationUnits,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryConversationUnitRepository,
    ],
  },
  {
    provide: CONVERSATION_SIGNAL_BASELINE_REPOSITORY,
    useFactory: (
      mode: SummaryPersistenceMode,
      prisma: PrismaSummaryClient | null,
      inMemoryConversationUnits: InMemoryConversationUnitRepository,
    ): ConversationSignalBaselineRepositoryPort =>
      mode === "prisma"
        ? new PrismaConversationUnitRepository(
            requirePrismaSummaryClient(prisma),
            new CryptoIdGenerator(),
          )
        : inMemoryConversationUnits,
    inject: [
      SUMMARY_PERSISTENCE_MODE,
      SUMMARY_PRISMA_CLIENT,
      InMemoryConversationUnitRepository,
    ],
  },
];

const requirePrismaSummaryClient = (
  client: PrismaSummaryClient | null,
): PrismaSummaryClient => {
  if (client === null) {
    throw new Error(
      "Prisma summary client is required when SUMMARY_PERSISTENCE=prisma",
    );
  }

  return client;
};
