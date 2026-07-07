import { AsyncLocalStorage } from "node:async_hooks";
import type { FlowLogger } from "@/lib/voice/flow-log";
import { summarizeForFlowLog } from "@/lib/voice/flow-log";

const flowStorage = new AsyncLocalStorage<FlowLogger>();

export function runWithFlowLogger<T>(flow: FlowLogger | null, fn: () => T): T {
  if (!flow) return fn();
  return flowStorage.run(flow, fn);
}

export function getFlowLogger(): FlowLogger | null {
  return flowStorage.getStore() ?? null;
}

/** Log a step when a flow logger is active (voice/booking audit). */
export function logFlowStep(label: string, detail?: Record<string, unknown>): void {
  getFlowLogger()?.step(label, detail);
}

/** Wrap an async function with start / end / error flow logs. */
export async function flowAsync<T>(
  label: string,
  fn: () => Promise<T>,
  detail?: unknown,
): Promise<T> {
  const detailObj =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? (detail as Record<string, unknown>)
      : detail !== undefined
        ? { value: detail }
        : undefined;
  logFlowStep(`${label}:start`, detailObj);
  try {
    const result = await fn();
    logFlowStep(`${label}:end`, { result: summarizeForFlowLog(result) });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logFlowStep(`${label}:error`, { error: message });
    throw err;
  }
}
