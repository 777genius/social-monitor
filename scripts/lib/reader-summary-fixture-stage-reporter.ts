import { performance } from "node:perf_hooks";

export type ReaderSummaryFixtureStartupStage =
  | "module_runtime_entry"
  | "pglite_construction_start"
  | "pglite_construction_end"
  | "pglite_socket_start"
  | "pglite_socket_started"
  | "prisma_db_push_start"
  | "prisma_db_push_end"
  | "nest_module_compile_start"
  | "nest_module_compile_end"
  | "nest_app_create"
  | "seeding_start"
  | "seeding_end"
  | "http_listen_start"
  | "http_listening"
  | "ready";

const startedAt = performance.now();

export const emitReaderSummaryFixtureStage = (
  stage: ReaderSummaryFixtureStartupStage,
): void => {
  process.stdout.write(`${JSON.stringify({
    status: "stage",
    stage,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
  })}\n`);
};

emitReaderSummaryFixtureStage("module_runtime_entry");
