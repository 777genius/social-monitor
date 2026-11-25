import {
  resolveDeliveryEnabledChannels,
  resolveDeliveryPersistenceMode,
  resolveDeliveryWebhookProviderMode,
} from "@social-monitor/delivery/interfaces/rest/delivery-provider-tokens";
import { resolveFeedPersistenceMode } from "@social-monitor/feed/interfaces/rest/feed-provider-tokens";
import { resolveIdentityPersistenceMode } from "@social-monitor/identity/interfaces/rest/identity-provider-tokens";
import { resolveIngestionSupportPersistenceMode } from "@social-monitor/ingestion/interfaces/rest/ingestion-provider-tokens";
import {
  resolveMonitoringPersistenceMode,
  resolveMonitoringScanQueueMode,
} from "@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens";
import { resolveRelevancePersistenceMode } from "@social-monitor/relevance/interfaces/rest/relevance-provider-tokens";
import { resolveSubscriptionsPersistenceMode } from "@social-monitor/subscriptions/interfaces/rest/subscriptions-provider-tokens";
import {
  resolveSummaryJobQueueMode,
  resolveSummaryPersistenceMode,
} from "@social-monitor/summary/interfaces/rest/summary-provider-tokens";
import { resolveUsagePersistenceMode } from "@social-monitor/usage/interfaces/rest/usage-provider-tokens";

import {
  resolveDeliveryAttemptDispatchLoopOptions,
  resolveDeliveryAttemptDispatchQueueMode,
  resolveDeliveryAttemptQueueDrainLoopOptions,
  resolveDeliveryAttemptQueueReaderMode,
  resolveDeliveryDigestSchedulerLoopOptions,
  resolveDeliverySummaryReadyEventDrainLoopOptions,
  resolveDeliverySummaryReadyEventReaderMode,
} from "../../delivery-service/src/delivery-service-provider-tokens";
import { resolveEventRelayLoopOptions } from "../../event-relay/src/event-relay-provider-tokens";
import {
  resolveIngestionScanQueueDrainLoopOptions,
  resolveIngestionScanQueueReaderMode,
  resolveIngestionScanSchedulerLoopOptions,
} from "../../ingestion-worker/src/ingestion-worker-provider-tokens";
import {
  resolveIntelligenceSummaryJobLoopOptions,
  resolveIntelligenceSummaryQueueDrainLoopOptions,
  resolveIntelligenceSummaryQueueReaderMode,
} from "../../intelligence-worker/src/intelligence-worker-provider-tokens";
import { resolveSocialResearchRuntimeSettings } from "../../social-research-runtime/src/social-research-runtime-settings";

export function apiGatewayUsesPrismaPersistence(env: NodeJS.ProcessEnv): boolean {
  return [
    resolveMonitoringPersistenceMode(env),
    resolveFeedPersistenceMode(env),
    resolveIngestionSupportPersistenceMode(env),
    resolveSummaryPersistenceMode(env),
    resolveDeliveryPersistenceMode(env),
    resolveIdentityPersistenceMode(env),
    resolveUsagePersistenceMode(env),
    resolveRelevancePersistenceMode(env),
    resolveSubscriptionsPersistenceMode(env),
    resolveSocialResearchRuntimeSettings(env).resultCache.mode,
  ].includes("prisma");
}

const loopMode = (enabled: boolean): 'enabled' | 'disabled' =>
  enabled ? 'enabled' : 'disabled';

/** The API readiness read-model resolves runtime selectors but never starts workers. */
export function readApiGatewayRuntimeModes(env: NodeJS.ProcessEnv) {
    const persistence = {
      monitoring: resolveMonitoringPersistenceMode(env),
      feed: resolveFeedPersistenceMode(env),
      ingestionSupport: resolveIngestionSupportPersistenceMode(env),
      summary: resolveSummaryPersistenceMode(env),
      delivery: resolveDeliveryPersistenceMode(env),
      identity: resolveIdentityPersistenceMode(env),
      usage: resolveUsagePersistenceMode(env),
    };
    const workerLoops = {
      ingestionScanScheduler: loopMode(
        resolveIngestionScanSchedulerLoopOptions(env).enabled,
      ),
      ingestionScanQueueDrain: loopMode(
        resolveIngestionScanQueueDrainLoopOptions(env).enabled,
      ),
      intelligenceSummaryJob: loopMode(
        resolveIntelligenceSummaryJobLoopOptions(env).enabled,
      ),
      intelligenceSummaryQueueDrain: loopMode(
        resolveIntelligenceSummaryQueueDrainLoopOptions(env).enabled,
      ),
      deliveryDigestScheduler: loopMode(
        resolveDeliveryDigestSchedulerLoopOptions(env).enabled,
      ),
      deliveryAttemptDispatch: loopMode(
        resolveDeliveryAttemptDispatchLoopOptions(env).enabled,
      ),
      deliveryAttemptQueueDrain: loopMode(
        resolveDeliveryAttemptQueueDrainLoopOptions(env).enabled,
      ),
      deliverySummaryReadyEventDrain: loopMode(
        resolveDeliverySummaryReadyEventDrainLoopOptions(env).enabled,
      ),
      eventRelay: loopMode(resolveEventRelayLoopOptions(env).enabled),
    };
    const queues = {
      monitoringScanPublisher: resolveMonitoringScanQueueMode(env),
      ingestionScanReader: resolveIngestionScanQueueReaderMode(env),
      summaryJobPublisher: resolveSummaryJobQueueMode(env),
      intelligenceSummaryReader: resolveIntelligenceSummaryQueueReaderMode(
        env,
      ),
      deliveryAttemptPublisher: resolveDeliveryAttemptDispatchQueueMode(
        env,
      ),
      deliveryAttemptReader: resolveDeliveryAttemptQueueReaderMode(env),
      deliverySummaryReadyEventReader:
        resolveDeliverySummaryReadyEventReaderMode(env),
    };
    const providers = {
      deliveryWebhook: resolveDeliveryWebhookProviderMode(env),
      deliveryEnabledChannels: resolveDeliveryEnabledChannels(env).join(
        ",",
      ),
    };
    return { persistence, workerLoops, queues, providers };
}
