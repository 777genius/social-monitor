export const resolveIntelligenceSummaryQueueNames = (env: NodeJS.ProcessEnv) => ({
  summary: env.RABBITMQ_SUMMARY_QUEUE?.trim() || "jobs.summary.execute",
  readerSummary: (
    env.RABBITMQ_READER_SUMMARY_QUEUE ?? env.RABBITMQ_BRIEFING_QUEUE
  )?.trim() || "jobs.reader-summary.execute",
});

export const assertDistinctIntelligenceSummaryQueueNames = (
  env: NodeJS.ProcessEnv,
): void => {
  const queues = resolveIntelligenceSummaryQueueNames(env);
  if (queues.summary === queues.readerSummary) {
    throw new Error(
      "RABBITMQ_SUMMARY_QUEUE and RABBITMQ_READER_SUMMARY_QUEUE (or RABBITMQ_BRIEFING_QUEUE) must resolve to different queues",
    );
  }
};
