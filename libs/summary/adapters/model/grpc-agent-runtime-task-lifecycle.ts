import type { ClientUnaryCall, ServiceError } from "@grpc/grpc-js";
import type { AgentRuntimeTaskResponse } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import type { AgentRuntimeTaskResult } from "../../ports";

/**
 * Owns exactly-once settlement and cancellation of a unary task, including
 * aborts that occur synchronously before the transport returns its call handle.
 * The caller retains scoped request construction, deadlines and strict decoding.
 */
export const runGrpcAgentRuntimeTaskLifecycle = (params: {
  readonly signal: AbortSignal | undefined;
  readonly dispatch: (
    callback: (error: ServiceError | null, response: AgentRuntimeTaskResponse) => void,
  ) => ClientUnaryCall;
  readonly decode: (response: AgentRuntimeTaskResponse) => AgentRuntimeTaskResult;
}): Promise<AgentRuntimeTaskResult> => {
  const signal = params.signal;
  const hasAborted = (): boolean => signal?.aborted === true;
  return new Promise((resolve, reject) => {
    let call: ClientUnaryCall | undefined;
    let settled = false;
    let cancellationRequested = false;
    let transportCancelled = false;
    const finish = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      complete();
    };
    const cancelTransport = (): void => {
      if (call === undefined || transportCancelled) return;
      transportCancelled = true;
      try {
        call.cancel();
      } catch {
        // Cancellation rejection has priority over a throwing transport.
      }
    };
    const abort = (): void => {
      cancellationRequested = true;
      finish(() => reject(new Error("Agent runtime gRPC task was cancelled")));
      cancelTransport();
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (hasAborted()) {
      abort();
      return;
    }

    try {
      call = params.dispatch((error, response) => {
        if (settled) return;
        if (error !== null) {
          finish(() => reject(error));
          return;
        }
        try {
          const result = params.decode(response);
          finish(() => resolve(result));
        } catch (parseError) {
          finish(() => reject(parseError));
        }
      });
      // A synchronous abort during dispatch still cancels the returned handle.
      if (cancellationRequested || (!settled && hasAborted())) {
        if (!cancellationRequested) abort();
        else cancelTransport();
      }
    } catch (error) {
      finish(() => reject(error));
    }
  });
};
