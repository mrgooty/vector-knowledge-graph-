import { withTimeout } from "@/lib/util/withTimeout";
import type { NormalizedDoc, Provider } from "@/lib/types";
import { fetchEuropePmc } from "@/lib/sources/europepmc";
import { fetchOpenAlex } from "@/lib/sources/openalex";
import { fetchArxiv } from "@/lib/sources/arxiv";
import { fetchStackOverflow } from "@/lib/sources/stackoverflow";

// A single specialized source worker. Each owns one upstream API, fetches with
// a hard timeout, and reports timing — so the supervisor can run them all in
// parallel and never wait on a straggler.

const FETCHERS: Partial<
  Record<Provider, (q: string, limit: number) => Promise<NormalizedDoc[]>>
> = {
  europepmc: fetchEuropePmc,
  openalex: fetchOpenAlex,
  arxiv: fetchArxiv,
  stackoverflow: fetchStackOverflow,
};

const DEFAULT_TIMEOUT_MS = 9000;

export interface WorkerResult {
  provider: Provider;
  docs: NormalizedDoc[];
  fetched: number;
  ms: number;
  error?: string;
}

export async function runSourceWorker(
  provider: Provider,
  query: string,
  limit: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WorkerResult> {
  const start = Date.now();
  const fetcher = FETCHERS[provider];
  if (!fetcher) {
    return { provider, docs: [], fetched: 0, ms: 0, error: "unknown source" };
  }
  try {
    const docs = await withTimeout(fetcher(query, limit), timeoutMs, provider);
    return { provider, docs, fetched: docs.length, ms: Date.now() - start };
  } catch (err) {
    return {
      provider,
      docs: [],
      fetched: 0,
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
