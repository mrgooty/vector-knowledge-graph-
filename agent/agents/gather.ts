import { planSources } from "./router";
import { runSourceWorker, type WorkerResult } from "./sourceWorker";
import type { NormalizedDoc } from "@/lib/types";

export interface GatherResult {
  docs: NormalizedDoc[];
  workers: WorkerResult[];
}

/**
 * Gather supervisor: plans which source workers to deploy, then runs them all
 * in parallel. Failures/timeouts are isolated per worker.
 */
export async function gatherSupervisor(
  query: string,
  timeoutMs?: number,
): Promise<GatherResult> {
  const plan = planSources(query);
  const workers = await Promise.all(
    plan.map((p) => runSourceWorker(p.provider, query, p.limit, timeoutMs)),
  );
  return { docs: workers.flatMap((w) => w.docs), workers };
}
